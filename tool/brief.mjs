/**
 * KOBO — 情報の見せ方の判断（Design Brief）を作って保存する
 *
 *   npm run brief -- <案件ID>          規則版で作る（既定）
 *   npm run brief -- <案件ID> --ai     AIに優先順位を判断させる
 *   npm run brief -- <案件ID> --keep   案件データが変わっていなければ作り直さない
 *
 * **AIを呼ぶのは、ここと `npm run generate -- --ai-brief` だけ。**
 * サイトの書き出し（build-site）は保存された判断を読むだけなので、
 * ネットワークが無くても、同じデータからは毎回同じサイトが建つ。
 *
 * **AIが使えなくても止まらない。** 鍵が無い・通信が切れた・429、
 * どれも「サイトが書き出せない」理由にはしない。規則版に落として最後まで進む。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { resolveTheme } from "./lib/theme.ts";
import { projectHashOf } from "./lib/design/brief.ts";
import { decideBrief } from "./lib/design/brief-ai.ts";

const SOURCE = { rules: "規則版", ai: "AI版", "ai-fallback": "AI版→規則版に戻した" };

/**
 * Brief を作って `project.json` に保存する。**生成側からも呼ぶ。**
 *
 * @param file projects/<ID>/project.json のパス
 */
export async function writeBrief(project, file, opts = {}) {
  const { useAI = false, keep = false, onProgress = () => {} } = opts;
  // **ハッシュは Brief を除いた案件データから取る**（Brief を含めると毎回変わる）
  const { designBrief, ...bare } = project;
  const hash = projectHashOf(project);

  if (keep && designBrief?.sourceProjectHash === hash) {
    onProgress(`  Brief はそのまま使います（案件データは変わっていません・${SOURCE[designBrief.source] ?? designBrief.source}）`);
    return designBrief;
  }

  // **ページと同じデータから判断する**（D-213）
  const clean = sanitizeProject(project);
  const analysis = analyze(clean);
  const resolved = resolveTheme(project.theme, project.formSet === "general" ? "general" : "manufacturing");
  const brief = await decideBrief(clean, analysis, {
    hero: resolved.hero.id,
    direction: resolved.direction,
    hasProse: fs.existsSync(path.join(path.dirname(file), "draft")),
  }, { useAI, onProgress });

  brief.sourceProjectHash = hash;
  fs.writeFileSync(file, JSON.stringify({ ...bare, designBrief: brief }, null, 2));

  onProgress(`\n  ${SOURCE[brief.source]} の判断を保存しました：${file}`);
  onProgress(`  最大の強み：${brief.primaryStrength}／2番目：${brief.secondaryStrength}`);
  for (const b of brief.blocks) onProgress(`    ${b.content.padEnd(11)} ${b.presentation.padEnd(12)} ${b.emphasis}`);
  if (brief.problems?.length) {
    onProgress("\n  検査で落ちた内容：");
    for (const p of brief.problems) onProgress(`    ${p.stage}　${p.where}　${p.message}`);
  }
  return brief;
}

// ── ここから下はコマンドとして呼ばれたときだけ動く ──
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) {
    console.error("\n  使い方: npm run brief -- <案件ID> [--ai] [--keep]\n");
    process.exit(1);
  }
  const file = path.join("projects", id, "project.json");
  if (!fs.existsSync(file)) {
    console.error(`\n  ${file} が見つかりません。\n`);
    process.exit(1);
  }
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  await writeBrief(project, file, {
    useAI: args.includes("--ai"),
    keep: args.includes("--keep"),
    onProgress: (m) => console.log(m),
  });
  console.log(`\n  画面に反映する：  npm run build:site -- ${id}\n`);
}
