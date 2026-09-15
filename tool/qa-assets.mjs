/**
 * KOBO — 素材（Asset）の見え方を並べる
 *
 *   npm run qa:assets                書き出して撮る
 *   npm run qa:assets -- --out <dir> 保存先を変える（実装前後の比較用）
 *
 * **確かめたいのは「装飾が増えたか」ではない**（docs/31 原則⑤）。
 *
 *   ・写真が無くても未完成に見えないか
 *   ・もとからある情報が読みやすいままか
 *   ・型ごとの差が、はっきり出ているか
 *   ・**どのページも同じ雰囲気になっていないか**
 *
 * 会社データは1社に固定し、**型（方向性）だけを入れ替える。**
 * そうしないと、差が会社の違いなのか型の違いなのか分からない。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DIRECTIONS } from "./lib/design/direction.ts";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", path.join("..", "docs", "assets", "captures", "asset-stage2"));

/** 製造業3方向・汎用3方向。**同じ会社データで、型だけを変える** */
const SETS = [
  ["製造業", "fixtures/design-diversity/b-difficulty.json", ["standard", "technical", "craft"]],
  ["汎用", "fixtures/visual-general/g-b-brand.json", ["modern", "dynamic", "classic"]],
];
const PAGES = ["/", "/strengths/", "/capability/", "/company/", "/contact/"];

const built = [];
for (const [plan, src, dirs] of SETS) {
  for (const id of dirs) {
    const d = DIRECTIONS.find((x) => x.id === id);
    if (!d) { console.error(`  型が見つかりません：${id}`); continue; }
    const pid = `qas-${id}`;
    const dir = path.join("projects", pid);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const p = JSON.parse(fs.readFileSync(src, "utf8"));
    p.id = pid;
    /** **写真0枚で見る。** 実案件は写真0枚から始まる（ご指示§10） */
    p.photos = [];
    /** 型を押したときと同じ状態にする。9軸も型のものに揃える */
    p.theme = { ...d.axes, direction: id };
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));
    const r = spawnSync("node", ["build-site.mjs", pid], { encoding: "utf8" });
    if (r.status !== 0 && !fs.existsSync(path.join(dir, "site-draft"))) {
      console.error(`  ${pid} の書き出しに失敗しました`); continue;
    }
    built.push({ plan, id, label: d.label, pid, root: fs.existsSync(path.join(dir, "site")) ? path.join(dir, "site") : path.join(dir, "site-draft") });
  }
}

/** 帯ごとに、素材の判断がどう出たか */
console.log("\n━━━ 型ごとに、どの帯へ素材が付いたか（写真0枚・トップページ）━━━\n");
for (const b of built) {
  const html = fs.readFileSync(path.join(b.root, "index.html"), "utf8");
  const rows = [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
    const at = (k) => (new RegExp(`data-${k}="([^"]*)"`).exec(m[1]) ?? [, "-"])[1];
    return { content: at("content"), surface: at("surface"), src: at("asset-source"), subj: at("asset-subject") };
  });
  const drawn = rows.filter((r) => r.src === "graphic");
  console.log(`  ${b.plan} ${b.label.padEnd(8)}（${b.id}）　帯 ${rows.length}本　装飾 ${drawn.length}本`);
  console.log(`      ${rows.map((r) => `${r.content}:${r.src === "graphic" ? r.subj : "—"}`).join("  ")}`);
}

console.log("\n  画面を撮ります…");
const shot = spawnSync("node", ["qa-assets-shot.mjs", OUT, ...built.map((b) => `${b.pid}|${b.plan} ${b.label}|${b.root}`)], { encoding: "utf8", stdio: "inherit" });
if (shot.status !== 0) console.error("  撮影に失敗しました（ブラウザが無い環境では飛ばしてください）");
console.log(`\n  保存先： ${OUT}\n`);
