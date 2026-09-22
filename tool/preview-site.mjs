/**
 * KOBO — 書き出したサイトをブラウザで見る
 *
 *   npm run preview:site -- <案件ID>
 *
 * **`file://` で開くと、リンクも写真も切れる。**
 * サイト内のリンクは `/capability/` の形なので、file:// ではディスクの根っこを指してしまう。
 * 公開したときと同じ見え方にするために、小さなサーバーで配る。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { spawn } from "node:child_process";

const id = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!id) {
  console.error("\n  使い方: npm run preview:site -- <案件ID>\n");
  process.exit(1);
}

/**
 * 公開してよいもの（site/）を優先して見せる。
 * 無ければ、公開できない状態の書き出し（site-draft/）を見せる。**そのことを必ず言う。**
 */
const siteDir = resolve(join("projects", id, "site"));
const draftDir = resolve(join("projects", id, "site-draft"));
const isDraft = !existsSync(siteDir) && existsSync(draftDir);
const root = isDraft ? draftDir : siteDir;

/**
 * **どの書き出しを見せているのかを、必ず言う**（D-442）。
 *
 * 公開してよいもの（`site/`）を優先して見せるが、**古い `site/` が残っていると、
 * 黙って古い画面を見せてしまう。** 書き出しに失敗した回は `site/` を消して
 * `site-draft/` に回すので、**最後に成功した回の画面がそのまま残る。**
 * 実際に「直したはずのものが、手元では何も変わっていない」が起きた。
 * **黙って古いものを見せない**——どちらを、いつ書き出したものかを出す。
 */
const timeOf = (d) => (existsSync(d) ? statSync(d).mtime : null);
const siteAt = timeOf(siteDir);
const draftAt = timeOf(draftDir);
const stale = Boolean(siteAt && draftAt && draftAt > siteAt);

if (!existsSync(root)) {
  console.error(`\n  まだ書き出されていません: projects/${id}/site`);
  console.error(`  先に  npm run build:site -- ${id}  を実行してください。\n`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const PORT = Number(process.env.PREVIEW_PORT ?? 4321);

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = resolve(join(root, path));

  // 案件フォルダの外に出さない
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  // 「/capability/」のようなURLは、そのフォルダの index.html を返す
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");

  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": MIME[".html"] });
    return res.end(`<meta charset="utf-8"><p style="font-family:system-ui;padding:40px">
      このページはありません：${path}</p>`);
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(await readFile(file));
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}/`;
  const fmt = (t) => (t ? t.toLocaleString("ja-JP") : "—");
  console.log(`\n  ${id} のサイトを開きます`);
  console.log(`  見せているのは： ${isDraft ? "site-draft/（確認用）" : "site/（公開してよいもの）"}　${fmt(isDraft ? draftAt : siteAt)}\n`);
  /**
   * **確認用のほうが新しいときは、必ず言う。**
   * 「直したはずなのに変わらない」の原因は、たいていこれである
   */
  if (stale) {
    console.log("  ※ **いま見せているのは、前に成功した書き出しです。**");
    console.log(`     もっと新しい確認用の書き出しがあります： site-draft/　${fmt(draftAt)}`);
    console.log("     直近の書き出しは公開判定で止まっているので、site/ は更新されていません。");
    console.log("     新しいほうを見るには、いったん site/ を消してください：");
    console.log(`       rm -rf ${draftDir.replace("site-draft", "site")}\n`);
  }
  if (isDraft) {
    console.log("  ※ これは**公開できない状態**の書き出しです（確認用）。");
    console.log("     足りない項目をKOBOで埋めて、もう一度 build:site を実行してください。\n");
  }
  console.log(`    ${url}\n`);
  console.log("  終わるときは Control + C\n");
  // macOS なら自動でブラウザを開く
  if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
});
