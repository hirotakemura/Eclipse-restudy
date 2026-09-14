/**
 * KOBO — 問い合わせフォームの疎通確認
 *
 *   npm run check:inquiry -- https://example.co.jp
 *   npm run check:inquiry -- https://example.co.jp --send    実際に1件送る
 *
 * **「問い合わせが届いていなかった」は、我々が信用を失う唯一の事故**（docs/10 第3章）。
 * しかも**止まっても誰も気づかない。** 届かないだけで、エラーが出ないからです。
 *
 * 既定では**送信せずに**、受け口が生きているかだけを見ます（わざと空で送り、
 * 「お名前をご記入ください」が返ってくれば、受け口は動いています）。
 * `--send` を付けたときだけ、本物の1件を通します。**月次の点検はこちらで。**
 */
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http"));
const send = args.includes("--send");

if (!base) {
  console.error("\n  使い方: npm run check:inquiry -- https://example.co.jp [--send]\n");
  process.exit(1);
}
const url = new URL("/api/inquiry", base).toString();

const form = new URLSearchParams(
  send
    ? { name: "疎通確認", company: "（制作会社）", email: "", tel: "000-0000-0000",
        subject: "疎通確認", body: `疎通確認です。${new Date().toLocaleString("ja-JP")}`, t: "1" }
    : { t: "1" },
);

console.log(`\n  ${url}`);
console.log(`  ${send ? "**本物を1件送ります。**通知先に届いたか、必ず目で確かめてください。" : "送信はしません（受け口が生きているかだけ見ます）"}\n`);

let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
} catch (err) {
  console.error(`  ✗ つながりません：${err?.message ?? err}`);
  console.error("\n  **フォームが止まっています。** サイトの表示は生きていても、問い合わせは届きません。\n");
  process.exit(1);
}

const body = await res.text();
const hasFallback = /電話|mailto:/.test(body);

if (send) {
  const ok = res.status === 200 && /送信しました/.test(body);
  console.log(`  ${ok ? "○" : "✗"} HTTP ${res.status}　${ok ? "受け付けられました" : "受け付けられませんでした"}`);
  if (!ok) console.log(`      ${body.slice(0, 300)}`);
  if (ok) console.log("\n  **通知先のメールボックスを、必ず目で確かめてください。**\n  受け付けた＝届いた、ではありません。\n");
  process.exit(ok ? 0 : 1);
}

const alive = res.status === 400 && /お名前をご記入ください/.test(body);
console.log(`  ${alive ? "○" : "✗"} HTTP ${res.status}　${alive ? "受け口は動いています" : "受け口の反応がおかしい"}`);
console.log(`  ${hasFallback ? "○" : "✗"} 送れなかった画面に、電話番号かメールアドレスが出ます（D-177③）`);
if (!alive) {
  console.log(`\n      返ってきたもの: ${body.slice(0, 300)}`);
  console.log("\n  **フォームが止まっている可能性があります。**\n");
}
console.log("");
process.exit(alive && hasFallback ? 0 : 1);
