/** qa-assets.mjs から呼ばれる。**毎回まっさらな窓で撮る**（D-309） */
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const OUT = process.argv[2];
const JOBS = process.argv.slice(3).map((s) => { const [pid, label, root] = s.split("|"); return { pid, label, root }; });
const PAGES = ["/", "/strengths/", "/capability/", "/company/", "/contact/"];
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let chromium;
try { chromium = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default.chromium; }
catch { console.log("  （playwright が無いので撮影は飛ばします）"); process.exit(0); }
const serve = (root, port) => new Promise((r) => { const s = http.createServer((q, res) => {
  let f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }); res.end(fs.readFileSync(f));
}); s.listen(port, () => r(s)); });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let n = 0;
for (const job of JOBS) {
  const srv = await serve(job.root, 4801);
  for (const [w, tag] of [[1440, "pc"], [390, "sp"]]) {
    for (const p of PAGES) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
      const pg = await ctx.newPage();
      const r = await pg.goto("http://127.0.0.1:4801" + p, { waitUntil: "networkidle" }).catch(() => null);
      if (r && r.status() === 200) {
        await pg.evaluate(() => document.getAnimations().forEach((a) => a.finish?.()));
        const name = (p.replace(/^\//, "").replace(/\/$/, "") || "index").replace(/\//g, "-");
        await pg.screenshot({ path: path.join(OUT, `${job.pid}-${tag}-${name}.png`), fullPage: true });
        n++;
      }
      await ctx.close();
    }
  }
  srv.close();
}
await b.close();
console.log(`  ${n}枚 撮りました`);
