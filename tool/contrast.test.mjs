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

console.log(`\n  ${checked - failed}/${checked} 通過`);
if (failed) {
  console.log("\n  **読めない配色を出荷しない。** 上の色を直してください。\n");
  process.exit(1);
}
console.log("");
