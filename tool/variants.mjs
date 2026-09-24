/**
 * KOBO — 型を変えて書き出し、見比べる（D-472）
 *
 *   npm run variants -- <案件ID>                        … その案件で選べる型を全部書き出す（制作側で見比べる）
 *   npm run variants -- <案件ID> --only 型,型,型         … お客様にお見せする2〜3通りだけ書き出す
 *   npm run preview:variants -- <案件ID>                … 見比べ画面を開く
 *
 * 【なぜ要るか】
 * 取材では見た目を決めない（D-470・D-471）。「どれが御社らしいですか」を**ご希望として**伺い、
 * 型と9つの軸は**書き出した実物を見て**こちらが決め、**原稿のご確認で中身の入ったサイトを2〜3通り**
 * お見せして選んでいただく。KOBOの確認画面でも、お客様にそうお約束している。
 * それまで1案件1通りしか書き出せなかったので、お約束を守る道具が無かった。
 *
 * 【案件データは書き換えない】
 * 型の差し替えは書き出しのときだけ（`build-site.mjs --theme`）。文字の大きさも書き換えない——
 * 見比べ画面で**お客様ご本人の目で**切り替えていただき（D-153）、決まったら見比べ画面の
 * 「この見た目に決める」で案件データに記録する（型・文字の大きさ・`themeDecidedAt`）。
 *
 * 書き出し先は `projects/<ID>/variants/<型>/`（Git に載らない）。
 */
import "./lib/env.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PRESETS, TEXT_SIZES, TEXT_SIZE_VALUES } from "./lib/theme.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";

const args = process.argv.slice(2);
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const id = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!id) {
  console.error("\n  使い方: npm run variants -- <案件ID> [--only 型,型,型]\n");
  process.exit(1);
}
const projectDir = path.join("projects", id);
const projectFile = path.join(projectDir, "project.json");
if (!fs.existsSync(projectFile)) {
  console.error(`\n  ${projectFile} が見つかりません。\n`);
  process.exit(1);
}
const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
const plan = project.formSet === "general" ? "general" : "manufacturing";

/** その案件で選べる型。**製造業の型を汎用の案件で出さない**（D-198） */
const available = PRESETS.filter((p) => (DIRECTIONS.find((d) => d.id === p.id)?.plan ?? "manufacturing") === plan);
const preferred = available.some((p) => p.id === project.theme?.direction) ? project.theme.direction : null;

let chosen;
const only = valueOf("--only");
if (only) {
  const want = only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = want.filter((w) => !available.some((p) => p.id === w));
  if (unknown.length) {
    console.error(`\n  この案件では選べない型があります：${unknown.join("・")}`);
    console.error(`  選べる型：${available.map((p) => `${p.id}（${p.label}）`).join("・")}\n`);
    process.exit(1);
  }
  chosen = available.filter((p) => want.includes(p.id));
} else {
  chosen = available;
}
/** **お客様のご希望を先頭に**置く（見比べの基準になる） */
chosen = [...chosen].sort((a, b) => (b.id === preferred) - (a.id === preferred));

const outRoot = path.join(projectDir, "variants");
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

console.log(`\n  ${project.basics?.name ?? id}　${chosen.length}通り書き出します`
  + (preferred ? `（お客様のご希望：${available.find((p) => p.id === preferred)?.label}）` : "（ご希望は未記入）"));

const built = [];
for (const p of chosen) {
  const to = path.join(outRoot, p.id);
  process.stdout.write(`    ${p.label.padEnd(8, "　")} … `);
  const r = spawnSync("node", ["build-site.mjs", id, "--theme", p.id, "--out", to], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(path.join(to, "index.html"))) {
    console.log("✗ 書き出せませんでした");
    console.log((r.stdout + r.stderr).trim().split("\n").slice(-8).map((l) => `        ${l}`).join("\n"));
    continue;
  }
  console.log("○");
  built.push({ id: p.id, label: p.label, note: DIRECTIONS.find((d) => d.id === p.id)?.note ?? "", preferred: p.id === preferred });
}
if (!built.length) {
  console.error("\n  1通りも書き出せませんでした。\n");
  process.exit(1);
}

/**
 * **見比べ画面の材料。** 文字の大きさの値は `lib/theme.ts` の表をそのまま渡す（D-197）。
 * 画面そのもの（`preview-variants.mjs`）は、この材料を読んで組み立てる。
 */
fs.writeFileSync(path.join(outRoot, "variants.json"), JSON.stringify({
  id,
  name: project.basics?.name ?? id,
  preferred,
  current: project.theme?.textSize ?? "normal",
  builtAt: new Date().toISOString(),
  items: built,
  textSizes: TEXT_SIZES.map((t) => ({ id: t.id, label: t.label, ...(TEXT_SIZE_VALUES[t.id] ?? {}) })),
}, null, 2) + "\n");

console.log(`\n  見比べる：  npm run preview:variants -- ${id}`);
if (!only && built.length > 3) {
  console.log(`  お客様には2〜3通りに絞ってお見せする：  npm run variants -- ${id} --only ${built.slice(0, 3).map((b) => b.id).join(",")}`);
}
console.log("");
