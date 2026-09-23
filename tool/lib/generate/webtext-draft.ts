/**
 * KOBO — 掲載文の下書きをAIに書かせる（D-466）
 *
 *   取材の言葉（出典）→ AIが欄ごとに下書き → 検査 → 通らなければ書き直し → それでも駄目なら人へ
 *
 * **ここが書くのは下書きだけである。** 画面に出るのは、人が読んで印を置いた文だけ
 * （`reviewedAt`・D-401）。この層は `reviewedAt` を**一度も書かない**。
 *
 * 形はページ本文の生成（`pipeline.ts`）とそろえてある——同じモデル、共通の指示はキャッシュ、
 * 事実の照合で落ちたら指摘を渡して書き直す。**違うのは単位が「欄」であること**だけ。
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Project } from "../schema.ts";
import type { Finding } from "../verify.ts";
import type { WebTextField } from "../webtext-review.ts";
import { styleOf, COMMON_RULES } from "../webtext-style.ts";
import { checkWebText } from "../webtext-check.ts";

/** 原稿の質が商品そのものなので、安いモデルに落とさない（D-019・`pipeline.ts` と同じ） */
export const DEFAULT_MODEL = "claude-opus-5";

/**
 * **全欄で同じ指示。** 欄ごとに変わるのは下の `fieldPrompt` だけなので、ここはキャッシュに載る。
 * 型（`webtext-style.ts`）から組み立てる——**指示と検査が同じ表を見る。**
 */
export const WEBTEXT_SYSTEM = [
  "あなたは、BtoBの中小製造業のコーポレートサイトに載せる文を整えます。",
  "渡されるのは、取材で聞き取った言葉です。これを、そのサイトの1つの欄に載せる文に整えてください。",
  "",
  "## 守ること",
  `- ${COMMON_RULES.facts}`,
  `- ${COMMON_RULES.exaggeration}`,
  `- ${COMMON_RULES.tone}`,
  "- 取材の言葉に含まれる数字・単位・固有名詞は、書くなら一字一句そのまま使う",
  "- 分からないことを推測で埋めない。書けない部分は書かずに短くする",
  "",
  "## 載せない話（取材では聞くが、発注を考えている人には要らない）",
  ...COMMON_RULES.drop.map((d) => `- ${d}`),
  "",
  "## 出力",
  "- 整えた文だけを出してください。前置き・説明・見出し・引用符は付けないでください",
].join("\n");

export function fieldPrompt(field: WebTextField, project: Project): string {
  const style = styleOf(field.key);
  return [
    `会社名：${(project as any)?.basics?.name ?? ""}`,
    `欄：${field.label}`,
    style ? `画面での役割：${style.role}` : "",
    style ? `長さの目安：${style.maxChars}字まで` : "",
    ...(style?.notes ?? []).map((n) => `この欄の注意：${n}`),
    field.help ? `取材で聞いた質問：${field.help}` : "",
    "",
    "取材の言葉：",
    field.raw.trim(),
  ].filter((l) => l !== "").join("\n");
}

/** 検査の指摘を、書き直しの依頼にする。**error だけ渡す**（warn は人が判断する） */
export const retryPrompt = (errors: Finding[]): string => [
  "次の点が、取材の言葉と合っていません。取材の言葉にある事実だけで書き直してください。",
  ...errors.map((e) => `- 「${e.found}」：${e.message}`),
].join("\n");

export interface DraftResult {
  key: string;
  text: string;
  findings: Finding[];
  retries: number;
  /** error が残ったか。**残ったら下書きとして渡さず、人が書く** */
  blocked: boolean;
  /** 安全の理由で書かれなかったか */
  refused: boolean;
}

/** テストで差し替えられるように、呼ぶ口は `beta.messages.create` 1つだけに絞る */
export type DraftClient = Pick<Anthropic, "beta">;

export async function draftWebText(
  fields: WebTextField[],
  project: Project,
  opts: { client?: DraftClient; model?: string; maxRetries?: number; onProgress?: (m: string) => void } = {},
): Promise<DraftResult[]> {
  const { client = new Anthropic(), model = DEFAULT_MODEL, maxRetries = 2, onProgress = () => {} } = opts;
  const out: DraftResult[] = [];

  for (const [i, field] of fields.entries()) {
    onProgress(`[${i + 1}/${fields.length}] ${field.key}　${field.label}`);
    const history: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: fieldPrompt(field, project) },
    ];
    let text = "", findings: Finding[] = [], retries = 0, refused = false;

    for (;;) {
      const message = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        system: [{ type: "text", text: WEBTEXT_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "high" },
        /**
         * **断られたときは、同じ依頼を別のモデルで続ける**（サーバー側の fallback）。
         * それでも断られたら、その欄は人が書く。
         */
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        messages: history,
      });
      if (message.stop_reason === "refusal") { refused = true; break; }

      text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text).join("\n").trim();
      findings = checkWebText(field.key, text, project);
      const errors = findings.filter((f) => f.severity === "error");
      if (!errors.length || retries >= maxRetries) break;

      onProgress(`    取材の言葉に無い記述が ${errors.length}件。書き直します（${retries + 1}回目）`);
      history.push({ role: "assistant", content: text });
      history.push({ role: "user", content: retryPrompt(errors) });
      retries++;
    }
    const blocked = refused || findings.some((f) => f.severity === "error");
    out.push({ key: field.key, text: blocked ? "" : text, findings, retries, blocked, refused });
  }
  return out;
}
