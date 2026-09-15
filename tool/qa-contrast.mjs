/**
 * KOBO — 実際に描かれた文字の読みやすさを測る
 *
 *   npm run qa:contrast
 *
 * **宣言ではなく、画面を測る。**
 *
 * 色の検査（`npm run test:contrast`）は前からあるが、**CSSの宣言**を突き合わせている。
 * 宣言が正しくても、**重なりの勝ち負け**（specificity）で負ければ画面には出ない。
 * これで3度やった。
 *
 *   D-329 … 暗い地の表のセルが縞に塗り替えられ、白い文字が 1.10:1 で消えた
 *   D-358 … 項目名の見出し（`data-role="label"`）と料金（`.price`）が
 *            色地・暗い地の上で 1.00〜1.08:1 になっていた
 *
 * ここでは**全15方向を書き出して、ブラウザで合成後の色を測る。**
 * 地の重なり（半透明の札・縞）も、実際に合成してから比べる。
 *
 * 会社データは2社に固定し（製造業・汎用）、**型だけを入れ替える。**
 * 写真は0枚で見る——実案件は写真0枚から始まる。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { DIRECTIONS } from "./lib/design/direction.ts";

/** 本文として読ませる文字の下限。小さい文字・太い文字で分けない（4.5:1 に揃える） */
const MIN = 4.5;
const SRC = {
  manufacturing: "fixtures/design-diversity/b-difficulty.json",
  general: "fixtures/visual-general/g-a-service.json",
};
const PAGES = ["/", "/strengths/", "/capability/", "/company/", "/contact/", "/cases/", "/equipment/", "/message/", "/recruit/"];

const built = [];
for (const d of DIRECTIONS) {
  const pid = `qc15-${d.id}`, dir = path.join("projects", pid);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const p = JSON.parse(fs.readFileSync(SRC[d.plan] ?? SRC.manufacturing, "utf8"));
  p.id = pid; p.photos = []; p.theme = { ...d.axes, direction: d.id };
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));
  /** **書き出しは1件ずつ。** 同時に走らせると `site-template/src/site-data` が混ざる */
  spawnSync("node", ["build-site.mjs", pid], { encoding: "utf8" });
  const site = path.join(dir, "site");
  built.push({ d, root: fs.existsSync(site) ? site : path.join(dir, "site-draft") });
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let ROOT = "";
const server = createServer((req, res) => {
  let q = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(ROOT, q);
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); } catch { }
  let b = null;
  try { b = fs.readFileSync(f); } catch { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  res.end(b);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const measure = () => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  /** **半透明を重ねたあとの色で比べる。** 重なりを無視すると D-329 を取りこぼす */
  const bgOf = (el) => {
    let e = el, acc = [255, 255, 255];
    const stack = [];
    while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) stack.push(c); e = e.parentElement; }
    for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; acc = acc.map((v, j) => c.rgb[j] * c.a + v * (1 - c.a)); }
    return acc;
  };
  const out = [];
  for (const el of document.querySelectorAll("p,h1,h2,h3,li,dd,dt,td,th,span,figcaption,strong,em,a,blockquote")) {
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const f = fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
    const l1 = lum(f), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    out.push({ t: t.slice(0, 20), ratio: +ratio.toFixed(2), size: cs.fontSize, cls: (el.className || "").toString().slice(0, 24) });
  }
  return out;
};

console.log("\n━━━ 実際に描かれた文字の読みやすさ（全15方向・PC/スマホ）━━━\n");
let screens = 0, checked = 0, ng = 0, worst = { ratio: 99 };
for (const b of built) {
  ROOT = b.root;
  const pages = PAGES.filter((u) => u === "/" || fs.existsSync(path.join(ROOT, u, "index.html")));
  for (const [vw, tag] of [[1440, "PC"], [390, "スマホ"]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: 900 } });
    const page = await ctx.newPage();
    for (const u of pages) {
      await page.goto(`http://localhost:${port}${u}`, { waitUntil: "load" });
      const rows = await page.evaluate(measure);
      screens++; checked += rows.length;
      for (const r of rows) {
        if (r.ratio < worst.ratio) worst = { ...r, where: `${b.d.label}（${b.d.id}）${tag} ${u}` };
        if (r.ratio < MIN) { console.log(`  ✗ ${b.d.label}（${b.d.id}）${tag} ${u}  ${r.ratio}:1  ${r.size} 「${r.t}」${r.cls ? ` .${r.cls}` : ""}`); ng++; }
      }
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
for (const b of built) fs.rmSync(path.dirname(b.root), { recursive: true, force: true });

console.log(`\n  ${screens}画面 / ${checked}箇所を測りました`);
console.log(ng ? `\n  ✗ ${MIN}:1 に届かない文字 ${ng}箇所\n` : `  ○ ${MIN}:1 に届かない文字はありません（最小 ${worst.ratio}:1　${worst.where} 「${worst.t}」）\n`);
process.exit(ng ? 1 : 0);
