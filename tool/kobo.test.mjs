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

console.log("\n━━━ ⑤ 見た目は、クロージングの中で2つだけ伺う（D-470）━━━");
{
  const { FORM_SETS } = await import("./lib/form-definition.ts");
  for (const [plan, set] of Object.entries(FORM_SETS)) {
    const blocks = set.blocks;
    check(`${plan}：「サイトの見た目」のタブが無い`, !blocks.some((b) => b.id === "design" || b.title === "サイトの見た目"));
    const terms = blocks.find((b) => b.id === "terms");
    const paths = (terms?.fields ?? []).map((f) => f.path);
    check(`${plan}：見た目のご希望と色のご希望が、制作条件・クロージングの中にある`,
      paths.includes("theme") && paths.includes("terms.colorRequest"), paths.join("・"));
    /** **外した欄**：どのコードも読まず、足りない写真は書き出しが置き場所ごとに名指しする */
    check(`${plan}：「使える写真があるか」を聞かない`, !paths.includes("terms.photo.hasExisting"));
    const theme = terms?.fields.find((f) => f.path === "theme");
    check(`${plan}：見た目は「ご希望」として伺う（決定ではないと説明にある）`, /ご希望として記録/.test(theme?.help ?? ""));
  }
}
if (browser === null) {
  unverified++;
  console.log("  △ 未確認：playwright が無いので、クロージングの画面は測っていません");
} else if (list.some((p) => p.formSet === "manufacturing")) {
  const b2 = await (await import("./lib/browser.mjs")).launchChromium();
  const ctx = await b2.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  /** **案件データを書き換えない。** 保存の通信は差し止めて、成功したことにする */
  await page.route("**/api/projects/*", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completion: null, savedAt: new Date().toISOString() }) })
    : route.continue());
  const target = list.find((p) => p.formSet === "manufacturing").id;
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.click(`#home-table tbody tr[data-id="${target}"]`);
  await page.waitForSelector("#main:not([hidden])");
  const titles = await page.evaluate(() => [...document.querySelectorAll("#blocks *")].filter((x) => x.onclick).map((x) => x.textContent));
  check("画面のタブにも「サイトの見た目」が無い", !titles.some((t) => /サイトの見た目/.test(t)), titles.length + "タブ");
  /** **説明文の `**` をそのまま出さない**（★取材中の画面に「**」が出ていた。43か所） */
  let stars = 0;
  for (let i = 0; i < titles.length; i++) {
    await page.evaluate((i) => [...document.querySelectorAll("#blocks *")].filter((x) => x.onclick)[i].click(), i);
    await page.waitForTimeout(80);
    stars += await page.evaluate(() => (document.querySelector("#form").innerText.match(/\*\*/g) ?? []).length);
  }
  check("どのブロックの説明文にも「**」がそのまま出ていない", stars === 0, `${stars}か所`);
  await page.evaluate(() => [...document.querySelectorAll("#blocks *")].find((x) => x.onclick && /制作条件/.test(x.textContent))?.click());
  await page.waitForSelector(".theme-picker");
  const rows = await page.evaluate(() => [...document.querySelectorAll(".theme-picker .theme-row")].map((r) => r.dataset.key));
  check("取材で選ぶのは、型と文字の大きさの2つだけ", JSON.stringify(rows) === JSON.stringify(["preset", "textSize"]), rows.join("・"));
  /** **型を押しても、文字の大きさは消さない**（型の見本も文字の大きさを持っているので、上書きされていた） */
  const sizes = await page.$$('.theme-row[data-key="textSize"] .theme-choice');
  await sizes[sizes.length - 1].click();
  const bigger = await sizes[sizes.length - 1].getAttribute("data-value");
  const presets = await page.$$('.theme-row[data-key="preset"] .theme-choice');
  await presets[0].click();
  await presets[presets.length - 1].click();
  const kept = await page.evaluate(() => document.querySelector('.theme-row[data-key="textSize"] .theme-choice[aria-pressed="true"]')?.dataset.value);
  check("型を押しても、選んだ文字の大きさが残る", kept === bigger, `${bigger} → ${kept}`);
  /** **お客様の確認画面にも、2つだけ**（配色や書体を並べると「それで決まった」と受け取られる） */
  await page.click("#close-project");
  await page.click("#review-open");
  await page.waitForSelector("#review:not([hidden])");
  const review = await page.evaluate(() => document.querySelector("#review-body").innerText);
  check("お客様の確認画面には、近い見た目と文字の大きさだけを出す",
    /近い見た目/.test(review) && /文字の大きさ/.test(review) && !/配色：|書体：|雰囲気：/.test(review));
  check("クロージングの画面のエラーが無い", errors.length === 0, errors.join(" / "));
  await b2.close();
}

stop();
console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過${unverified ? `　（未確認 ${unverified}件）` : ""}\n`);
process.exit(ng ? 1 : 0);
