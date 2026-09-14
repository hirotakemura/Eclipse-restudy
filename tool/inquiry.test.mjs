/**
 * KOBO — お問い合わせの受け口の試験
 *
 *   npm run test:inquiry
 *
 * **ネットワークは使いません。** 判定と文面の組み立てだけを確かめます。
 * ここで守りたいのは2つ。
 *   ① **黙って飲み込まない**（D-177③）。送れなかったら画面に連絡先が出ること
 *   ② **移管しても同じに動く**（D-243）。PHP版と規則がずれていないこと
 */
import fs from "node:fs";
import { parseInquiry, notifyBody, replyBody, page, FIELDS } from "./site-template/functions/api/inquiry.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};
const okForm = { name: "松原 健二", company: "有限会社 松原精機", email: "k@example.co.jp", tel: "093-000-0000", subject: "薄物の加工可否", body: "厚さ0.8mmのカバー部品です。", t: "1" };

console.log("\n━━━ 受け付ける・受け付けない ━━━");
check("そろっていれば通る", parseInquiry(okForm).problems.length === 0, JSON.stringify(parseInquiry(okForm).problems));
check("名前が無ければ止める", parseInquiry({ ...okForm, name: "" }).problems.some((p) => p.includes("お名前")));
check("本文が無ければ止める", parseInquiry({ ...okForm, body: "" }).problems.some((p) => p.includes("内容")));
check("連絡先がどちらも無ければ止める",
  parseInquiry({ ...okForm, email: "", tel: "" }).problems.some((p) => p.includes("どちらか")));
check("メールだけでも通る", parseInquiry({ ...okForm, tel: "" }).problems.length === 0);
check("電話だけでも通る", parseInquiry({ ...okForm, email: "" }).problems.length === 0);
check("メールの形が違えば止める", parseInquiry({ ...okForm, email: "こわれている" }).problems.some((p) => p.includes("形")));
check("長すぎる本文は止める", parseInquiry({ ...okForm, body: "あ".repeat(4001) }).problems.length > 0);

console.log("\n━━━ 迷惑送信を、部品を増やさずに止める ━━━");
check("画面に出ていない欄が埋まっていたら止める",
  parseInquiry({ ...okForm, website: "http://spam" }).problems.length > 0);
check("開いて3秒未満は止める", parseInquiry({ ...okForm, t: String(Date.now()) }).problems.length > 0);
check("3秒を超えていれば通る", parseInquiry({ ...okForm, t: String(Date.now() - 5000) }).problems.length === 0);
check("時刻が入っていなくても通る（JSが動かない端末）",
  parseInquiry({ ...okForm, t: "" }).problems.length === 0);

console.log("\n━━━ 黙って飲み込まない（D-177③）━━━");
const contact = { tel: "093-000-0000", email: "info@example.co.jp", site: "有限会社 松原精機" };
const ngPage = page("ng", ["送信の途中で問題が起きました。"], contact);
check("送れなかった画面に電話番号が出る", ngPage.includes("093-000-0000"));
check("送れなかった画面にメールアドレスが出る", ngPage.includes("info@example.co.jp"));
check("送れなかった画面に理由が出る", ngPage.includes("問題が起きました"));
check("送れた画面には連絡先を出さない（くどくしない・D-175）",
  !page("ok", [], contact).includes("093-000-0000"));
check("入力値をそのまま画面に流し込まない",
  !page("ng", ['<script>alert(1)</script>'], contact).includes("<script>alert"));

console.log("\n━━━ 通知と自動返信 ━━━");
check("聞いた内容がすべて通知に入る",
  FIELDS.filter((f) => okForm[f]).every((f) => notifyBody(parseInquiry(okForm).values).includes(okForm[f])));
check("空の欄は通知に出さない", !notifyBody(parseInquiry({ ...okForm, company: "" }).values).includes("会社名"));
check("自動返信に、図面を添付してもらう案内が入る（D-179）",
  replyBody(parseInquiry(okForm).values, "松原精機", "093").includes("添付"));

console.log("\n━━━ 移管しても同じに動く（D-243）━━━");
{
  const php = fs.readFileSync("handover/api/inquiry.php", "utf8");
  check("PHP版が引き渡しパッケージにある", php.length > 0);
  check("受け取る項目がPHP版と同じ", FIELDS.every((f) => php.includes(`"${f}"`)),
    FIELDS.filter((f) => !php.includes(`"${f}"`)).join(","));
  check("PHP版も、送れなかったら連絡先を出す", /SITE_TEL/.test(php) && /mailto:/.test(php));
  check("PHP版も、画面に出ていない欄で止める", php.includes('v("website")'));
  check("PHP版も、開いて3秒未満で止める", php.includes("3000"));
  check("書き換える設定が4行にまとまっている", /ここだけ書き換える/.test(php));
  const ht = fs.readFileSync("handover/.htaccess", "utf8");
  check("HTMLを変えずに済むよう、書き換え規則が同梱されている", ht.includes("api/inquiry.php"));
}
{
  const form = fs.readFileSync("site-template/src/components/InquiryForm.astro", "utf8");
  check("フォームはJSが無くても送信できる（素のPOST）",
    /method="post"/.test(form) && /action="\/api\/inquiry"/.test(form));
  check("フォームの直下に、電話とメールを出してある（止まっても届く）", /fallback/.test(form));
  check("図面を添付させない案内がフォームにある（D-179）", form.includes("添付できません"));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
