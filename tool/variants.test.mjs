/**
 * KOBO — 型を変えて書き出し、見比べる道具の検査（D-472）
 *
 *   ① `build-site --theme/--out` が、選べない型と、危ない書き出し先を断ること
 *   ② `variants` が、ご希望の型を先頭に書き出し、**案件データを書き換えない**こと
 *   ③ 見比べ画面が、型ごとのサイトを**その型の下の住所で**出すこと（`/` 始まりの直リンクが残らない）
 *   ④ 「この見た目に決める」が、見比べに出した型・決まった文字の大きさだけを記録すること
 *   ⑤ 画面：文字の大きさの切り替えが全部の枠に効き、ページを移っても保たれること
 *   ⑥ 画面：**最初の画面の右の列で、大きく組んだ値が段落ちしないこと**（側面に目次を置く型を含む）
 *
 * ⑥は実装中に落ちた——「精密加工」（目次が側面）だけ右の列が 424px（PC 1280px）になり、
 * 「アルミ・ステンレス」が2行に折れていた。**型を並べたときに初めて見える崩れ**なので、ここで測る。
 *
 * ⑤⑥はブラウザで測る。playwright が無い環境では**「未確認」と出して、合格に数えない**（CLAUDE.md）。
 * 案件は検査用に作り（`projects/_variants-test`）、最後に消す。お客様の案件には触れない。
 */
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { sanitizeProject } from "./lib/sanitize.ts";

let ok = 0, ng = 0, unverified = 0;
const check = (name, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); }
};

const ID = "_variants-test";
const dir = `projects/${ID}`;
const file = `${dir}/project.json`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const fixture = sanitizeProject(JSON.parse(fs.readFileSync("fixtures/design-diversity/a-precision.json", "utf8")));
/** 側面に目次を置く型（精密加工）を**ご希望**にしておく——⑥の崩れはこの型で出た */
fixture.theme = { ...fixture.theme, direction: "technical", textSize: "normal" };
/**
 * **実案件で折れた値そのもの**を右の列に置く。
 * ★元の検査用の値（アルミ・ステンレス・鋳鉄・チタン）は長すぎて導入の段に落ち、
 * 列の幅の上限を外しても⑥が緑のままだった（**崩れを戻して測り、効いていないと分かった**）
 */
fixture.capability = { ...fixture.capability, materials: ["アルミ", "ステンレス"] };
fs.writeFileSync(file, JSON.stringify(fixture, null, 2));
const original = fs.readFileSync(file, "utf8");

let server = null, browser = null;
const cleanup = () => {
  try { server?.kill(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
};
process.on("exit", cleanup);

console.log("\n━━━ ① 書き出しの差し替え（build-site --theme / --out）━━━");
{
  const r = spawnSync("node", ["build-site.mjs", ID, "--theme", "shop", "--out", `${dir}/variants/x`], { encoding: "utf8" });
  check("製造業の案件で、汎用の型は断る", r.status === 1 && /選べません/.test(r.stderr), (r.stderr || r.stdout).trim().slice(-200));
  for (const [out, why] of [
    ["../outside", "案件の外"],
    [`${dir}/site`, "公開用の書き出し先"],
    [`${dir}/site-draft`, "下書きの書き出し先"],
    [`${dir}/photos`, "お預かりした写真"],
  ]) {
    const x = spawnSync("node", ["build-site.mjs", ID, "--theme", "standard", "--out", out], { encoding: "utf8" });
    check(`書き出し先が${why}なら断る（${out}）`, x.status === 1, (x.stderr || x.stdout).trim().slice(-200));
  }
  check("断ったあとも、案件データは変わらない", fs.readFileSync(file, "utf8") === original);
}

console.log("\n━━━ ② 型を変えて書き出す（variants）━━━");
const variantsDir = `${dir}/variants`;
let meta = null;
{
  const r = spawnSync("node", ["variants.mjs", ID, "--only", "standard,technical"], { encoding: "utf8" });
  check("2通り書き出せる", r.status === 0, (r.stdout + r.stderr).trim().split("\n").slice(-6).join(" / "));
  try { meta = JSON.parse(fs.readFileSync(`${variantsDir}/variants.json`, "utf8")); } catch {}
  check("見比べの材料（variants.json）がある", !!meta);
  check("ご希望の型が先頭に来る", meta?.items?.[0]?.id === "technical" && meta.items[0].preferred === true,
    JSON.stringify(meta?.items?.map((i) => i.id)));
  check("型ごとにサイトが書き出されている",
    (meta?.items ?? []).every((i) => fs.existsSync(`${variantsDir}/${i.id}/index.html`)));
  check("文字の大きさの選択肢が、値つきで渡る",
    (meta?.textSizes ?? []).length >= 3 && meta.textSizes.every((t) => /px$/.test(t.size ?? "") && t.measure));
  check("**案件データを書き換えない**", fs.readFileSync(file, "utf8") === original);
  const bad = spawnSync("node", ["variants.mjs", ID, "--only", "standard,nothing"], { encoding: "utf8" });
  check("選べない型を指定したら、書き出さずに止まる", bad.status === 1 && /選べない型/.test(bad.stderr));
  check("止まったとき、前の書き出しは消していない", fs.existsSync(`${variantsDir}/variants.json`));
  const html = meta ? [fs.readFileSync(`${variantsDir}/technical/index.html`, "utf8"), fs.readFileSync(`${variantsDir}/standard/index.html`, "utf8")] : ["", ""];
  const navOf = (h) => /data-nav="?([a-z]+)/.exec(h)?.[1];
  check("型が違えば、書き出したサイトも違う（目次の置き方）", navOf(html[0]) && navOf(html[0]) !== navOf(html[1]),
    `${navOf(html[0])} / ${navOf(html[1])}`);
}

console.log("\n━━━ ③④ 見比べ画面 ━━━");
const PORT = 5700 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${PORT}`;
if (meta) {
  server = spawn("node", ["preview-variants.mjs", ID], { env: { ...process.env, PREVIEW_PORT: String(PORT), KOBO_NO_OPEN: "1" }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  const top = await (await fetch(base + "/")).text();
  check("型の数だけ枠が並ぶ", (top.match(/<iframe/g) ?? []).length === meta.items.length);
  /** 画面に出る文字だけを見る（`<script>` の中の `/**` は画面に出ない） */
  const visible = top.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, "");
  check("説明文に「**」がそのまま出ていない", visible.length > 100 && !visible.includes("**"));
  const page = await (await fetch(base + "/v/standard/")).text();
  /** `/` 始まりのまま残ると、見比べ画面の外（別の型や404）に飛ぶ */
  const rooted = [...page.matchAll(/(?:href|src|action|poster)="(\/[^"]*)"/g)].map((m) => m[1]);
  const stray = rooted.filter((u) => !u.startsWith("/v/standard/"));
  /** 1本も拾えていなければ、測っていないのと同じ */
  check(`型のページの中のリンクが、すべてその型の下を指す（${rooted.length}本）`, rooted.length > 5 && stray.length === 0, stray.slice(0, 5).join(" "));
  check("存在しない型は出さない", (await fetch(base + "/v/nothing/")).status === 404);
  check("型の外のファイルは読めない", (await fetch(base + "/v/standard/..%2f..%2fproject.json")).status !== 200);

  const post = (body) => fetch(base + "/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r1 = await post({ direction: "engineering", textSize: "large" });
  check("見比べに出していない型は、記録しない", r1.status === 400 && fs.readFileSync(file, "utf8") === original);
  const r2 = await post({ direction: "standard", textSize: "huge" });
  check("文字の大きさが選択肢に無ければ、記録しない", r2.status === 400 && fs.readFileSync(file, "utf8") === original);
  const r3 = await post({ direction: "standard", textSize: "large" });
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  check("決めた型と文字の大きさを記録する", r3.ok && after.theme?.direction === "standard" && after.theme?.textSize === "large",
    JSON.stringify(after.theme));
  check("型の9つの軸も、その型の見本にそろう（前の型の軸が残らない）", after.theme?.nav !== "sidebar", after.theme?.nav);
  check("決めた日時を残す（ご希望と区別する）", /^\d{4}-\d{2}-\d{2}T/.test(after.themeDecidedAt ?? ""));
  const { theme: _a, themeDecidedAt: _b, ...restAfter } = after;
  const { theme: _c, ...restBefore } = JSON.parse(original);
  check("見た目以外の案件データは変えない", JSON.stringify(restAfter) === JSON.stringify(restBefore));
  const report = spawnSync("node", ["build-site.mjs", ID, "--draft"], { encoding: "utf8" });
  check("書き出しの報告が「決定」と言う", /原稿のご確認で決定/.test(report.stdout), /見た目.*/.exec(report.stdout)?.[0]);
  fs.writeFileSync(file, original);
}

console.log("\n━━━ ⑤⑥ 画面（ブラウザで測る）━━━");
try {
  const { launchChromium } = await import("./lib/browser.mjs");
  browser = await launchChromium();
} catch {}
if (!browser) {
  unverified++;
  console.log("  △ 未確認：playwright が無いので、画面は測っていません（npm i -D playwright）");
} else if (meta) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push("読めない：" + r.url()));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const large = meta.textSizes.find((t) => t.id === "large");
  await page.click(`.size[data-id="large"]`);
  const sizes = await page.evaluate(() => [...document.querySelectorAll("iframe")].map((f) =>
    getComputedStyle(f.contentDocument.documentElement).getPropertyValue("--font-size").trim()));
  check(`文字の大きさを切り替えると、全部の枠に効く（${large.size}）`, sizes.length === meta.items.length && sizes.every((s) => s === large.size), sizes.join(" / "));
  /** 枠の中でページを移っても、選んだ大きさのまま（お客様がめくって見る） */
  const frame = page.frames().find((f) => f.url().includes("/v/technical/"));
  const link = await frame.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /^\/v\/technical\/.+/.test(h)));
  if (link) {
    await frame.goto(base + link, { waitUntil: "load" });
    const s = await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-size").trim());
    check("枠の中でページを移っても、選んだ大きさのまま", s === large.size && frame.url().includes("/v/technical/"), `${s} ${frame.url()}`);
  } else {
    unverified++;
    console.log("  △ 未確認：型のページに内部リンクが無いので、ページ移りは測っていません");
  }
  check("見比べ画面のエラー・読めないファイルが無い", errors.length === 0, errors.slice(0, 3).join(" / "));
  await ctx.close();

  /** ⑥ 最初の画面の右の列。**大きく組んだ値（導入の段より上）は1行**に収まること */
  let measured = 0;
  const wraps = [];
  for (const v of meta.items) for (const W of [1024, 1280, 1440, 1920, 390]) {
    const c = await browser.newContext({ viewport: { width: W, height: 900 }, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto(`${base}/v/${v.id}/`, { waitUntil: "load" });
    const rows = await p.evaluate(() => [...document.querySelectorAll(".hero-figures dd")]
      .filter((d) => !["lead", "body"].includes(d.dataset.role))
      .map((d) => {
        const lh = parseFloat(getComputedStyle(d).lineHeight);
        return { text: d.textContent, lines: Math.round(d.getBoundingClientRect().height / lh), fs: getComputedStyle(d).fontSize };
      }));
    measured += rows.length;
    for (const r of rows) if (r.lines > 1) wraps.push(`${v.label} ${W}px「${r.text}」${r.fs} ${r.lines}行`);
    await c.close();
  }
  if (!measured) {
    unverified++;
    console.log("  △ 未確認：検査用の案件の最初の画面に、大きく組んだ値が無い");
  } else {
    check(`最初の画面の右の列で、大きく組んだ値が段落ちしない（${measured}か所）`, wraps.length === 0, wraps.slice(0, 4).join(" / "));
  }
}
await browser?.close();

console.log(`\n  合格 ${ok}　不合格 ${ng}${unverified ? `　未確認 ${unverified}` : ""}\n`);
cleanup();
process.exit(ng ? 1 : 0);
