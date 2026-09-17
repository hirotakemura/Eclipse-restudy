/**
 * KOBO — 生成ビジュアルが「見えているか」を測る（第9段階④）
 *
 *   npm run qa:visible -- <案件ID> [--sweep]
 *
 * **最大画素差だけで判定しない。** 一様に2%暗くなっただけでも最大差は出るが、
 * それは**形として見えていない。** 実測で 4/255 を「入っている」と数えていた失敗がある。
 *
 * 見るのは2つの領域を**別々に**——
 *   画像領域 … 最大差・平均差・**標準偏差**・**局所勾配**（形が立っているか）
 *   文字領域 … 最大差・**実画素をサンプルした文字コントラスト比**
 *              （`qa:contrast` は地の色しか見ないので、絵の上の文字を測れない）
 *
 * `--sweep` は `--asset-strength` を 0.2〜0.9 まで動かし、表にして出す。
 * **値を先に決めない。** 文字が読める範囲で、形がいちばん立つ値を選ぶ。
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { launchChromium, INSTALL_HINT } from "./lib/browser.mjs";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const sweep = args.includes("--sweep");
if (!id) { console.error("\n  使い方: npm run qa:visible -- <案件ID> [--sweep]\n"); process.exit(1); }

const dir = path.join("projects", id);
const ROOT = ["site", "site-draft"].map((d) => path.join(dir, d)).find((d) => fs.existsSync(d));
if (!ROOT) { console.error(`\n  ${dir} に書き出しがありません。先に npm run build:site -- ${id}\n`); process.exit(1); }

const TYPES = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".png":"image/png",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml",
  ".xml":"text/xml", ".txt":"text/plain", ".woff2":"font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("x"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

/** 書き出しの中から、生成ビジュアルが入っているページを探す */
const pages = [];
for (const f of fs.readdirSync(ROOT, { recursive: true })) {
  if (!String(f).endsWith(".html")) continue;
  const body = fs.readFileSync(path.join(ROOT, String(f)), "utf8");
  if (!body.includes('data-asset-source="generated"')) continue;
  pages.push("/" + String(f).replace(/index\.html$/, "").replace(/\\/g, "/"));
}
if (!pages.length) { console.error("\n  生成ビジュアルが入ったページがありません（status が ready の絵がない）\n"); server.close(); process.exit(1); }

const browser = await launchChromium();
if (!browser) { console.error(`\n${INSTALL_HINT}`); server.close(); process.exit(1); }

/** 画面を撮って、絵のある/なしの差を領域ごとに集計する */
const shoot = async (page, el) => {
  const box = await el.boundingBox();
  if (!box || box.height < 8) return null;
  const clip = { x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)),
    width: Math.round(box.width), height: Math.round(Math.min(box.height, 3000)) };
  await page.evaluate(() => {
    const s = document.createElement("style"); s.id = "kobo-off";
    s.textContent = '[data-asset-source="generated"]::before,[data-asset-source="generated"]::after{opacity:0 !important}';
    document.head.append(s);
  });
  const off = await page.screenshot({ clip, type: "png", fullPage: true });
  await page.evaluate(() => document.getElementById("kobo-off")?.remove());
  const on = await page.screenshot({ clip, type: "png", fullPage: true });
  /** 文字の外接矩形（帯の左上を原点に） */
  const text = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const boxes = [];
    for (const e of node.querySelectorAll("h1,h2,h3,p,li,dd,dt,td,th,span,blockquote,figcaption,a,strong")) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      boxes.push([Math.round(b.left - r.left), Math.round(b.top - r.top), Math.round(b.right - r.left), Math.round(b.bottom - r.top)]);
    }
    return boxes;
  });
  return await page.evaluate(async ([a, b, boxes]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + d; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const W = ia.width, H = ia.height;
    const px = (img) => { const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d").drawImage(img, 0, 0); return c.getContext("2d").getImageData(0, 0, W, H).data; };
    const d1 = px(ia), d2 = px(ib);
    /** その画素が文字の外接矩形の中か */
    const inText = new Uint8Array(W * H);
    for (const [x0, y0, x1, y1] of boxes) {
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) inText[y * W + x] = 1;
    }
    const diff = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d1.length; i += 4, p++) {
      diff[p] = Math.max(Math.abs(d1[i] - d2[i]), Math.abs(d1[i+1] - d2[i+1]), Math.abs(d1[i+2] - d2[i+2]));
    }
    const stat = (want) => {
      let n = 0, sum = 0, max = 0, grad = 0, gn = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if ((inText[p] === 1) !== want) continue;
        const v = diff[p]; n++; sum += v; if (v > max) max = v;
        if (x + 1 < W && ((inText[p+1] === 1) === want)) { grad += Math.abs(diff[p+1] - v); gn++; }
      }
      if (!n) return null;
      const mean = sum / n;
      let sq = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x; if ((inText[p] === 1) !== want) continue;
        sq += (diff[p] - mean) ** 2;
      }
      return { n, max: Math.round(max), mean: +mean.toFixed(2), sd: +Math.sqrt(sq / n).toFixed(2),
        grad: +(gn ? grad / gn : 0).toFixed(2) };
    };
    return { image: stat(false), text: stat(true), w: W, h: H };
  }, [off.toString("base64"), on.toString("base64"), text]);
};

/** 文字の背後の**実際の画素**から、コントラスト比を出す（地の色ではなく画面を見る） */
const contrastOf = async (page) => {
  const spots = await page.$$eval('[data-asset-source="generated"] .inner :is(h1,h2,h3,p,li,dd,dt,blockquote)', (els) =>
    els.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
       .map((e) => { const r = e.getBoundingClientRect();
         return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
                  color: getComputedStyle(e).color, t: (e.textContent ?? "").trim().slice(0, 14) }; })
       .filter((s) => s.w > 4 && s.h > 4));
  const out = [];
  for (const s of spots) {
    const shot = await page.screenshot({ clip: { x: s.x, y: s.y, width: s.w, height: Math.min(s.h, 60) }, type: "png", fullPage: true });
    const bg = await page.evaluate(async ([d]) => {
      const i = await new Promise((r) => { const m = new Image(); m.onload = () => r(m); m.src = "data:image/png;base64," + d; });
      const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
      c.getContext("2d").drawImage(i, 0, 0);
      const px = c.getContext("2d").getImageData(0, 0, i.width, i.height).data;
      /** **いちばん明るい画素の集まり**を地とみなす（文字は濃いので下位に落ちる） */
      const lum = [];
      for (let k = 0; k < px.length; k += 4) lum.push([px[k], px[k+1], px[k+2]]);
      lum.sort((a, b) => (b[0]+b[1]+b[2]) - (a[0]+a[1]+a[2]));
      const top = lum.slice(0, Math.max(1, Math.floor(lum.length * 0.2)));
      return top.reduce((a, c2) => a.map((v, j) => v + c2[j] / top.length), [0,0,0]);
    }, [shot.toString("base64")]);
    const L = (c) => { const [r,g,b] = c.map((v) => { v /= 255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055) ** 2.4; });
      return .2126*r + .7152*g + .0722*b; };
    const fg = (s.color.match(/\d+/g) ?? [0,0,0]).slice(0,3).map(Number);
    const [hi, lo] = [L(fg), L(bg)].sort((a,b) => b-a);
    out.push({ t: s.t, ratio: +((hi + .05) / (lo + .05)).toFixed(2) });
  }
  return out;
};

const VIEWS = [["PC", 1280, 900], ["スマホ", 390, 844]];
const LEVELS = sweep ? [.2, .3, .4, .5, .6, .7, .8, .9] : [null];

console.log(`\n  ${id}　${pages.length}ページ　${ROOT}\n`);
for (const level of LEVELS) {
  if (level !== null) console.log(`\n━━━ --asset-strength: ${level} ━━━`);
  for (const [label, w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const rows = [];
    let worstContrast = Infinity, worstText = "";
    for (const url of pages) {
      await page.goto(`http://localhost:${port}${url}`, { waitUntil: "networkidle" });
      if (level !== null) {
        await page.addStyleTag({ content: `.band[data-asset-source="generated"],.hero[data-asset-source="generated"]{--asset-strength:${level} !important}` });
      }
      for (const el of await page.$$('[data-asset-source="generated"]')) {
        const gid = await el.getAttribute("data-asset-generated");
        const r = await shoot(page, el);
        if (r) rows.push([gid, r]);
      }
      for (const c of await contrastOf(page)) if (c.ratio < worstContrast) { worstContrast = c.ratio; worstText = c.t; }
    }
    console.log(`\n  ── ${label} ──`);
    for (const [gid, r] of rows) {
      const i = r.image, t = r.text;
      console.log(`    ${(gid ?? "").padEnd(22)}`);
      console.log(`       画像領域  最大 ${String(i?.max ?? "-").padStart(3)}  平均 ${String(i?.mean ?? "-").padStart(5)}  標準偏差 ${String(i?.sd ?? "-").padStart(5)}  局所勾配 ${String(i?.grad ?? "-").padStart(5)}`);
      console.log(`       文字領域  最大 ${String(t?.max ?? "-").padStart(3)}  平均 ${String(t?.mean ?? "-").padStart(5)}`);
    }
    console.log(`    文字コントラスト（実画素）最小 ${worstContrast === Infinity ? "-" : worstContrast}:1　「${worstText}」`);
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log("");
