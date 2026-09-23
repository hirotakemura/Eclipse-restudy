/**
 * KOBO — 案件一覧の検査（D-469）
 *
 *   ① 一覧の API が、画面に要る値（ID・会社名・取材日・確認日・充足率・更新日）を返すこと
 *   ② 画面が、案件IDを1件ずつ見えるように出すこと（ドロップダウンの中ではなく）
 *   ③ 行を押すと開き、「← 案件一覧」で戻れること
 *   ④ **枠の中で表がはみ出していないこと**（PC・タブレット縦・スマホ）
 *
 * ④は実装中に一度外した——ページの横スクロールだけを測っていて「はみ出し無し」と出たが、
 * 表は `overflow: hidden` の枠の中で**右の2列が切れていた**（タブレット縦・768px）。
 * **枠の中のはみ出し**を測る。
 *
 * ②〜④はブラウザで測る。playwright が無い環境では**「未確認」と出して、合格に数えない**（CLAUDE.md）。
 * 案件データは**読むだけ**（GET しか送らない）。
 */
import { spawn } from "node:child_process";

let ok = 0, ng = 0, unverified = 0;
const check = (name, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); }
};

const PORT = 5300 + Math.floor(Math.random() * 400);
const server = spawn("node", ["server.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const base = `http://127.0.0.1:${PORT}`;
const stop = () => { try { server.kill(); } catch {} };
process.on("exit", stop);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(base + "/")).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

console.log("\n━━━ ① 一覧の API ━━━");
const list = await (await fetch(base + "/api/projects")).json();
check(`案件の一覧が返る（${list.length}件）`, Array.isArray(list));
const keys = ["id", "name", "formSet", "filledPct", "hearingDate", "reviewedAt", "updatedAt"];
const lacking = keys.filter((k) => list.length && !(k in list[0]));
check("画面に要る値がそろっている", lacking.length === 0, lacking.join("・"));
check("新しく触った順に並んでいる",
  list.every((p, i) => i === 0 || list[i - 1].updatedAt >= p.updatedAt));

console.log("\n━━━ ②〜④ 画面（ブラウザで測る）━━━");
let browser = null;
try {
  const { launchChromium } = await import("./lib/browser.mjs");
  browser = await launchChromium();
} catch {
  unverified++;
  console.log("  △ 未確認：playwright が無いので、画面は測っていません（npm i -D playwright）");
}

if (browser && !list.length) {
  unverified++;
  console.log("  △ 未確認：案件が1件も無いので、一覧の画面は測っていません");
}
if (browser && list.length) {
  for (const [W, H, name] of [[1280, 900, "PC"], [768, 1024, "タブレット縦"], [390, 844, "スマホ"]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.waitForSelector("#home-table tbody tr");
    const m = await page.evaluate(() => ({
      ids: [...document.querySelectorAll("#home-table tbody tr code")].map((c) => c.textContent),
      clipped: document.querySelector("#home-table").scrollWidth - document.querySelector(".home-table-wrap").clientWidth,
      pageScroll: document.documentElement.scrollWidth - innerWidth,
      nameW: Math.round(document.querySelector("#home-table td.home-name").getBoundingClientRect().width),
    }));
    check(`${name}：案件IDが1件ずつ見えている（${m.ids.length}件）`,
      m.ids.length === list.length && m.ids.every((id, i) => id === list[i].id));
    check(`${name}：表が枠からはみ出していない`, m.clipped <= 0 && m.pageScroll <= 0,
      `枠の中 ${m.clipped}px ／ ページ ${m.pageScroll}px`);
    /** 会社名が数文字幅に潰れていないこと（★768px の表で 67px まで潰れていた） */
    check(`${name}：会社名が読める幅で出ている`, m.nameW >= 140, `${m.nameW}px`);

    const target = list[0].id;
    await page.fill("#home-filter", target);
    const filtered = await page.evaluate(() => [...document.querySelectorAll("#home-table tbody tr code")].map((c) => c.textContent));
    check(`${name}：案件IDで絞り込める`, filtered.includes(target) && filtered.length <= list.length);
    await page.fill("#home-filter", "");

    await page.click(`#home-table tbody tr[data-id="${target}"]`);
    await page.waitForSelector("#main:not([hidden])");
    const opened = await page.evaluate(() => ({
      toList: !document.querySelector("#to-list").hidden, sel: document.querySelector("#project-select").value,
    }));
    check(`${name}：行を押すと、その案件が開く`, opened.toList && opened.sel === target, JSON.stringify(opened));
    await page.click("#to-list");
    await page.waitForSelector("#empty:not([hidden])");
    check(`${name}：「← 案件一覧」で一覧に戻れる`, await page.evaluate(() => document.querySelector("#main").hidden));
    check(`${name}：画面のエラーが無い`, errors.length === 0, errors.join(" / "));
    await ctx.close();
  }
  await browser.close();
}

stop();
console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過${unverified ? `　（未確認 ${unverified}件）` : ""}\n`);
process.exit(ng ? 1 : 0);
