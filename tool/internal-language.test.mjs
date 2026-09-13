/**
 * KOBO — 社内語の検出テスト
 *
 * **守りたいのは2つで、向きが逆である。**
 *   ① 社内の作業メモが顧客のページに出たら、必ず止める
 *   ② ふつうの日本語で止まってはいけない（「ご確認ください」で止まる道具は、いずれ切られる）
 *
 * ②を落とすと、現場は検査を外す。だから誤検出のほうを厚く書く。
 */
import { findInternalLanguage, visibleText } from "./lib/internal-language.ts";

// ── 必ず止めなければならない文（第1回レビューの実例を含む）────────
const mustBlock = [
  ["実例：設備一覧に出た作業指示",
   "2年前に導入。型番は社長の口頭記憶のため、現地で銘板と照合して確定させること"],
  ["実例：設備一覧のメーカー欄", "メーカー・型番とも未確認"],
  ["実例：強み・技術の文末", "複数回やり直した。具体的な数値は工場長に要確認。"],
  ["実例：仮置きの型番", "複合加工機ABC123を2年前に導入しました。"],
  ["進行メモ", "対応した内容は工場長への確認後に記載します。"],
  ["テンプレートの穴", "お電話は{{要確認：電話番号}}までお願いします。"],
  ["英語の書き置き", "TODO: あとで実績値を入れる"],
  ["仮の画像", "仮の画像（外観）／差し替え前提"],
  ["伏字", "○○株式会社との取引があります。"],
  ["確認中", "現在確認中の項目があります。"],
];

// ── 止めてはいけない文（誤検出のテスト）──────────────────
const mustPass = [
  ["お問い合わせページの実文", "可否のご確認だけでも構いません。お気軽にご連絡ください。"],
  ["ふつうの依頼", "内容をご確認のうえ、ご返信ください。"],
  ["確認という語の通常用法", "図面を拝見して、加工の可否を確認いたします。"],
  ["検査の説明", "全数検査で寸法を確認しています。"],
  ["社名に数字", "1972年の創業以来、精密切削加工を手がけてきました。"],
  ["実在する型番", "マシニングセンタ（ブラザー工業 S700X1）を6台保有しています。"],
  ["丸数字ではない記号", "アルミ・ステンレス・鋳鉄に対応します。"],
];

let ok = 0, ng = 0;

console.log("\n━━━ 止めるべき文 ━━━");
for (const [name, text] of mustBlock) {
  const blocked = findInternalLanguage(text).some((h) => h.severity === "block");
  if (blocked) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ 見逃し: ${name}\n      → ${text}`); ng++; }
}

console.log("\n━━━ 通すべき文 ━━━");
for (const [name, text] of mustPass) {
  const hits = findInternalLanguage(text).filter((h) => h.severity === "block");
  if (!hits.length) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ 誤検出: ${name}\n      → 「${hits[0].found}」${hits[0].why}`); ng++; }
}

// HTMLからの取り出し。**タグの中の文字を拾って誤検出しない**
console.log("\n━━━ HTMLからの取り出し ━━━");
const html = `<td class="todo-cell" data-note="要確認">実績は8年です。</td>`;
const shown = visibleText(html);
if (!findInternalLanguage(shown).some((h) => h.severity === "block")) {
  console.log("  ✓ 属性の中の文字は拾わない"); ok++;
} else {
  console.log("  ✗ 属性の中の文字を拾ってしまった"); ng++;
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
