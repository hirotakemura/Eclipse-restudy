/**
 * KOBO — 原稿生成のパイプライン
 *
 *   ページごとに生成 → 事実検証 → 問題があれば指摘して書き直し → それでも駄目なら止める
 *
 * **生成物はそのまま納品しません。** これは原稿の第1稿であって、商品ではない（D-013）。
 * 検証を通っても、最後は人間が読みます。
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Project } from "../schema.ts";
import { verifyDraft, hasBlockingError, type Finding } from "../verify.ts";
import { decidePages, type PageSpec } from "./pages.ts";
import { analyze } from "../design/analysis.ts";
import { composeTop, composePage, type Section } from "../design/sections.ts";
import { resolveTheme } from "../theme.ts";
import { SYSTEM_RULES, projectContext, pagePrompt, retryPrompt } from "./prompts.ts";
import { writerView } from "./writer-view.ts";

export interface PageResult {
  page: PageSpec;
  markdown: string;
  findings: Finding[];
  /** 書き直した回数 */
  retries: number;
  /** error が残っているか。true なら人間が直すまで先に進めない */
  blocked: boolean;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface GenerateOptions {
  model?: string;
  /** 検証で弾かれたときに書き直す回数 */
  maxRetries?: number;
  onProgress?: (message: string) => void;
}

/** Claude Opus 5。原稿の質が商品そのものなので、安いモデルに落とさない（D-019） */
const DEFAULT_MODEL = "claude-opus-5";

export async function generateSite(
  project: Project,
  opts: GenerateOptions = {},
): Promise<PageResult[]> {
  const { model = DEFAULT_MODEL, maxRetries = 2, onProgress = () => {} } = opts;
  const client = new Anthropic();

  /**
   * **原稿を書く側は、この `source` しか見ない**（D-253）。
   *
   * 社内向けの欄と、答えてもらえなかったときの発言は、ここで落ちている。
   * 検証（`verifyDraft`）も同じ `source` を出典とする。
   * 元データを出典にすると、**渡していない欄から書かれた文章が「出典あり」で通ってしまう。**
   * 渡したものだけが出典である、を機械で守る。
   */
  const source = writerView(project);

  const pages = decidePages(source);
  const context = projectContext(source);
  const results: PageResult[] = [];

  /**
   * **構成を先に決めてから、原稿を書く**（D-193）。
   *
   * これまでは、どのセクションがどの順で出るかを知らないまま原稿を書いていた。
   * その結果、すぐ下に材質の札が出ているのに原稿でも材質を並べる、が起きていた。
   * 書き出し（build-site.mjs）と同じ関数を使うので、**画面と原稿がずれない。**
   */
  const analysis = analyze(source);
  const resolved = resolveTheme(project.theme, (project as any).formSet === "general" ? "general" : "manufacturing");
  /** 画面の構成は、AI版の判断（あれば）込みで決まる。**writerView は designBrief を落とすので、元から取る** */
  const brief = (project as any).designBrief;
  const direction = resolved.direction;
  /**
   * **原稿を書く人に、その画面にすでに出ているものを伝える**（D-193）。
   *
   * 13ページ全部が帯で組まれるようになったので（D-301）、ここも全部を返す。
   * 返さないページがあると、**すぐ下に出ている表を、原稿でもう一度並べる**ことになる。
   */
  const layoutOf = (slug: string): { sections: Section[]; analysis: typeof analysis; direction?: string } | undefined => {
    let sections: Section[] = [];
    const caseNo = /^case-(\d+)$/.exec(slug);
    if (slug === "index") {
      sections = composeTop(source, analysis, { hero: resolved.hero.id, direction, hasProse: true, brief });
    } else if (slug === "strengths" || slug === "capability" || slug === "equipment"
            || slug === "cases" || slug === "company" || slug === "message" || slug === "recruit" || slug === "contact") {
      sections = composePage(slug, source, analysis, { direction, hasProse: true });
    } else if (caseNo) {
      /** 事例の個別ページは、**その1件だけ**を渡す（画面と同じ数え方・D-302） */
      const one = ((source as any).cases ?? [])[Number(caseNo[1]) - 1];
      if (one) {
        const only = { ...(source as any), caseDetail: true, cases: [one] };
        sections = composePage("case", only, analysis, { direction, hasProse: true });
      }
    }
    return sections.length ? { sections, analysis, direction } : undefined;
  };

  for (const [i, page] of pages.entries()) {
    onProgress(`[${i + 1}/${pages.length}] ${page.title}`);

    // 共通ルールと案件データはページ間で変わらないので、キャッシュに載せる。
    // 12ページ生成しても、この部分の課金は初回の1回分で済む
    const history: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "text", text: context, cache_control: { type: "ephemeral" } },
          { type: "text", text: pagePrompt(page, source, layoutOf(page.slug)) },
        ],
      },
    ];

    let markdown = "";
    let findings: Finding[] = [];
    let retries = 0;
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

    for (;;) {
      const stream = client.messages.stream({
        model,
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM_RULES, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "high" },
        messages: history,
      });
      const message = await stream.finalMessage();

      usage.input += message.usage.input_tokens;
      usage.output += message.usage.output_tokens;
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      // **キャッシュへの書き込みには割増がある。** 数えていないと費用を低く見せる（D-196）
      usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

      markdown = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      findings = verifyDraft(markdown, source);
      const errors = findings.filter((f) => f.severity === "error");
      if (errors.length === 0 || retries >= maxRetries) break;

      onProgress(`    出典のない記述が ${errors.length}件。書き直します（${retries + 1}回目）`);
      history.push({ role: "assistant", content: markdown });
      history.push({ role: "user", content: retryPrompt(errors) });
      retries++;
    }

    const blocked = hasBlockingError(findings);
    if (blocked) {
      onProgress(`    ⚠ 出典のない記述が残りました。人間の確認が必要です`);
    }
    results.push({ page, markdown, findings, retries, blocked, usage });
  }

  return results;
}

/**
 * 1ドル=155円で概算。**為替は変動する。**
 *
 * 単価（Claude Opus 5・2026年9月時点）：
 *   入力              $5 / 100万トークン
 *   出力              $25 / 100万トークン　※**考えている分も出力として課金される**
 *   キャッシュ読み出し  $0.5 / 100万トークン（入力の 0.1倍）
 *   キャッシュ書き込み  $6.25 / 100万トークン（入力の 1.25倍・5分の保持）
 *
 * **書き込みの割増を数えていなかった**ので、費用を低く見せていた（D-196）。
 */
const PRICE = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } as const;

export function estimateCost(results: PageResult[], usdJpy = 155): number {
  const t = results.reduce(
    (a, r) => ({
      input: a.input + r.usage.input,
      output: a.output + r.usage.output,
      cacheRead: a.cacheRead + r.usage.cacheRead,
      cacheWrite: a.cacheWrite + r.usage.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const usd =
    (t.input / 1e6) * PRICE.input +
    (t.output / 1e6) * PRICE.output +
    (t.cacheRead / 1e6) * PRICE.cacheRead +
    (t.cacheWrite / 1e6) * PRICE.cacheWrite;
  return usd * usdJpy;
}

/** 何にいくらかかったかの内訳。**合計だけ見せない** */
export function costBreakdown(results: PageResult[], usdJpy = 155): string {
  const t = results.reduce(
    (a, r) => ({
      input: a.input + r.usage.input,
      output: a.output + r.usage.output,
      cacheRead: a.cacheRead + r.usage.cacheRead,
      cacheWrite: a.cacheWrite + r.usage.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const yen = (tokens: number, price: number) => Math.round((tokens / 1e6) * price * usdJpy);
  const rows: [string, number, number][] = [
    ["入力（毎回送る分）", t.input, PRICE.input],
    ["出力（考えている分を含む）", t.output, PRICE.output],
    ["キャッシュ読み出し", t.cacheRead, PRICE.cacheRead],
    ["キャッシュ書き込み", t.cacheWrite, PRICE.cacheWrite],
  ];
  return rows
    .map(([label, tokens, price]) => `    ${label.padEnd(16)} ${String(tokens).padStart(8)}トークン　約${yen(tokens, price)}円`)
    .join("\n");
}
