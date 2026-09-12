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

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("\nAnthropic API の認証情報が見つかりません。\n");
  console.error("  export ANTHROPIC_API_KEY=sk-ant-...\n");
  console.error("を設定してから実行してください。");
  process.exit(1);
}

const { generateSite, estimateCost } = await import("./lib/generate/pipeline.ts");
const project = JSON.parse(fs.readFileSync(file, "utf8"));

console.log(`\n${project.basics?.name ?? id} の原稿を生成します\n`);
const results = await generateSite(project, { onProgress: (m) => console.log(m) });

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
