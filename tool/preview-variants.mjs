/**
 * KOBO — 型ごとの書き出しを、1つの画面で見比べる（D-472）
 *
 *   npm run preview:variants -- <案件ID>          … このPCで見る
 *   npm run preview:variants -- <案件ID> --lan    … 同じ回線のタブレットからも見られるようにする
 *
 * 先に  npm run variants -- <案件ID>  で書き出しておく。
 *
 * 【原稿のご確認で使う】
 *   ① 中身の入ったサイトを2〜3通り並べてお見せし、選んでいただく（D-471）
 *   ② 文字の大きさを、**ご本人の目で**切り替えて選んでいただく（D-153）
 *   ③ 決まったら「この見た目に決める」で、型と文字の大きさを案件データに記録する
 *
 * 【住所の付け直し】
 * 書き出したサイトは `/strengths/` のように**先頭が `/` の住所**で作られている。
 * 1つの配信の下に並べると別の型に飛んでしまうので、配るときだけ `/v/<型>/` を頭に付け直す。
 * **書き出したファイルは書き換えない**（配る途中で直すだけ）。
 * 同じ出どころで配るので、見比べ画面から各サイトの文字の大きさを直接切り替えられる。
 */
import { createServer } from "node:http";
import fs from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PRESETS } from "./lib/theme.ts";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const lan = args.includes("--lan");
if (!id) {
  console.error("\n  使い方: npm run preview:variants -- <案件ID> [--lan]\n");
  process.exit(1);
}
const projectDir = path.resolve("projects", id);
const root = path.join(projectDir, "variants");
const metaFile = path.join(root, "variants.json");
if (!fs.existsSync(metaFile)) {
  console.error(`\n  まだ書き出されていません。先に  npm run variants -- ${id}  を実行してください。\n`);
  process.exit(1);
}
const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 文字の大きさは、見比べ画面で選んだものを**どのページでも**当てる（別タブで開いても同じ） */
const FS_KEY = `kobo-variant-fs:${id}`;
const APPLY_FS = `<script>try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(FS_KEY)})||"null");`
  + `if(v&&v.size){var s=document.documentElement.style;s.setProperty("--font-size",v.size);s.setProperty("--measure",v.measure)}}catch(e){}</script>`;

/** **住所の頭に `/v/<型>/` を付け直す。** 書き出しの形は決まっているので、属性と url() だけ見ればよい */
export function rewrite(html, prefix) {
  return html
    .replace(/(\s(?:href|src|action|poster)=")\/(?!\/)/g, `$1${prefix}/`)
    .replace(/(\ssrcset=")([^"]*)"/g, (_, a, v) => a + v.split(",").map((x) => {
      const t = x.trim();
      return t.startsWith("/") && !t.startsWith("//") ? prefix + t : t;
    }).join(", ") + '"')
    .replace(/url\((['"]?)\/(?!\/)/g, `url($1${prefix}/`)
    .replace(/<head>/i, `<head>${APPLY_FS}`);
}

function page() {
  const cards = meta.items.map((v) => `
    <article class="card" data-id="${esc(v.id)}">
      <header>
        <h2>${esc(v.label)}${v.preferred ? ' <span class="badge">お客様のご希望</span>' : ""}</h2>
        <p>${esc(v.note)}</p>
      </header>
      <div class="frame"><iframe src="/v/${esc(v.id)}/" title="${esc(v.label)}" loading="lazy"></iframe></div>
      <footer>
        <a href="/v/${esc(v.id)}/" target="_blank" rel="noopener">この型で開く</a>
        <button type="button" class="decide" data-id="${esc(v.id)}">この見た目に決める</button>
      </footer>
    </article>`).join("");
  const sizes = meta.textSizes.map((t) =>
    `<button type="button" class="size" data-id="${esc(t.id)}" data-size="${esc(t.size)}" data-measure="${esc(t.measure)}">${esc(t.label)}</button>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>見た目の見比べ — ${esc(meta.name)}</title>
<style>
  :root { --ink:#23221f; --muted:#6f6d66; --line:#e2e1dc; --accent:#1f6f4a; --soft:#e6f1ea; --bg:#f7f7f5; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; color:var(--ink); background:var(--bg); font-size:16px; line-height:1.7; }
  .top { position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid var(--line); padding:12px 16px; display:flex; flex-wrap:wrap; gap:10px 24px; align-items:center; }
  .top h1 { font-size:18px; margin:0 auto 0 0; }
  .top h1 small { display:block; font-size:13px; color:var(--muted); font-weight:400; }
  .group { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .group > span { font-size:13px; color:var(--muted); margin-right:4px; }
  button, .card a { font:inherit; min-height:44px; padding:8px 14px; border:1px solid var(--line); background:#fff; color:inherit; border-radius:8px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
  button[aria-pressed="true"] { background:var(--soft); border-color:var(--accent); color:var(--accent); font-weight:600; }
  .grid { display:grid; gap:20px; padding:20px 16px 40px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); max-width:1800px; margin:0 auto; }
  .card { background:#fff; border:1px solid var(--line); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; }
  .card header { padding:12px 16px 8px; }
  .card h2 { font-size:18px; margin:0; }
  .card header p { margin:2px 0 0; font-size:13px; color:var(--muted); }
  .badge { font-size:12px; background:var(--soft); color:var(--accent); border-radius:999px; padding:2px 10px; vertical-align:middle; font-weight:600; }
  .frame { position:relative; overflow:hidden; border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:var(--bg); }
  .frame iframe { position:absolute; top:0; left:0; border:0; transform-origin:0 0; background:#fff; }
  .card footer { display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; }
  .decide { margin-left:auto; }
  .decided { outline:3px solid var(--accent); }
  .note { font-size:13px; color:var(--muted); padding:0 16px 24px; max-width:1800px; margin:0 auto; }
  .msg { font-size:14px; color:var(--accent); min-height:1.7em; }
</style></head><body>
<div class="top">
  <h1>見た目の見比べ<small>${esc(meta.name)}　${meta.preferred ? "ご希望の型を先頭に並べています" : "ご希望の型は伺っていません"}</small></h1>
  <div class="group" role="group" aria-label="文字の大きさ"><span>文字の大きさ</span>${sizes}</div>
  <div class="group" role="group" aria-label="画面の幅"><span>画面の幅</span>
    <button type="button" class="width" data-w="1280" data-h="800">パソコン</button>
    <button type="button" class="width" data-w="390" data-h="780">スマホ</button>
  </div>
  <div class="msg" id="msg" role="status"></div>
</div>
<main class="grid">${cards}</main>
<p class="note">型と文字の大きさは、ここで切り替えても<strong>案件データは変わりません</strong>。決まったら「この見た目に決める」を押すと、案件データに記録します。
KOBOでこの案件を開いている場合は、先にKOBOを閉じてください（開いたままだと、KOBOの自動保存で元に戻ることがあります）。</p>
<script>
const FS_KEY = ${JSON.stringify(FS_KEY)};
const sizes = [...document.querySelectorAll(".size")];
const widths = [...document.querySelectorAll(".width")];
let W = 1280, H = 800;
const current = () => { try { return JSON.parse(localStorage.getItem(FS_KEY) || "null"); } catch { return null; } };
function applySize(frame) {
  const v = current();
  try {
    const s = frame.contentDocument?.documentElement?.style;
    if (s && v) { s.setProperty("--font-size", v.size); s.setProperty("--measure", v.measure); }
  } catch {}
}
function pickSize(btn) {
  const v = { id: btn.dataset.id, size: btn.dataset.size, measure: btn.dataset.measure };
  try { localStorage.setItem(FS_KEY, JSON.stringify(v)); } catch {}
  for (const b of sizes) b.setAttribute("aria-pressed", String(b === btn));
  for (const f of document.querySelectorAll("iframe")) applySize(f);
}
function layout() {
  for (const b of widths) b.setAttribute("aria-pressed", String(Number(b.dataset.w) === W));
  for (const box of document.querySelectorAll(".frame")) {
    const f = box.querySelector("iframe");
    const scale = Math.min(1, box.clientWidth / W);
    f.style.width = W + "px"; f.style.height = H + "px"; f.style.transform = "scale(" + scale + ")";
    /** スマホの幅は枠より狭いので、真ん中に置く（左に寄ると右半分が空いて見える） */
    f.style.left = Math.max(0, Math.round((box.clientWidth - W * scale) / 2)) + "px";
    box.style.height = Math.round(H * scale) + "px";
  }
}
for (const b of sizes) b.onclick = () => pickSize(b);
for (const b of widths) b.onclick = () => { W = Number(b.dataset.w); H = Number(b.dataset.h); layout(); };
for (const f of document.querySelectorAll("iframe")) f.addEventListener("load", () => applySize(f));
addEventListener("resize", layout);
const start = sizes.find((b) => b.dataset.id === (current()?.id ?? ${JSON.stringify(meta.current)})) ?? sizes[0];
pickSize(start);
layout();
for (const b of document.querySelectorAll(".decide")) b.onclick = async () => {
  const size = current()?.id;
  const label = b.closest(".card").querySelector("h2").firstChild.textContent.trim();
  const sizeLabel = sizes.find((x) => x.dataset.id === size)?.textContent ?? "";
  if (!confirm("「" + label + "」・文字「" + sizeLabel + "」に決めて、案件データに記録します。よろしいですか？")) return;
  const res = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: b.dataset.id, textSize: size }) });
  const out = await res.json().catch(() => ({}));
  document.getElementById("msg").textContent = res.ok ? "記録しました：" + label + "・" + sizeLabel : "記録できませんでした：" + (out.error ?? res.status);
  if (res.ok) for (const c of document.querySelectorAll(".card")) c.classList.toggle("decided", c === b.closest(".card"));
};
</script></body></html>`;
}

/**
 * **決まった見た目を記録する。** 型の見本の9軸をまとめて入れ、文字の大きさを重ねる。
 * いつ決めたかを `themeDecidedAt` に残す——**ご希望（取材）と決定（原稿のご確認）を区別する**ため。
 */
async function decide(body) {
  const file = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(file, "utf8"));
  const allowed = meta.items.map((v) => v.id);
  if (!allowed.includes(body.direction)) throw new Error("見比べに出していない型です");
  const preset = PRESETS.find((p) => p.id === body.direction);
  const sizes = meta.textSizes.map((t) => t.id);
  if (!sizes.includes(body.textSize)) throw new Error("文字の大きさが選ばれていません");
  project.theme = { ...preset.theme, direction: preset.id, textSize: body.textSize };
  project.themeDecidedAt = new Date().toISOString();
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(project, null, 2) + "\n", "utf8");
  await rename(tmp, file);
  return { direction: preset.id, textSize: body.textSize, decidedAt: project.themeDecidedAt };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === "/" || p === "/index.html") {
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
      return res.end(page());
    }
    if (p === "/api/decide" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const out = await decide(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      res.writeHead(200, { "content-type": MIME[".json"] });
      return res.end(JSON.stringify(out));
    }
    const m = /^\/v\/([^/]+)(\/.*)?$/.exec(p);
    if (m && meta.items.some((v) => v.id === m[1])) {
      const base = path.join(root, m[1]);
      let file = path.resolve(path.join(base, m[2] ?? "/"));
      if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) {
        res.writeHead(404, { "content-type": MIME[".html"] });
        return res.end(`<meta charset="utf-8"><p style="font-family:system-ui;padding:40px">このページはありません：${esc(p)}</p>`);
      }
      const ext = path.extname(file);
      res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" });
      if (ext === ".html" || ext === ".css") return res.end(rewrite(await readFile(file, "utf8"), `/v/${m[1]}`));
      return res.end(await readFile(file));
    }
    res.writeHead(404, { "content-type": MIME[".html"] });
    res.end(`<meta charset="utf-8"><p style="font-family:system-ui;padding:40px">見つかりません：${esc(p)}</p>`);
  } catch (e) {
    res.writeHead(400, { "content-type": MIME[".json"] });
    res.end(JSON.stringify({ error: e.message }));
  }
});

const PORT = Number(process.env.PREVIEW_PORT ?? 4331);
server.on("error", (e) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`\n  ${PORT}番はもう使われています。見比べ画面が別の窓で開いたままかもしれません。`);
  console.error(`  そちらを Control + C で閉じるか、PREVIEW_PORT=4332 を付けて開いてください。\n`);
  process.exit(1);
});
server.listen(PORT, lan ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`\n  ${meta.name} の見比べ（${meta.items.length}通り・${new Date(meta.builtAt).toLocaleString("ja-JP")} に書き出し）`);
  console.log(`\n    http://localhost:${PORT}/`);
  if (lan) {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) console.log(`    http://${a.address}:${PORT}/　（同じ回線のタブレットから）`);
    }
  }
  console.log("\n  終わるときは Control + C\n");
  if (process.platform === "darwin" && !process.env.KOBO_NO_OPEN) spawn("open", [`http://localhost:${PORT}/`], { stdio: "ignore", detached: true }).unref();
});
