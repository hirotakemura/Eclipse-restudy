<?php
/**
 * お問い合わせの受け口（移管先のレンタルサーバー用）。
 *
 * **`site-template/functions/api/inquiry.ts` と同じ振る舞いをします。**
 * 受け取る項目も、返す画面も同じなので、**サイトのHTMLは1文字も変えずに動きます。**
 *
 * 【置き方】エックスサーバーなど、PHPが動く一般的なレンタルサーバー
 *   ① このファイルを  /api/inquiry.php  に置く
 *   ② 同梱の .htaccess を  /  に置く（/api/inquiry へのアクセスをこのファイルに回します）
 *   ③ 下の「設定」4行を書き換える
 *   ④ ブラウザでフォームから1件送り、届くことを確かめる
 *
 * **鍵も外部サービスも要りません。** サーバーの mail() で送ります。
 * Resend を使い続ける場合は、下の send_resend() を使ってください（鍵が要ります）。
 */

// ── 設定（ここだけ書き換える）─────────────────────
$TO        = "info@example.co.jp";      // 通知先。カンマ区切りで複数可
$FROM      = "no-reply@example.co.jp";  // 差出人。このサーバーのドメインに合わせる
$SITE_NAME = "有限会社 ○○";
$SITE_TEL  = "093-000-0000";
$RESEND_KEY = "";                        // Resend を使う場合だけ。空ならサーバーの mail() で送る
// ───────────────────────────────────────────────

$FIELDS = ["name" => "お名前", "company" => "会社名", "email" => "メールアドレス",
           "tel" => "お電話番号", "subject" => "ご用件", "body" => "お問い合わせ内容"];

function v($k) { return isset($_POST[$k]) ? trim((string)$_POST[$k]) : ""; }

/** 入力を確かめる（TS版の parseInquiry と同じ規則） */
function check($FIELDS) {
  $p = [];
  if (v("name") === "") $p[] = "お名前をご記入ください。";
  if (v("body") === "") $p[] = "お問い合わせ内容をご記入ください。";
  if (v("email") === "" && v("tel") === "") $p[] = "メールアドレスかお電話番号を、どちらかご記入ください。";
  if (v("email") !== "" && !preg_match('/^[^@\s]+@[^@\s.]+\.[^@\s]+$/', v("email"))) $p[] = "メールアドレスの形をご確認ください。";
  if (mb_strlen(v("body")) > 4000) $p[] = "お問い合わせ内容が長すぎます。4000文字まででお願いします。";
  // 画面に出ていない欄が埋まっていたら機械
  if (v("website") !== "") $p[] = "送信できませんでした。";
  $t = (float)v("t");
  if ($t > 0 && (microtime(true) * 1000 - $t) < 3000) $p[] = "送信できませんでした。";
  return $p;
}

function notify_body($FIELDS) {
  $lines = [];
  foreach ($FIELDS as $k => $label) if (v($k) !== "") $lines[] = "{$label}：" . v($k);
  return implode("\n", $lines);
}

/**
 * 返す画面。**送れなかったときは、必ず電話番号とメールアドレスを出す。**
 * 黙って飲み込むのが最悪です（届いたと思われたまま失注します）。
 */
/**
 * @param $entered 書いていただいた内容（送れなかったときに画面へ残す・D-246）
 *                 残さないと、長い相談文を書いた人がもう一度打ち直すことになる。
 *                 実際には打ち直さず、そのまま去る。**失注そのもの。**
 */
function page($ok, $messages, $SITE_NAME, $SITE_TEL, $TO, $entered = "") {
  $title = $ok ? "送信しました" : "送信できませんでした";
  $lead  = $ok ? "お問い合わせをお受けしました。確認のうえ、担当者よりご連絡いたします。"
               : "申し訳ありません。フォームからお送りできませんでした。<strong>お手数ですが、下記へ直接ご連絡ください。</strong>";
  $list = "";
  foreach ($messages as $m) $list .= "<li>" . htmlspecialchars($m, ENT_QUOTES, "UTF-8") . "</li>";
  $to1 = trim(explode(",", $TO)[0]);
  $fb = $ok ? "" : '<p class="big">電話　' . htmlspecialchars($SITE_TEL, ENT_QUOTES, "UTF-8")
              . '<br>メール　<a href="mailto:' . htmlspecialchars($to1, ENT_QUOTES, "UTF-8") . '">'
              . htmlspecialchars($to1, ENT_QUOTES, "UTF-8") . '</a></p>';

  // **書いた内容を返す。** そのままメールでも送れるようにしておく（TS版と同じ）
  $keep = "";
  if (!$ok && $entered !== "") {
    $mail = "mailto:" . rawurlencode($to1) . "?subject=" . rawurlencode("お問い合わせ") . "&body=" . rawurlencode($entered);
    $keep = '<h2>お書きいただいた内容</h2>'
          . '<p>下の内容は消えていません。そのままメールでお送りいただけます。</p>'
          . '<p><a class="btn" href="' . htmlspecialchars($mail, ENT_QUOTES, "UTF-8") . '">このままメールで送る</a></p>'
          . '<textarea rows="10" readonly onclick="this.select()">'
          . htmlspecialchars($entered, ENT_QUOTES, "UTF-8") . '</textarea>';
  }
  http_response_code($ok ? 200 : 400);
  header("Content-Type: text/html; charset=utf-8");
  echo '<!doctype html><html lang="ja"><meta charset="utf-8">'
     . '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
     . "<title>{$title}｜" . htmlspecialchars($SITE_NAME, ENT_QUOTES, "UTF-8") . "</title>"
     . '<style>body{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;'
     . 'line-height:1.85;color:#17202a;margin:0;padding:64px 20px;background:#fff}'
     . 'main{max-width:680px;margin:0 auto}h1{font-size:26px;margin:0 0 18px}'
     . '.big{font-size:21px;font-weight:700;line-height:2}ul{padding-left:1.3em}a{color:#10456f}'
     . 'h2{font-size:19px;margin:40px 0 10px}'
     . 'textarea{width:100%;font:inherit;line-height:1.8;padding:12px 14px;border:1px solid #929599;border-radius:8px;background:#fff;color:#17202a}'
     . '.btn{display:inline-block;background:#10456f;color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:4px;margin:0 0 14px}'
     . '.back{margin-top:36px;display:inline-block}</style>'
     . "<main><h1>{$title}</h1><p>{$lead}</p>"
     . ($list ? "<ul>{$list}</ul>" : "") . $fb . $keep
     . '<a class="back" href="/contact/">お問い合わせページに戻る</a></main>';
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") page(false, ["このページは直接開けません。"], $SITE_NAME, $SITE_TEL, $TO);

$problems = check($FIELDS);
if ($problems) page(false, $problems, $SITE_NAME, $SITE_TEL, $TO, notify_body($FIELDS));

$subject = "【お問い合わせ】" . (v("company") !== "" ? v("company") : v("name")) . " 様";
$headers = "From: {$FROM}\r\n";
if (v("email") !== "") $headers .= "Reply-To: " . v("email") . "\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

$sent = @mb_send_mail($TO, $subject, notify_body($FIELDS), $headers);
if (!$sent) page(false, ["送信の途中で問題が起きました。"], $SITE_NAME, $SITE_TEL, $TO, notify_body($FIELDS));

// 自動返信（落ちても受付は成功。図面はこの返信に添付してもらう）
if (v("email") !== "") {
  $reply = v("name") . " 様\n\nお問い合わせをお受けしました。内容を確認のうえ、担当者よりご連絡いたします。\n\n"
         . "図面をお持ちの場合は、このメールにそのまま添付してご返信ください。\n\n"
         . "── お送りいただいた内容 ──\n" . notify_body($FIELDS) . "\n\n──\n{$SITE_NAME}\n電話 {$SITE_TEL}";
  @mb_send_mail(v("email"), "お問い合わせをお受けしました｜{$SITE_NAME}", $reply, "From: {$FROM}\r\nContent-Type: text/plain; charset=UTF-8\r\n");
}

page(true, [], $SITE_NAME, $SITE_TEL, $TO);
