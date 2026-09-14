/**
 * KOBO — 見た目の検査（Visual QA）
 *
 *   npm run qa:visual
 *
 * **これまでの検査は「帯の組み合わせ」しか数えていなかった。**
 * その結果、組み方が1ページに1種類・余白が全帯同一・山が無い、という状態を
 * **全部緑のまま通していた**（docs/30 で初めて測って分かった）。
 *
 * ここで数えるのは「画面が単調でないか」である。
 * **製造業3社と汎用3社を、写真0枚で並べる**（ご指示§19・§20）。
 * 実案件は写真0枚から始まるので、**写真が無い状態が既定である。**
 *
 * 【ブラウザを立てない】
 * 測るのは我々の語彙から決まる値なので、`clamp()` も余白も計算で出せる。
 * ブラウザを持ち込むと、お客様の環境や手元のMacで動かなくなる。
 * **横幅のはみ出しだけは計算では出ないので、ここでは測らない**（キャプチャで見る）。
 *
 * 【数字が良くても良いとは限らない】
 * 情報を削れば単調さは簡単に消える（D-259で実証済み）。
 * **この検査は必要だが十分ではない。** 最後は画面を見る（D-192・D-249）。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { TYPE_ROLES, getTypeRole, sizeAt, DENSITIES, getDensity, paddingOf } from "./lib/design/system/index.ts";
import { MOODS } from "./lib/theme.ts";

const COMPANIES = [
  ["qv-a-precision", "製造業A 精度", path.join("fixtures", "design-diversity", "a-precision.json")],
  ["qv-b-difficulty", "製造業B 難加工", path.join("fixtures", "design-diversity", "b-difficulty.json")],
  ["qv-c-speed", "製造業C 短納期", path.join("fixtures", "design-diversity", "c-speed.json")],
  ["qv-g-a", "汎用A サービス型", path.join("fixtures", "visual-general", "g-a-service.json")],
  ["qv-g-b", "汎用B ブランド型", path.join("fixtures", "visual-general", "g-b-brand.json")],
  ["qv-g-c", "汎用C 人・店舗型", path.join("fixtures", "visual-general", "g-c-people.json")],
];
const PAGES = ["index", "strengths/index"];

for (const f of fs.existsSync("projects") ? fs.readdirSync("projects") : []) {
  if (f.startsWith("qv-")) fs.rmSync(path.join("projects", f), { recursive: true, force: true });
}

console.log("\n  **写真0枚で並べます。** 実案件は写真0枚から始まります（ご指示§10）\n");

const results = [];
for (const [id, label, src] of COMPANIES) {
  const dir = path.join("projects", id);
  fs.mkdirSync(dir, { recursive: true });
  const p = JSON.parse(fs.readFileSync(src, "utf8"));
  p.id = id;
  p.photos = []; // **写真0枚にそろえる**
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));
  const r = spawnSync("node", ["build-site.mjs", id], { encoding: "utf8" });
  /**
   * **公開判定を通ったかどうかも出す**（D-285）。
   * 出さないと、**公開できない状態のものを「見た目は良い」と報告する**ことになる。
   * 検証用の案件にはわざと欠陥を残してあるので（`fixtures/README.md`）、
   * 「公開不可」が正しいこともある。**黙って隠さない**のが要件。
   */
  const publishable = fs.existsSync(path.join(dir, "site"));
  const root = publishable ? path.join(dir, "site") : path.join(dir, "site-draft");

  const section = parseInt((MOODS.find((m) => m.id === (p.theme?.mood ?? "futsu")) ?? MOODS[1]).section, 10);
  const pages = {};
  for (const page of PAGES) {
    const f = path.join(root, `${page}.html`);
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    const bands = [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
      const at = (k) => (new RegExp(`data-${k}="([a-zA-Z-]+)"`).exec(m[1]) ?? [, ""])[1];
      return { content: at("content"), presentation: at("presentation"), emphasis: at("emphasis"),
        surface: at("surface"), layout: at("layout"), density: at("density") || "normal",
        peak: at("peak"), role: at("role") || "sectionTitle" };
    });
    pages[page] = { bands, cards: (html.match(/class="(cards|machines|points|offer-list|gallery)"/g) ?? []).length };
  }
  results.push({ id, label, section, pages, publishable, stdout: r.stdout ?? "" });
}

/** その帯の見出しの実寸（px）。**語彙から計算する** */
const headingPx = (band, vw) => sizeAt(getTypeRole(band.role), vw);

const ROWS = [
  ["山が1つあるか", (b) => { const n = b.filter((x) => x.peak).length; return [n === 1, `${n}個`]; }],
  ["余白が2種類以上", (b) => { const n = new Set(b.map((x) => x.density)).size; return [n >= 2, `${n}種`]; }],
  ["同じ余白が3つ続かない", (b) => {
    const bad = b.some((x, i) => i >= 2 && x.density === b[i - 1].density && x.density === b[i - 2].density);
    return [!bad, bad ? "続いている" : "なし"];
  }],
  ["面が2種類以上", (b) => { const n = new Set(b.map((x) => x.surface)).size; return [n >= 2, `${n}種`]; }],
  ["組み方が2種類以上", (b) => { const n = new Set(b.map((x) => x.layout)).size; return [n >= 2, `${n}種`]; }],
  ["文字の段が3段以上（PC）", (b) => { const n = new Set(b.map((x) => headingPx(x, 1440))).size + 1; return [n >= 3, `${n}段`]; }],
  ["文字の段が3段以上（スマホ）", (b) => { const n = new Set(b.map((x) => headingPx(x, 390))).size + 1; return [n >= 3, `${n}段`]; }],
];

console.log("━━━ 見た目の検査（トップページ・写真0枚）━━━\n");
const head = "  " + "".padEnd(26) + results.map((r) => r.label.padEnd(15)).join("");
console.log(head);
let ng = 0;
for (const [name, fn] of ROWS) {
  const cells = results.map((r) => {
    const b = r.pages.index?.bands ?? [];
    if (!b.length) return ["-", false];
    const [ok, note] = fn(b);
    if (!ok) ng++;
    return [`${ok ? "○" : "✗"} ${note}`, ok];
  });
  console.log("  " + name.padEnd(26) + cells.map(([t]) => t.padEnd(15)).join(""));
}
console.log("\n  カード格子の数（3つ以上は多すぎ）");
console.log("  " + "".padEnd(26) + results.map((r) => {
  const n = r.pages.index?.cards ?? 0;
  if (n >= 3) ng++;
  return `${n >= 3 ? "✗" : "○"} ${n}箇所`.padEnd(15);
}).join(""));

console.log("\n  公開判定");
console.log("  " + "".padEnd(26) + results.map((r) => `${r.publishable ? "○ 公開可" : "△ 公開不可"}`.padEnd(15)).join(""));
console.log("  （検証用の案件には、わざと欠陥を残してあります・fixtures/README.md）");

console.log("\n━━━ 同じ材料でも、会社によって画面の主役が変わるか ━━━\n");
for (const r of results) {
  const b = r.pages.index?.bands ?? [];
  const peak = b.find((x) => x.peak);
  console.log(`  ${r.label.padEnd(16)} 先頭 ${(b[0]?.content ?? "-").padEnd(11)} 山 ${(peak ? `${peak.content}:${peak.peak}` : "なし").padEnd(20)} 余白 ${b.map((x) => x.density[0]).join("")}`);
}
const peaks = new Set(results.map((r) => { const p = (r.pages.index?.bands ?? []).find((x) => x.peak); return p ? `${p.content}:${p.peak}` : "なし"; }));
const firsts = new Set(results.map((r) => (r.pages.index?.bands ?? [])[0]?.content));
console.log(`\n  山の種類 ${peaks.size}通り／先頭の帯 ${firsts.size}通り（6社中）`);

console.log(`\n━━━ まとめ ━━━`);
console.log(`  ${ng ? `✗ ${ng}件が基準に届いていません` : "○ すべて基準を満たしています"}`);
console.log(`
  **数字が良くても、良いとは限りません。**
  情報を削れば単調さは簡単に消えます（D-259）。**最後は画面を見てください。**`);
for (const [id, label] of COMPANIES) console.log(`    npm run preview:site -- ${id}`);
console.log("");
process.exit(ng ? 1 : 0);
