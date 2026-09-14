/**
 * お問い合わせの受け口（Cloudflare Pages Functions）。
 *
 * 【この1ファイルで完結させる理由】
 * **撤退・移管のとき、次の業者がこれ1つ読めば同じものを作れるようにする**（D-243）。
 * 外部の部品を import しない。フレームワークも使わない。環境変数の名前も固定する。
 * 同じ振る舞いの PHP 版を `tool/handover/api/inquiry.php` に置いてあり、
 * **一般のレンタルサーバーへ移しても、HTMLを1文字も変えずに動く。**
 *
 * 【守ること】
 * ① **JSが無くても動く。** 素の form POST を受け、HTMLを返す
 * ② **失敗したら黙って飲み込まない**（D-177③）。電話番号とメールを画面に出す
 * ③ **我々を配送経路に置かない**（D-177②）。通知はお客様のアドレスへ直行
 * ④ 送信の契約は**お客様名義**（D-177①）
 *
 * 【環境変数】**この5つだけ。増やさない**
 *   RESEND_API_KEY   送信サービスの鍵（お客様名義のアカウントのもの）
 *   INQUIRY_TO       通知先。カンマ区切りで複数可
 *   INQUIRY_FROM     差出人。サブドメインで認証したもの（D-178）
 *   SITE_NAME        会社名（件名と自動返信に入れる）
 *   SITE_TEL         電話番号（送れなかったときに画面へ出す）
 */

/** 受け取る項目。**増やさない。** 増やすと移管時に PHP 版とずれる */
export const FIELDS = ["name", "company", "email", "tel", "subject", "body"] as const;
export type Field = (typeof FIELDS)[number];

export interface Inquiry {
  values: Record<Field, string>;
  /** 問題があれば日本語で。空なら受け付けてよい */
  problems: string[];
}

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * 入力を確かめる。**ここでは何も送らない。** 試験から直接呼べるようにしてある。
 *
 * 迷惑送信は**部品を増やさずに**止める（D-243）。
 * 画像認証のような外部の仕組みを入れると、**移管先でそれも作り直しになる。**
 *   ① `website` は画面に出ていない欄。埋まっていたら機械である
 *   ② 開いてから3秒未満の送信は機械である
 */
export function parseInquiry(form: Record<string, unknown>, now = Date.now()): Inquiry {
  const values = Object.fromEntries(FIELDS.map((f) => [f, trim(form[f])])) as Record<Field, string>;
  const problems: string[] = [];

  if (!values.name) problems.push("お名前をご記入ください。");
  if (!values.body) problems.push("お問い合わせ内容をご記入ください。");
  // **連絡先が無いと返事ができない。** どちらか一方で足りる
  if (!values.email && !values.tel) problems.push("メールアドレスかお電話番号を、どちらかご記入ください。");
  if (values.email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(values.email)) {
    problems.push("メールアドレスの形をご確認ください。");
  }
  if (values.body.length > 4000) problems.push("お問い合わせ内容が長すぎます。4000文字まででお願いします。");

  if (trim(form.website)) problems.push("送信できませんでした。");
  const opened = Number(form.t);
  if (Number.isFinite(opened) && opened > 0 && now - opened < 3000) problems.push("送信できませんでした。");

  return { values, problems };
}

/** 通知メールの本文。**聞いた内容をそのまま並べるだけ。要約しない** */
export function notifyBody(v: Record<Field, string>): string {
  const label: Record<Field, string> = {
    name: "お名前", company: "会社名", email: "メールアドレス",
    tel: "お電話番号", subject: "ご用件", body: "お問い合わせ内容",
  };
  return FIELDS.filter((f) => v[f]).map((f) => `${label[f]}：${v[f]}`).join("\n");
}

/** 自動返信。**図面はこの返信に添付してもらう**（D-179。保管先を我々が持たない） */
export function replyBody(v: Record<Field, string>, siteName: string, tel: string): string {
  return [
    `${v.name} 様`, "",
    "お問い合わせをお受けしました。内容を確認のうえ、担当者よりご連絡いたします。", "",
    "図面をお持ちの場合は、このメールにそのまま添付してご返信ください。", "",
    "── お送りいただいた内容 ──", notifyBody(v), "",
    "──", siteName, tel ? `電話 ${tel}` : "",
  ].filter((x) => x !== "").join("\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 返す画面。**ここが「黙って飲み込まない」の実体**（D-177③）。
 * 送れなかったときは、必ず電話番号とメールアドレスを出す。
 */
export function page(
  kind: "ok" | "ng", messages: string[], contact: { tel: string; email: string; site: string },
): string {
  const title = kind === "ok" ? "送信しました" : "送信できませんでした";
  const lead = kind === "ok"
    ? "お問い合わせをお受けしました。確認のうえ、担当者よりご連絡いたします。"
    : "申し訳ありません。フォームからお送りできませんでした。<strong>お手数ですが、下記へ直接ご連絡ください。</strong>";
  const fallback = kind === "ng"
    ? `<p class="big">${contact.tel ? `電話　${esc(contact.tel)}<br>` : ""}${
        contact.email ? `メール　<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : ""}</p>`
    : "";
  return `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}｜${esc(contact.site)}</title>
<style>
 body{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
      line-height:1.85;color:#17202a;margin:0;padding:64px 20px;background:#fff}
 main{max-width:680px;margin:0 auto}h1{font-size:26px;margin:0 0 18px}
 .big{font-size:21px;font-weight:700;line-height:2}
 ul{padding-left:1.3em}a{color:#10456f}
 .back{margin-top:36px;display:inline-block}
</style>
<main>
 <h1>${title}</h1>
 <p>${lead}</p>
 ${messages.length ? `<ul>${messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
 ${fallback}
 <a class="back" href="/contact/">お問い合わせページに戻る</a>
</main>`;
}

/** Resend へ1通送る。**失敗は握りつぶさず、呼び出し元へ返す** */
async function send(
  key: string,
  mail: { from: string; to: string[]; subject: string; text: string; reply_to?: string },
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(mail),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text()}`);
}

export const onRequestPost = async (ctx: any): Promise<Response> => {
  const env = ctx.env ?? {};
  const contact = {
    tel: env.SITE_TEL ?? "",
    email: String(env.INQUIRY_TO ?? "").split(",")[0]?.trim() ?? "",
    site: env.SITE_NAME ?? "",
  };
  const html = (kind: "ok" | "ng", msgs: string[], status: number) =>
    new Response(page(kind, msgs, contact), { status, headers: { "content-type": "text/html; charset=utf-8" } });

  let form: Record<string, unknown> = {};
  try {
    const data = await ctx.request.formData();
    form = Object.fromEntries([...data.entries()]);
  } catch {
    return html("ng", ["送信内容を読み取れませんでした。"], 400);
  }

  const { values, problems } = parseInquiry(form);
  if (problems.length) return html("ng", problems, 400);

  try {
    await send(env.RESEND_API_KEY, {
      from: env.INQUIRY_FROM,
      to: String(env.INQUIRY_TO).split(",").map((x: string) => x.trim()).filter(Boolean),
      subject: `【お問い合わせ】${values.company || values.name} 様`,
      text: notifyBody(values),
      reply_to: values.email || undefined,
    });
  } catch (err) {
    // **届かなかったことを、送った側に必ず伝える**（D-177③）
    console.error("inquiry: notify failed", err);
    return html("ng", ["送信の途中で問題が起きました。"], 502);
  }
  // 自動返信が落ちても、本体は届いている。**受付は成功として返す**
  if (values.email) {
    try {
      await send(env.RESEND_API_KEY, {
        from: env.INQUIRY_FROM, to: [values.email],
        subject: `お問い合わせをお受けしました｜${env.SITE_NAME ?? ""}`,
        text: replyBody(values, env.SITE_NAME ?? "", env.SITE_TEL ?? ""),
      });
    } catch (err) { console.error("inquiry: auto-reply failed", err); }
  }
  return html("ok", [], 200);
};
