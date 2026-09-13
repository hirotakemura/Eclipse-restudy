/**
 * KOBO — 配色のコントラスト比を検査する
 *
 *   npm run test:contrast
 *
 * **「文字と表だけで読めるサイト」を謳っている以上、読めない配色を出荷しない。**
 * 読み手は60代前後の社長と調達担当者（docs/06）。ここは見た目の好みではなく、下限の話。
 *
 * 基準は WCAG 2.1 AA：本文 4.5:1／UI部品・境界 3:1。
 * ※ WCAG原文はこの環境から取得できず、数値は検索要約に依拠している（docs/research 参照）。
 *   基準そのものより、**全パレットが同じ下限を満たしていること**を守るための検査。
 */
import fs from "node:fs";
import { PALETTES } from "./lib/theme.ts";

const srgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};
const luminance = (hex) => {
  const [r, g, b] = srgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const WHITE = "#ffffff";
let failed = 0;
let checked = 0;

console.log("\n配色のコントラスト比\n");

for (const p of PALETTES) {
  const checks = [
    ["本文", p.ink, p.bg, 4.5],
    ["補助文", p.inkSoft, p.bg, 4.5],
    ["リンク・強調", p.accent, p.bg, 4.5],
    ["リンク（薄い背景の上）", p.accent, p.bgSoft, 4.5],
    ["ボタンの白文字", WHITE, p.accent, 4.5],
    ["ボタン（濃い側）の白文字", WHITE, p.accentDark, 4.5],
    // 枠線（line）は装飾なので下限を緩める。表の罫線（tableLine）は情報なので 3:1
    ["表の罫線", p.tableLine, p.bg, 3],
    ["枠線", p.line, p.bg, 1.2],

    /*
      ここから下は、段階1・2で増えたセクション（札・大きな数字・年表）で
      **新しく生まれた組み合わせ**（D-191）。
      表現を足した分だけ、読めない配色が混ざる余地が増える。増やしたら、必ずここにも足す。
    */
    // 強みの札（.point）・表の見出し・脚。**薄い背景の上に文字が乗る**
    ["本文（薄い背景の上）", p.ink, p.bgSoft, 4.5],
    ["補助文（薄い背景の上）", p.inkSoft, p.bgSoft, 4.5],
    // 札の中の小見出し（.point-sub）
    ["小見出し（札の中）", p.accentDark, p.bgSoft, 4.5],
    // 行を縞にしたときの表の見出し（html[data-tables="stripe"] th）
    ["表の見出し（縞のとき）", p.ink, p.accentSoft, 4.5],
    ["表の罫線（薄い背景の上）", p.tableLine, p.bgSoft, 3],
    // 章の目印。引用の縦線・札の縦線・設備カードの上辺・年表の点。
    // **文字ではないが、章の境目を示す情報**なので UI の 3:1 を課す
    ["章の目印（帯・線・点）", p.accent, p.bg, 3],
  ];
  const bad = [];
  for (const [label, fg, bg, min] of checks) {
    checked++;
    const r = ratio(fg, bg);
    if (r < min) { bad.push(`${label} ${r.toFixed(2)}:1（${min}:1 必要）`); failed++; }
  }
  console.log(`  ${bad.length ? "✗" : "○"} ${p.label.padEnd(4)} ${p.id}`);
  for (const b of bad) console.log(`      ${b}`);
}

/*
  **検査から漏れた色の使い方を、静かに増やさない。**
  段階1・2でセクションを増やしたとき、`--accent-dark` を薄い背景の上に置く、
  という新しい組み合わせが生まれた。**気づいたのは偶然だった。**
  スタイルシートを読んで、この検査が知らない色が使われていたら止める。
*/
const CSS = "site-template/src/styles/site.css";
const KNOWN_TEXT = new Set(["--ink", "--ink-soft", "--accent", "--accent-dark"]);
const KNOWN_BG = new Set(["--bg", "--bg-soft", "--accent", "--accent-dark", "--accent-soft", "--line"]);

const css = fs.readFileSync(CSS, "utf8");
const used = (prop) =>
  [...css.matchAll(new RegExp(`${prop}:\\s*var\\((--[a-z-]+)\\)`, "g"))].map((m) => m[1]);

const unknown = [
  ...used("color").filter((t) => !KNOWN_TEXT.has(t)).map((t) => `文字色 ${t}`),
  ...used("background").filter((t) => !KNOWN_BG.has(t)).map((t) => `背景色 ${t}`),
];
const strays = [...new Set(unknown)];
if (strays.length) {
  console.log("\n  ✗ 検査が知らない色の使い方があります");
  for (const t of strays) console.log(`      ${t}`);
  console.log(`\n  **${CSS} に色を足したら、この検査にも組み合わせを足してください。**`);
  failed += strays.length;
  checked += strays.length;
}

console.log(`\n  ${checked - failed}/${checked} 通過`);
if (failed) {
  console.log("\n  **読めない配色を出荷しない。** 上の色を直してください。\n");
  process.exit(1);
}
console.log("");
