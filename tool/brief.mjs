/**
 * KOBO — 情報の見せ方の判断（Design Brief）を作って保存する
 *
 *   npm run brief -- <案件ID>                規則版で作って採用する（既定）
 *   npm run brief -- <案件ID> --ai           AI版を**提案として**作る。採用はしない
 *   npm run brief -- <案件ID> --adopt        保存されている提案を採用する
 *   npm run brief -- <案件ID> --ai --adopt   AI版を作って、その場で採用する（検証用）
 *   npm run brief -- <案件ID> --keep         案件データが変わっていなければ作り直さない
 *
 * **AIを呼ぶのは、ここと `npm run generate -- --ai-brief` だけ。**
 * サイトの書き出し（build-site）は保存された判断を読むだけなので、
 * ネットワークが無くても、同じデータからは毎回同じサイトが建つ。
 *
 * **AIが使えなくても止まらない。** 鍵が無い・通信が切れた・429、
 * どれも「サイトが書き出せない」理由にはしない。規則版に落として最後まで進む。
 *
 * 【採用を分ける理由】D-256
 * 4段検査は**妥当性を見ていない**（D-249）。実測でも、精度が強みの会社で
 * 「精度の物証である三次元測定機を目立たなくする」という判断が、
 * **検査を1つも引っかからずに通った。** 止める仕組みは、いまも人の目しかない。
 * **その目を通る場所を、コマンドの形で作る。**
 */
/** **キーを `tool/.env` から読む。** ほかの import より先に置く（D-468） */
import "./lib/env.mjs";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { resolveTheme } from "./lib/theme.ts";
import { projectHashOf } from "./lib/design/brief.ts";
import { decideBrief } from "./lib/design/brief-ai.ts";
import { ruleBrief, describeDiff, stored } from "./lib/design/brief-rules.ts";

const SOURCE = { rules: "規則版", ai: "AI版", "ai-fallback": "AI版→規則版に戻した" };

const show = (brief, onProgress) => {
  onProgress(`  最大の強み：${brief.primaryStrength}／2番目：${brief.secondaryStrength}`);
  for (const b of brief.blocks) onProgress(`    ${b.content.padEnd(11)} ${b.presentation.padEnd(12)} ${b.emphasis}`);
};

/**
 * Brief を作って `project.json` に保存する。**生成側からも呼ぶ。**
 *
 * **返すのは、いつも「採用されている判断」**（`designBrief`）である。
 * 提案は `designBriefProposal` に別で入る。ここを1つにすると、
 * **呼んだ側が、採用していない判断でサイトを建ててしまう。**
 *
 * @param file projects/<ID>/project.json のパス
 */
export async function writeBrief(project, file, opts = {}) {
  /** `ask` は**試験で作り物のAIを差し込むため**だけにある。コマンドからは渡らない */
  const { useAI = false, adopt = false, keep = false, ask, onProgress = () => {} } = opts;
  // **ハッシュは Brief と提案を除いた案件データから取る**（含めると毎回変わる）
  const { designBrief, designBriefProposal, ...bare } = project;
  const hash = projectHashOf(project);
  const save = (next) => fs.writeFileSync(file, JSON.stringify(next, null, 2));

  if (keep && !useAI && !adopt && designBrief?.sourceProjectHash === hash) {
    onProgress(`  Brief はそのまま使います（案件データは変わっていません・${SOURCE[designBrief.source] ?? designBrief.source}）`);
    return designBrief;
  }
  /** **同じデータで、提案を作り直さない。** AIを2度呼ぶぶんだけ費用がかかる */
  if (keep && useAI && !adopt && designBriefProposal?.sourceProjectHash === hash) {
    onProgress("  提案はそのまま使います（案件データは変わっていません）");
    return designBrief ?? designBriefProposal;
  }

  /**
   * **提案を採用する。** AIは呼ばない。すでに人が見たものを、そのまま上げる。
   * **古い提案は採用しない。** 案件データが変わっていれば、見たものと中身が違う。
   */
  if (adopt && !useAI) {
    if (!designBriefProposal) {
      onProgress("\n  採用できる提案がありません。先に作ってください： npm run brief -- <案件ID> --ai\n");
      return designBrief ?? null;
    }
    if (designBriefProposal.sourceProjectHash !== hash) {
      onProgress("\n  ✗ 提案は古い案件データから作られています。作り直してください： npm run brief -- <案件ID> --ai\n");
      return designBrief ?? null;
    }
    save({ ...bare, designBrief: designBriefProposal });
    onProgress(`\n  ${SOURCE[designBriefProposal.source]} の判断を採用しました：${file}`);
    show(designBriefProposal, onProgress);
    return designBriefProposal;
  }

  // **ページと同じデータから判断する**（D-213）
  const clean = sanitizeProject(project);
  const analysis = analyze(clean);
  const resolved = resolveTheme(project.theme, project.formSet === "general" ? "general" : "manufacturing");
  const ctx = {
    hero: resolved.hero.id,
    direction: resolved.direction,
    hasProse: fs.existsSync(path.join(path.dirname(file), "draft")),
  };
  const brief = await decideBrief(clean, analysis, ctx, { useAI, ask, onProgress });
  brief.sourceProjectHash = hash;

  /**
   * **AI版は、採用せずに提案として置く**（D-256）。
   * 規則版は今までどおり、その場で採用する（人が見るまでもない＝我々の既定である）。
   */
  if (useAI && !adopt) {
    const rules = { ...stored(ruleBrief(clean, analysis, ctx), "rules", true), sourceProjectHash: hash };
    save({ ...bare, designBrief: designBrief ?? rules, designBriefProposal: brief });
    onProgress(`\n  ${SOURCE[brief.source]} の判断を**提案として**保存しました：${file}`);
    show(brief, onProgress);
    if (brief.problems?.length) {
      onProgress("\n  検査で落ちた内容：");
      for (const p of brief.problems) onProgress(`    ${p.stage}　${p.where}　${p.message}`);
    }

    const diff = describeDiff(rules, brief);
    onProgress("\n  ── 規則版との差 ──");
    if (!diff.length) onProgress("  （差はありません。規則版で足ります）");
    for (const line of diff) onProgress(line);
    /**
     * **検査が通ったことを「妥当である」と読まない**（D-249）。
     * ここで人が見なければ、誰も見ない。
     */
    onProgress("\n  **画面を見てから決めてください。検査は妥当性を見ていません（D-249）。**");
    onProgress(`    見る　　： npm run build:site -- ${path.basename(path.dirname(file))} && npm run preview:site -- ${path.basename(path.dirname(file))}`);
    onProgress(`    採用する： npm run brief -- ${path.basename(path.dirname(file))} --adopt`);
    return designBrief ?? rules;
  }

  save({ ...bare, designBrief: brief });
  onProgress(`\n  ${SOURCE[brief.source]} の判断を保存しました：${file}`);
  show(brief, onProgress);
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
    console.error("\n  使い方: npm run brief -- <案件ID> [--ai] [--adopt] [--keep]\n");
    process.exit(1);
  }
  const file = path.join("projects", id, "project.json");
  if (!fs.existsSync(file)) {
    console.error(`\n  ${file} が見つかりません。\n`);
    process.exit(1);
  }
  const useAI = args.includes("--ai");
  /**
   * **鍵が無いのに「AI版を作りました」と言わない**（ご指示）。
   * `decideBrief` は鍵が無くても規則版に落として最後まで進む（D-215）。
   * その振る舞いは変えないが、**AI版を作れと言われたのに規則版が出てきたら、それは失敗**である。
   */
  if (useAI && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("\n  ✗ AI版は作れません。**APIキーがありません。**\n");
    console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...\n");
    console.error("  規則版でよければ、--ai を外して実行してください：");
    console.error(`    npm run brief -- ${id}\n`);
    process.exit(1);
  }
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  await writeBrief(project, file, {
    useAI,
    adopt: args.includes("--adopt"),
    keep: args.includes("--keep"),
    onProgress: (m) => console.log(m),
  });
  console.log(`\n  画面に反映する：  npm run build:site -- ${id}\n`);
}
