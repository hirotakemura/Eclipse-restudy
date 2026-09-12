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
import { SYSTEM_RULES, projectContext, pagePrompt, retryPrompt } from "./prompts.ts";

export interface PageResult {
  page: PageSpec;
  markdown: string;
  findings: Finding[];
  /** 書き直した回数 */
  retries: number;
  /** error が残っているか。true なら人間が直すまで先に進めない */
  blocked: boolean;
  usage: { input: number; output: number; cacheRead: number };
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
  const pages = decidePages(project);
  const context = projectContext(project);
  const results: PageResult[] = [];

  for (const [i, page] of pages.entries()) {
    onProgress(`[${i + 1}/${pages.length}] ${page.title}`);

    // 共通ルールと案件データはページ間で変わらないので、キャッシュに載せる。
    // 12ページ生成しても、この部分の課金は初回の1回分で済む
    const history: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "text", text: context, cache_control: { type: "ephemeral" } },
          { type: "text", text: pagePrompt(page, project) },
        ],
      },
    ];

    let markdown = "";
    let findings: Finding[] = [];
    let retries = 0;
    const usage = { input: 0, output: 0, cacheRead: 0 };

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

      markdown = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      findings = verifyDraft(markdown, project);
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

/** 1ドル=155円で概算。為替は変動する */
export function estimateCost(results: PageResult[], usdJpy = 155): number {
  const t = results.reduce(
    (a, r) => ({
      input: a.input + r.usage.input,
      output: a.output + r.usage.output,
      cacheRead: a.cacheRead + r.usage.cacheRead,
    }),
    { input: 0, output: 0, cacheRead: 0 },
  );
  // Claude Opus 5: 入力 $5 / 出力 $25 / 100万トークン。キャッシュ読み出しは入力より安い
  const usd = (t.input / 1e6) * 5 + (t.output / 1e6) * 25 + (t.cacheRead / 1e6) * 0.5;
  return usd * usdJpy;
}
