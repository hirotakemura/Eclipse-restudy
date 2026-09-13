/**
 * KOBO — 原稿生成
 *
 *   npm run generate -- matsubara-seiki
 *
 * 生成結果は projects/<案件ID>/draft/ に書き出す（Git管理外）。
 * **生成物は原稿の第1稿であって、商品ではない。** 必ず人間が読んでから先に進むこと。
 */
import fs from "node:fs";
import path from "node:path";

const id = process.argv[2];
if (!id) {
  console.error("使い方: npm run generate -- <案件ID>\n例:     npm run generate -- matsubara-seiki");
  process.exit(1);
}

const file = path.join("projects", id, "project.json");
if (!fs.existsSync(file)) {
  console.error(`案件が見つかりません: ${file}`);
  process.exit(1);
}

const key = process.env.ANTHROPIC_API_KEY;

if (!key && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("\n  Anthropic API の認証情報が見つかりません。\n");
  console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...\n");
  console.error("  を設定してから実行してください。");
  console.error("  キーは https://console.anthropic.com → Settings → API keys で作れます。\n");
  process.exit(1);
}

/**
 * キーの形をここで見る。
 *
 * **コンソールの一覧に出ている `apikey_...` は、キーのID であってキーではない。**
 * これを設定すると、10ページぶんの生成を始めてから401で落ちる。
 * APIに投げる前に、形だけでも確かめて止める。
 */
if (key && !key.startsWith("sk-ant-")) {
  console.error("\n  ANTHROPIC_API_KEY の形が違います。\n");
  if (key.startsWith("apikey_")) {
    console.error("  設定されているのは **キーのID** です（コンソールの一覧に出ている文字列）。");
    console.error("  必要なのはキー本体で、`sk-ant-api03-` から始まります。\n");
    console.error("  **キー本体は作成時に一度しか表示されません。**");
    console.error("  分からなくなった場合は、新しいキーを作り直してください。\n");
  } else {
    console.error(`  いま設定されている値：${key.slice(0, 7)}…（${key.length}文字）`);
    console.error("  キー本体は `sk-ant-api03-` から始まります。\n");
  }
  console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...\n");
  console.error("  https://console.anthropic.com → Settings → API keys\n");
  process.exit(1);
}

const { generateSite, estimateCost } = await import("./lib/generate/pipeline.ts");
const project = JSON.parse(fs.readFileSync(file, "utf8"));

console.log(`\n${project.basics?.name ?? id} の原稿を生成します\n`);

/**
 * APIのエラーを、そのままスタックトレースで出さない。
 *
 * 何が起きたのか・次に何をすればよいのかを日本語で出す。
 * 取材の後で疲れているときに、英語のスタックトレースを読ませない
 */
let results;
try {
  results = await generateSite(project, { onProgress: (m) => console.log(m) });
} catch (err) {
  const status = err?.status;
  console.error("\n  生成できませんでした。\n");
  if (status === 401) {
    console.error("  APIキーが受け付けられませんでした（401）。");
    console.error("  キーが失効しているか、別のキーが設定されている可能性があります。");
    console.error("  いま設定されている値：" + (key ? `${key.slice(0, 12)}…（${key.length}文字）` : "（なし）"));
    console.error("\n  https://console.anthropic.com → Settings → API keys で作り直してください。");
  } else if (status === 403) {
    console.error("  そのキーでは、このモデルを使う権限がありません（403）。");
  } else if (status === 429) {
    console.error("  回数の上限に達しました（429）。時間をおいて、もう一度実行してください。");
    console.error("  途中まで生成したページは保存されていません。最初からやり直しになります。");
  } else if (status >= 500) {
    console.error(`  Anthropic側で一時的な障害が起きています（${status}）。時間をおいて再実行してください。`);
  } else {
    console.error(`  ${err?.message ?? err}`);
  }
  console.error("");
  process.exit(1);
}

const outDir = path.join("projects", id, "draft");
fs.mkdirSync(outDir, { recursive: true });
for (const r of results) {
  fs.writeFileSync(path.join(outDir, `${r.page.slug}.md`), r.markdown, "utf8");
}

console.log("\n━━━ 結果 ━━━");

// 「出典のない記述」と「未確認マーカー」は意味が違う。
// 前者は直さなければならない捏造。後者は**正しい振る舞い**で、
// 取材で聞けなかった項目を埋めずに残した印。混ぜて表示すると、
// 埋めなかったことが失敗のように見えてしまう。
const isFabrication = (f) => f.severity === "error" && f.kind !== "unresolved-marker";

let fabPages = 0, fabs = 0, marks = 0, warns = 0;
for (const r of results) {
  const f1 = r.findings.filter(isFabrication);
  const f2 = r.findings.filter((f) => f.kind === "unresolved-marker");
  const f3 = r.findings.filter((f) => f.severity === "warn" && f.kind !== "unresolved-marker");
  fabs += f1.length; marks += f2.length; warns += f3.length;
  if (f1.length) fabPages++;

  console.log(`  ${f1.length ? "✗" : "○"} ${r.page.slug.padEnd(11)} ${r.markdown.length}字` +
    (r.retries ? ` / 書き直し${r.retries}回` : "") +
    (f1.length ? ` / 出典なし${f1.length}件` : "") +
    (f2.length ? ` / 未確認あり` : "") +
    (f3.length ? ` / 要照合${f3.length}件` : ""));
  for (const f of [...f1, ...f3]) {
    console.log(`      ${isFabrication(f) ? "✗" : "・"} ${f.kind} 「${f.found}」  …${f.context}`);
  }
}

console.log(`\n  書き出し先: ${outDir}`);
console.log(`  生成費の概算: ${Math.round(estimateCost(results)).toLocaleString()}円`);

if (marks) {
  console.log(`\n  ${marks}ページに未確認の箇所が残っています。**これは正しい動作です。**`);
  console.log(`  取材で聞けなかった項目を、推測で埋めずに残しています。工場長への確認事項に入れてください。`);
}
if (fabs) {
  console.log(`\n  ✗ ${fabPages}ページに、出典のない記述が ${fabs}件 残りました。`);
  console.log(`    書き直しでも解消していません。**該当箇所を人が直すまで、先に進まないでください。**`);
  process.exit(1);
}
console.log(`\n  出典のない記述はありません。`);
