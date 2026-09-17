/**
 * KOBO — 画面を測るためのブラウザを見つける
 *
 * **置き場所を直書きしない。** 直す前は `/opt/node22/…` という
 * **この開発環境だけのパス**が3つのスクリプトに書いてあり、
 * 社長のMacでは `ERR_MODULE_NOT_FOUND` で落ちた。**測れない道具は道具ではない。**
 *
 * 探す順に意味がある：
 *   1. 案件の `node_modules`（`npm i -D playwright` を入れた環境）
 *   2. 開発環境の決め打ちの場所（この環境にはここにある）
 * どちらも無ければ `null` を返す。**呼ぶ側が「飛ばす」か「止まる」かを決める。**
 */
const CANDIDATES = [
  "playwright",
  "/opt/node22/lib/node_modules/playwright/index.js",
];

/** 開発環境に置いてある Chromium。**無ければ playwright に探させる** */
const BROWSER_PATHS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
];

export const INSTALL_HINT =
  "  playwright が見つかりません。測るには次を実行してください：\n"
  + "    npm i -D playwright && npx playwright install chromium\n";

/**
 * Chromium を起動する。見つからなければ `null`。
 * @param {object} opts playwright の launch にそのまま渡す
 */
export async function launchChromium(opts = {}) {
  let pw = null;
  for (const c of CANDIDATES) {
    try { pw = (await import(c)).default ?? (await import(c)); break; } catch { /* 次を試す */ }
  }
  if (!pw?.chromium) return null;

  const fs = await import("node:fs");
  const exe = BROWSER_PATHS.find((p) => fs.existsSync(p));
  return await pw.chromium.launch(exe ? { executablePath: exe, ...opts } : opts);
}
