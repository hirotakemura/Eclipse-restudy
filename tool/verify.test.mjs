/**
 * 事実検証の安全装置のテスト
 *
 * 目標：**捏造の検出率100%。ここだけは未達を許容しない**（docs/03 第2章）。
 * あわせて、正しい原稿を誤検出しないことも確かめる。誤検出が多いと、
 * 警告が無視されるようになり、安全装置として機能しなくなる。
 */
import fs from "node:fs";
import { verifyDraft, hasBlockingError } from "./lib/verify.ts";

const project = JSON.parse(fs.readFileSync("projects/matsubara-seiki/project.json", "utf8"));

// ── 検出されなければならない原稿 ──────────────────────────
const mustDetect = [
  ["罠1：答えてもらえなかった精度を数値化",
   "当社は薄肉部品の精密加工を得意とし、±5μmの精度に対応しています。", "fabricated-tolerance"],
  ["罠1の変種：「ミクロン単位」をそのまま書く",
   "ミクロン単位の精度で加工いたします。", "banned-phrase"],
  ["罠5：聞けなかった設備型番を書く",
   "マシニングセンタ（DMG MORI NTX2000）6台を保有しています。", "fabricated-model"],
  ["取得していない認証を書く",
   "当社はISO9001およびIATF16949を取得しています。", "fabricated-cert"],
  ["罠4：禁止語",
   "高品質・短納期でお応えします。うちは何でもやりますよ。", "banned-phrase"],
  ["聞けなかった対応サイズを書く",
   "最大800mm×600mmまでの加工に対応しています。", "unverified-number"],
  ["要確認マーカーが残っている",
   "不良率は{{要確認}}%を維持しています。", "unresolved-marker"],
  ["全角で書かれた型番",
   "複合加工機ＸＹＺ９９９を導入しました。", "fabricated-model"],
];

// ── 通さなければならない原稿（誤検出のテスト）────────────
const mustPass = [
  ["データにある従業員数", "従業員28名、平均年齢50歳の体制で対応します。"],
  ["データにある材質", "アルミ、ステンレス、鋳鉄の加工に対応しています。"],
  ["データにある型番", "複合加工機ABC123を2年前に導入しました。"],
  ["データにある認証", "ISO9001を取得しています。"],
  ["データにある創業年", "1972年の創業以来、精密切削加工を手がけてきました。"],
  ["データにある納期とロット", "1個から対応し、標準納期は7日、お急ぎの場合は最短3日です。"],
  ["取材で得た強み（数値なし）",
   "他社で「反ってしまって精度が出ない」と断られた薄肉部品を、専用の押さえ治具を自社で製作して実現しました。"],
];

let ok = 0, ng = 0;
console.log("━━━ 検出されなければならない原稿 ━━━");
for (const [name, draft, expect] of mustDetect) {
  const f = verifyDraft(draft, project, { forPublish: true });
  const hit = f.find((x) => x.kind === expect);
  if (hit) { ok++; console.log(`  ✓ ${name}\n      → ${hit.kind} 「${hit.found}」`); }
  else { ng++; console.log(`  ✗ 見逃し: ${name}\n      検出したもの: ${f.map(x=>x.kind).join(", ") || "なし"}`); }
}
console.log("\n━━━ 通さなければならない原稿（誤検出のテスト）━━━");
for (const [name, draft] of mustPass) {
  const f = verifyDraft(draft, project);
  const errs = f.filter((x) => x.severity === "error");
  if (errs.length === 0) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ 誤検出: ${name}\n      → ${errs.map(e=>`${e.kind}「${e.found}」`).join(", ")}`); }
}

console.log("\n━━━ 結果 ━━━");
const total = mustDetect.length + mustPass.length;
console.log(`  ${ok}/${total} 通過　検出率 ${Math.round(ok/total*100)}%`);
console.log(`  ビルド遮断の動作: ${hasBlockingError(verifyDraft(mustDetect[0][1], project)) ? "○ 止まる" : "× 止まらない"}`);
process.exit(ng === 0 ? 0 : 1);
