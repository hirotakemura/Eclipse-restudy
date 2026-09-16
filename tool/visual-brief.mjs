/**
 * KOBO — 生成ビジュアルの注文書をつくる（第9段階）
 *
 *   npm run visual -- <案件ID>              注文書を作って保存し、画面に出す
 *   npm run visual -- <案件ID> --prompts    プロンプトだけを出す（外の生成サービスへ持っていく用）
 *   npm run visual -- <案件ID> --keep       案件データが変わっていなければ作り直さない
 *   npm run visual -- <案件ID> --regenerate 届いている絵の状態を白紙に戻して作り直す
 *
 * **ここでは画像を作らない。** この環境には画像を作るAPIが無い（`docs/36` §0）。
 * 作るのは注文書までで、**絵は外で作って `projects/<案件ID>/generated/` に置く。**
 *
 * 絵を置いたら、その1枚について案件データの `provenance` を埋めて `status` を `ready` にする。
 * **来歴（どこで作ったか・商用可否）は人が入れる。こちらが騙らない。**
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { resolveTheme } from "./lib/theme.ts";
import { projectHashOf } from "./lib/design/brief.ts";
import { planGeneratedVisuals, storedPlan } from "./lib/design/generated-brief.ts";
import { assertGenerated, isReady } from "./lib/design/system/index.ts";

/** 注文書を作って `project.json` に保存する。**画像は触らない** */
export function writeVisualPlan(project, file, opts = {}) {
  const { keep = false, regenerate = false, onProgress = () => {} } = opts;
  const { visualPlan, ...bare } = project;
  const hash = projectHashOf(project);

  if (keep && !regenerate && visualPlan?.sourceProjectHash === hash) {
    onProgress("  注文書はそのまま使います（案件データは変わっていません）");
    return visualPlan;
  }

  const clean = sanitizeProject(project);
  const analysis = analyze(clean);
  const r = resolveTheme(project.theme, project.formSet === "general" ? "general" : "manufacturing");
  const plan = storedPlan(project, planGeneratedVisuals(clean, analysis, r.direction));

  /**
   * **届いている絵を捨てない。**
   * 注文書を作り直しても、同じ `visualId` に絵があるならその状態を引き継ぐ。
   * `--regenerate` と言われたときだけ白紙に戻す（determinism・ご指示）。
   */
  if (!regenerate && visualPlan?.visuals?.length) {
    for (const v of plan.visuals) {
      const before = visualPlan.visuals.find((x) => x.visualId === v.visualId);
      if (before && isReady(before)) { v.status = before.status; v.provenance = before.provenance; }
    }
  }
  assertGenerated(plan.visuals);
  fs.writeFileSync(file, JSON.stringify({ ...bare, visualPlan: plan }, null, 2) + "\n");
  return plan;
}

const show = (plan, id, log) => {
  log(`\n  ── この会社の視覚言語 ──`);
  log(`  ${plan.language.label}（${plan.language.id}）`);
  log(`    理由　　${plan.language.why}`);
  if (plan.language.id === "none") {
    log("\n  **生成ビジュアルは作りません。** 根拠が無いのに絵の方針を作らない、が既定です。\n");
    return;
  }
  log(`    軸　　　${plan.language.axis.join(" / ")}`);
  log(`    材質　　${plan.language.material}`);
  log(`    気分　　${plan.language.mood}`);
  log(`    密度　　${plan.language.density}`);
  log(`    光　　　${plan.language.lighting}`);

  log(`\n  ── 注文書 ${plan.visuals.length}件 ──`);
  for (const v of plan.visuals) {
    const state = isReady(v) ? `**絵あり**（${v.provenance.provider}）` : "絵はまだ無い";
    log(`\n  ${v.purpose}　${v.subject}　${v.aspectRatio}　→ ${v.placement.page}/${v.placement.slot}（${v.placement.role}）　${state}`);
    log(`    ${v.why}`);
    log(`    スマホ　焦点 ${v.mobile.focalPoint.x}/${v.mobile.focalPoint.y}　切っても成立する比 ${v.mobile.cropSafe}　文字が乗る側 ${v.mobile.textSafeArea}`);
    log(`    置き場所　projects/${id}/generated/${v.visualId}.<拡張子>`);
  }
};

const prompts = (plan, log) => {
  for (const v of plan.visuals) {
    log(`\n──────── ${v.visualId}（${v.purpose} / ${v.aspectRatio}）`);
    log(v.prompt);
    log(`\n[negative] ${v.negativePrompt}`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) { console.error("\n  使い方: npm run visual -- <案件ID> [--prompts] [--keep] [--regenerate]\n"); process.exit(1); }
  const file = path.join("projects", id, "project.json");
  if (!fs.existsSync(file)) { console.error(`\n  ${file} が見つかりません。\n`); process.exit(1); }

  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  const plan = writeVisualPlan(project, file, {
    keep: args.includes("--keep"), regenerate: args.includes("--regenerate"),
    onProgress: (m) => console.log(m),
  });

  if (args.includes("--prompts")) { prompts(plan, (m) => console.log(m)); process.exit(0); }

  show(plan, id, (m) => console.log(m));
  if (plan.visuals.length) {
    console.log(`\n  ── 絵を入れるには ──`);
    console.log(`  1. npm run visual -- ${id} --prompts　でプロンプトを出す`);
    console.log("  2. **外の画像生成サービスで作る**（この環境には画像を作るAPIがありません）");
    console.log(`  3. できた絵を projects/${id}/generated/<visualId>.<拡張子> に置く`);
    console.log(`  4. project.json の該当する注文書に provenance（provider / generatedAt / commercialUse / file）を書き、status を "ready" にする`);
    console.log(`  5. npm run build:site -- ${id}`);
    console.log("\n  **絵を置くまで、サイトはいままでと1ピクセルも変わりません。**\n");
  }
}
