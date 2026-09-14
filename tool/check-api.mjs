/**
 * KOBO — APIキーが本当に効いているかを、1回だけ叩いて確かめる
 *
 *   npm run check:api
 *
 * **「クレジットが減っていない」を、思い込みで片付けないための道具。**
 *
 * 原稿生成は9ページぶん動くので、失敗しても成功しても原因が分かりにくい。
 * ここでは**いちばん小さい呼び出しを1回だけ**して、返ってきた数字を出す。
 *
 *   ・request id が返る　　… その呼び出しは Anthropic 側に確かに届いている
 *   ・トークン数が返る　　… 課金の対象になった量そのもの
 *   ・どのモデルが答えたか … 意図したモデルか（別のモデルに落ちていないか）
 *
 * **費用は1円未満。** 出力を数トークンに絞ってある。
 */
import process from "node:process";

const key = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? "";
const MODEL = "claude-opus-5";

/** 1ドル=155円。pipeline.ts と同じ単価（Claude Opus 5・2026年9月時点） */
const PRICE = { input: 5, output: 25 };
const yen = (tokens, price) => ((tokens / 1e6) * price * 155);

console.log("\n━━━ APIキーの確認 ━━━\n");

if (!key) {
  console.error("  ✗ **APIキーがありません。**\n");
  console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...\n");
  console.error("  この端末でキーを設定してから、もう一度実行してください。");
  console.error("  （`export` はそのターミナルの中だけで有効です。**窓を閉じると消えます。**）\n");
  process.exit(1);
}

/**
 * **一覧に出ている `apikey_...` は、キーのID であってキーではない**（D-231）。
 * 形だけでも先に見て、無駄な往復をしない。
 */
console.log(`  設定されている値：${key.slice(0, 12)}…（${key.length}文字）`);
if (!key.startsWith("sk-ant-")) {
  console.error("\n  ✗ 形が違います。キー本体は `sk-ant-api03-` から始まります。");
  if (key.startsWith("apikey_")) {
    console.error("    これは**キーのID**（コンソールの一覧に出ている文字列）です。");
    console.error("    **キー本体は作成時に一度しか表示されません。** 分からなければ作り直してください。");
  }
  console.error("");
  process.exit(1);
}

const base = process.env.ANTHROPIC_BASE_URL;
if (base) console.log(`  接続先：${base}`);
console.log(`  モデル：${MODEL}\n`);

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const client = new Anthropic();

let message;
try {
  message = await client.messages.create({
    model: MODEL,
    max_tokens: 16,
    messages: [{ role: "user", content: "1+1は？　数字だけ答えてください。" }],
  });
} catch (err) {
  const status = err?.status;
  console.error("  ✗ 呼び出せませんでした。\n");
  if (status === 401) {
    console.error("    401：キーが受け付けられませんでした。");
    console.error("    失効しているか、別の組織のキーです。作り直してください。");
  } else if (status === 403) {
    console.error("    403：そのキーでは、このモデルを使う権限がありません。");
  } else if (status === 400 && /credit|balance/i.test(err?.message ?? "")) {
    console.error("    400：**残高が足りません。** コンソールでクレジットを足してください。");
    console.error(`    ${err.message}`);
  } else if (status === 429) {
    console.error("    429：回数の上限です。時間をおいてください。");
  } else {
    console.error(`    ${status ?? ""} ${err?.message ?? err}`);
  }
  console.error("\n  https://console.anthropic.com → Settings → API keys\n");
  process.exit(1);
}

const u = message.usage ?? {};
const inTok = u.input_tokens ?? 0;
const outTok = u.output_tokens ?? 0;
const cost = yen(inTok, PRICE.input) + yen(outTok, PRICE.output);

console.log("  ○ **APIは確かに使われました。**\n");
console.log(`    request id　　${message._request_id ?? "(返りませんでした)"}`);
console.log(`    答えたモデル　${message.model}`);
console.log(`    入力　　　　　${inTok} トークン`);
console.log(`    出力　　　　　${outTok} トークン`);
console.log(`    この1回の費用　約 ${cost.toFixed(4)} 円`);
console.log(`    返答　　　　　${message.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim()}`);

/**
 * **数字が出たのに残高が動いて見えない**とき、コードの話ではなくなる。
 * どこを見ればよいかまで書く。ここで案内を切ると、また同じところで止まる。
 */
console.log(`
  ── 残高が減っていないように見えるとき ──

  上に request id とトークン数が出ていれば、**この呼び出しは課金されています。**
  そのうえで残高が動いて見えない場合、見ている場所が違う可能性があります。

    使用量　　 https://console.anthropic.com/settings/usage
               → 日付とモデルごとのトークン数。**ここに出ていれば確実**
    残高　　　 https://console.anthropic.com/settings/billing

  ・**claude.ai の契約（Pro / Max）とは別勘定です。** APIの残高はコンソール側だけ。
  ・残高の表示には反映の時間差があります。**使用量のほうが先に出ます。**
  ・組織が複数ある場合、**鍵を作った組織と、見ている組織が同じか**を確かめてください
    （コンソール左上の切り替え）。
`);
