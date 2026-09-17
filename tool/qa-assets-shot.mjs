/**
 * qa-assets.mjs から呼ばれる。撮って、**実際の描画結果を測る。**
 *
 * 【原則A】CSSの宣言ではなく、**重なり合った実際の描画結果**を見る（D-310・D-314）。
 * `test:contrast` は `color:` と `background:` の宣言を読んでいて、
 * **重なりの勝ち負けを見ていない。** それで同じ形の見落としを3度した
 * （D-232・D-237・D-310）。**確かめるのはブラウザが採用した値である。**
 *
 * 【原則B】コントラストが正常でも、**装飾が本文・数字・重要情報に重なっていない**ことを見る
 * （D-312・D-314）。スマホで弧が本文を横切ったとき、**比は落ちていなかった**——
 * 白い文字は弧の上にあるからで、**数字では捕まらない種類の不具合**だった。
 *
 * **毎回まっさらな窓で撮る**（D-309）。走り出しの1枚目は字の読み込みが間に合わない。
 */
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const OUT = process.argv[2];
const JOBS = process.argv.slice(3).map((s) => { const [pid, label, root, shots] = s.split("|"); return { pid, label, root, shots: shots ? shots.split(",") : null }; });
/** 撮る画面。**人が見るためのもの**なので絞る */
const SHOT_PAGES = ["/", "/strengths/", "/capability/", "/company/", "/contact/"];
/**
 * 測る画面。**撮る枚数は増やさずに、検査だけ広げる**（第4段階）。
 *
 * 会社概要しか測っていなかったとき、**写真0枚の会社で「外観」の見出しだけが出ていた**のを
 * 1ページぶんしか見つけられなかった。**測っていないページは、無いのと同じ**（D-192）。
 */
const CHECK_PAGES = ["/", "/strengths/", "/capability/", "/equipment/", "/cases/", "/cases/1/",
  "/company/", "/message/", "/recruit/", "/contact/"];
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let chromium;
const { launchChromium } = await import("./lib/browser.mjs");
chromium = { launch: launchChromium };
const serve = (root, port) => new Promise((r) => { const s = http.createServer((q, res) => {
  let f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }); res.end(fs.readFileSync(f));
}); s.listen(port, () => r(s)); });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
if (!b) { console.log("  （playwright が無いので撮影は飛ばします）"); process.exit(0); }
let n = 0, measured = 0;
const checks = [];
/**
 * **走り出しの1枚は捨てる**（D-309）。
 * まっさらな窓で撮っても、**ブラウザ自体が冷えている1枚目だけ**は
 * 字の読み込みが間に合わず、他と違う絵になる。
 * これを数えたために「製造業の画面が変わった」と誤って報告しかけた（実測・2度目）。
 */
{
  const warm = await serve(JOBS[0].root, 4802);
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto("http://127.0.0.1:4802/", { waitUntil: "networkidle" }).catch(() => {});
  await pg.screenshot({ fullPage: true }).catch(() => {});
  await ctx.close(); warm.close();
}
for (const job of JOBS) {
  const srv = await serve(job.root, 4801);
  for (const [w, tag] of [[1440, "pc"], [390, "sp"]]) {
    for (const p of (job.shots ?? SHOT_PAGES)) {
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
  /** ── 原則A・B の実測 ──────────────────────── */
  for (const [w, tag] of [[1440, "PC"], [390, "スマホ"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const pg = await ctx.newPage();
    for (const p of (job.shots ?? CHECK_PAGES)) {
      const r = await pg.goto("http://127.0.0.1:4801" + p, { waitUntil: "networkidle" }).catch(() => null);
      if (!r || r.status() !== 200) continue;
      const out = await pg.evaluate(() => {
        const lum = (c) => { const v = c.match(/[\d.]+/g); if (!v) return 1;
          const [r, g, bl] = v.slice(0, 3).map(Number).map((x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
          return .2126 * r + .7152 * g + .0722 * bl; };
        const ratio = (a, c) => { const l1 = lum(a), l2 = lum(c); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
        /** 透明なら親をたどる。**実際に目に入る地の色** */
        const bgOf = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor;
          if (c && c !== "rgba(0, 0, 0, 0)" && !/,\s*0\)$/.test(c)) return c; n = n.parentElement; } return "rgb(255, 255, 255)"; };

        /** 原則A：帯ごとに、実際の地と文字色で比を出す */
        const low = [];
        for (const el of document.querySelectorAll(".band, .cta, .site-footer")) {
          const t = el.querySelector(".band-body p, .band-body li, .declined p, p") ?? el;
          const c = getComputedStyle(t).color, bg = bgOf(el);
          const v = ratio(c, bg);
          if (v < 4.5) low.push({ where: el.dataset.content ?? el.className, c, bg, v: Math.round(v * 100) / 100 });
        }

        /** 原則B：**線を引く装飾**の矩形が、文字の矩形と重なっていないか */
        const overlap = [];
        const px = (v) => (v && v !== "auto" ? parseFloat(v) : null);
        for (const el of document.querySelectorAll('.band[data-asset-source="graphic"]')) {
          const br = el.getBoundingClientRect();
          for (const pseudo of ["::before", "::after"]) {
            const cs = getComputedStyle(el, pseudo);
            if (cs.content === "none") continue;
            /**
             * **消してある装飾は測らない。**
             * スマホで消した2つ目の円（`display:none`）を数えていたため、
             * **見えていない線が本文に重なっている**と出ていた（実測1件）。
             * `display:none` の擬似要素は位置が解決されない（`top: 50%` のまま返る）ので、
             * 座標そのものが当てにならない。
             */
            if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
            /** **地を塗る装飾は対象外。** あれは背景色であって、線ではない */
            if (parseFloat(cs.borderTopWidth || "0") === 0) continue;
            const w = px(cs.width), h = px(cs.height);
            if (!w || !h) continue;
            const right = px(cs.right), left = px(cs.left), top = px(cs.top), bottom = px(cs.bottom);
            let x = left !== null ? br.left + left : right !== null ? br.right - right - w : br.left;
            let y = top !== null ? br.top + top : bottom !== null ? br.bottom - bottom - h : br.top;
            /** `translate: 0 -50%` を解く */
            const tr = (cs.translate || "").trim().split(/\s+/);
            if (tr.length >= 2) { const v = tr[1];
              y += v.endsWith("%") ? (parseFloat(v) / 100) * h : (parseFloat(v) || 0); }
            const box = { x, y, w, h };
            /**
             * **円は円として測る。**
             *
             * 最初は外接する四角で測っていたので、**弧が通っていない角の文字まで
             * 「重なっている」と出た**（実測6件・目で見ると重なっていない）。
             * 線が乗っているのは半径 r と r-線幅 のあいだの輪だけなので、
             * 文字の矩形がその輪と交わるかを見る。
             */
            /** `border-radius: 50%` は computed でも「50%」のまま返る。px と両方受ける */
            const rr = (cs.borderTopLeftRadius || "0").trim();
            const round = rr.endsWith("%") ? parseFloat(rr) >= 50 : parseFloat(rr) >= w / 2 - 1;
            const bw = parseFloat(cs.borderTopWidth || "0");
            const cx = x + w / 2, cy = y + h / 2, rad = w / 2;
            const hits = (r) => {
              if (!round) return r.left < box.x + box.w && r.right > box.x && r.top < box.y + box.h && r.bottom > box.y;
              const dx = Math.max(r.left - cx, 0, cx - r.right);
              const dy = Math.max(r.top - cy, 0, cy - r.bottom);
              const near = Math.hypot(dx, dy);
              const far = Math.max(
                Math.hypot(r.left - cx, r.top - cy), Math.hypot(r.right - cx, r.top - cy),
                Math.hypot(r.left - cx, r.bottom - cy), Math.hypot(r.right - cx, r.bottom - cy));
              return near <= rad && far >= rad - bw;
            };
            /**
             * **要素の箱ではなく、文字が実際に置かれている矩形で測る。**
             *
             * `<p><a>くわしく見る</a></p>` の `p` は帯の幅いっぱいに広がるので、
             * 箱で測ると**文字が左端にあっても右端の弧と「重なった」ことになる**（実測4件）。
             * Range の矩形は行の実寸なので、文字の無いところを含まない。
             */
            const TEXT = "p, li, h1, h2, h3, td, th, dd, dt, .chips span, .figures dd, .bignumber-value, a";
            let hit = null;
            for (const t of el.querySelectorAll(TEXT)) {
              const s = t.textContent.trim();
              if (!s) continue;
              const range = document.createRange();
              range.selectNodeContents(t);
              for (const r of range.getClientRects()) {
                if (r.width === 0 || r.height === 0) continue;
                if (hits(r)) { hit = s.slice(0, 18); break; }
              }
              if (hit) break;
            }
            if (hit) overlap.push({ band: el.dataset.content, subject: el.dataset.assetSubject, text: hit });
          }
        }
        /**
         * ── 機械が確かめられること（第4段階）──────────
         * **どれも「あってはいけないこと」だけを見る。**
         * 数の多さ・少なさは見ない（装飾の数も写真の枚数も品質ではない・docs/31 原則⑤）。
         */
        const faults = [];

        /** ① 仮の画像が残っていないか */
        for (const img of document.images) {
          if (/\.svg(\?|$)/i.test(img.getAttribute("src") ?? "")) faults.push(`仮の画像が残っています：${img.getAttribute("src")}`);
        }
        /** ② 中身の無い帯が無いか（見出しだけの帯） */
        for (const el of document.querySelectorAll(".band")) {
          const body = el.querySelector(".band-body");
          if (!body) continue;
          const t = (body.textContent ?? "").trim();
          if (!t && body.querySelectorAll("img, table, svg").length === 0) {
            faults.push(`中身の無い帯：${el.dataset.content ?? "?"}（見出し「${(el.querySelector("h2")?.textContent ?? "").trim()}」）`);
          }
        }
        /** ③ 画像の参照が切れていないか */
        for (const img of document.images) {
          if (img.complete && img.naturalWidth === 0) faults.push(`画像が読めません：${img.getAttribute("src")}`);
        }
        /**
         * ④ **「お客様の写真あり」と言っている帯に、本当に画像があるか。**
         * 逆も見る——画像を出しているのに名乗っていない帯が無いか。
         * ここがずれると、**写真の依頼が的外れになる。**
         */
        for (const el of document.querySelectorAll(".band")) {
          const n = el.querySelectorAll("img").length;
          const src = el.dataset.assetSource;
          if (src === "customer" && n === 0) faults.push(`お客様の写真ありと出ているのに画像が無い：${el.dataset.content}`);
          if (src !== "customer" && n > 0) faults.push(`画像を出しているのに名乗っていない：${el.dataset.content}（${src}）`);
        }
        /** ⑤ 横にはみ出していないか */
        if (document.documentElement.scrollWidth > window.innerWidth + 1) {
          faults.push(`横にはみ出しています（${document.documentElement.scrollWidth} > ${window.innerWidth}）`);
        }

        return { low, overlap, faults };
      });
      for (const x of out.low) checks.push(`  ✗ ${job.label} ${tag} ${p} 文字が読めません（${x.where}）比 ${x.v}　文字 ${x.c} ／ 地 ${x.bg}`);
      for (const x of out.overlap) checks.push(`  ✗ ${job.label} ${tag} ${p} 線の装飾が文字に重なっています（${x.band}:${x.subject}）「${x.text}」`);
      for (const f of out.faults) checks.push(`  ✗ ${job.label} ${tag} ${p} ${f}`);
      measured++;
    }
    await ctx.close();
  }
  srv.close();
}
await b.close();
console.log(`  ${n}枚 撮りました`);
console.log(`\n  ── 実際の描画結果を測る（原則A・B）── ${measured}画面`);
if (checks.length) { checks.forEach((c) => console.log(c)); process.exitCode = 1; }
else console.log("  ○ 読めない帯なし／線の装飾が文字に重なっている画面なし");
