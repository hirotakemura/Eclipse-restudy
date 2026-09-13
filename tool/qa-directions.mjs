/**
 * KOBO — 型ごとの違いを測る（写真ゼロで）
 *
 *   npm run qa:directions
 *
 * **「コード上は違うが、画面では似て見える」を防ぐための物差し。**
 *
 * 同じ会社のデータから、型だけを変えて6通り書き出し、
 * **どれだけ違う構造になっているか**を数字で出す。
 * 写真は全部外す。**写真が無くても型ごとに違って見えること**が目標だから（ご指示②）。
 *
 * ここで測るのは構造（何を・どの順で・どの幅で・どの強さで）。
 * 実際の見え方は人の目で確かめる（Visual QA・ご指示⑥-3）。
 * **数字が通っても画面を見る**、はD-192で学んだとおり。
 *
 * 依存を増やさない。ブラウザも使わない。書き出したHTMLを読むだけ。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DIRECTIONS } from "./lib/design/direction.ts";
import { PRESETS } from "./lib/theme.ts";

const SRC = path.join("fixtures", "mock-manufacturing", "project.json");
const OUT = path.join("projects", "qa");

/** 書き出したHTMLから、構造の指紋を取る */
function signature(html) {
  const nav = /data-nav="([a-z]+)"/.exec(html);
  const motion = /data-motion="([a-z]+)"/.exec(html);
  const palette = /--accent:(#[0-9a-f]{6})/.exec(html);
  const bands = [...html.matchAll(/<section class="section band"([^>]*)>([\s\S]*?)(?=<section class="section band"|<section class="cta"|<footer)/g)]
    .map((m) => {
      const at = (k) => (new RegExp(`data-${k}="([a-zA-Z]+)"`).exec(m[1]) ?? [, "-"])[1];
      const head = /<h2[^>]*>([^<]*)</.exec(m[2]);
      return `${at("content")}:${at("presentation")}|${at("width")}/${at("emphasis")}/${at("surface")}/${at("layout")}`;
    });
  const hero = /<dl class="spec-first"/.test(html) ? "spec"
    : /class="hero-photo"/.test(html) ? "photo" : "headline";
  return { hero, bands, nav: nav ? nav[1] : "?", accent: palette ? palette[1] : "?", motion: motion ? motion[1] : "?" };
}

// 前回の検証用案件を消してから作り直す。**古い型のフォルダを残さない**
for (const f of fs.existsSync("projects") ? fs.readdirSync("projects") : []) {
  if (f.startsWith("qa-")) fs.rmSync(path.join("projects", f), { recursive: true, force: true });
}

const project = JSON.parse(fs.readFileSync(SRC, "utf8"));
console.log(`\n  ${project.basics?.name}　（写真をすべて外して、型だけを変えます）\n`);

const results = [];
// 製造業の6つを比べる（汎用は別集合・D-198）
for (const d of DIRECTIONS.filter((x) => x.plan === "manufacturing")) {
  const id = `qa-${d.id}`;
  const dir = path.join("projects", id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // **写真ゼロ。** 写真があると差が出る、では意味がない（ご指示②）
  const p = JSON.parse(JSON.stringify(project));
  p.id = id;
  p.photos = [];
  // KOBOの案件一覧に6件並ぶので、**検証用だと一目で分かる名前**にする
  p.basics = { ...p.basics, name: `【検証】${d.label}` };
  /**
   * **お客様が型を押すと、9軸もまとめて決まる**（KOBOの実装）。
   * 型だけを差し替えて測ると、実際より差が小さく出る。現実と同じ条件にする。
   */
  const preset = PRESETS.find((x) => x.id === d.id);
  p.theme = preset ? { ...preset.theme } : { ...p.theme, direction: d.id };
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));

  const r = spawnSync("node", ["build-site.mjs", id], { encoding: "utf8" });
  const built = path.join(dir, "site", "index.html");
  const draft = path.join(dir, "site-draft", "index.html");
  const file = fs.existsSync(built) ? built : draft;
  if (!fs.existsSync(file)) {
    console.log(`  ✗ ${d.label} は書き出せませんでした`);
    console.log((r.stdout ?? "").split("\n").slice(-8).join("\n"));
    continue;
  }
  results.push({ d, sig: signature(fs.readFileSync(file, "utf8")), dir });
}

console.log("━━━ 型ごとの構成（写真ゼロ）━━━\n");
for (const { d, sig } of results) {
  console.log(`  ${d.label}（${d.id}）　最初の画面: ${sig.hero}／メニュー: ${sig.nav}／色: ${sig.accent}／動き: ${sig.motion}`);
  for (const b of sig.bands) console.log(`      ${b}`);
  console.log("");
}

// ── どれだけ似ているか ─────────────────────────────
const key = (s) => `${s.hero}|${s.bands.join(",")}`;
console.log("━━━ 似ている度合い（1.00 = まったく同じ構成）━━━\n");
let worst = { pair: "", score: 0 };
const pairs = [];
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const a = results[i], b = results[j];
    const A = new Set(a.sig.bands), B = new Set(b.sig.bands);
    const shared = [...A].filter((x) => B.has(x)).length;
    const score = shared / Math.max(A.size, B.size, 1);
    const same = key(a.sig) === key(b.sig);
    pairs.push({ label: `${a.d.label} × ${b.d.label}`, score, same });
    if (score > worst.score) worst = { pair: `${a.d.label} × ${b.d.label}`, score };
  }
}
pairs.sort((x, y) => y.score - x.score);
for (const p of pairs) {
  console.log(`  ${p.score.toFixed(2)}  ${p.label}${p.same ? "　★まったく同じ" : ""}`);
}

/*
  **もう1つ、別の物差しを置く。**
  上の「似ている度合い」は順番・面・組み方まで見るので、
  **見た目が違えば下がる。** ところが出ている情報の種類が同じなら、
  それは「同じテンプレートに別のテーマを当てただけ」である（アドバイザー指摘）。
  種類だけを見る物差しを別に持ち、**両方を下げる**ことを目標にする。
*/
console.log("\n━━━ 出ている情報の種類だけを見る（順番・面・組み方を無視）━━━\n");
/**
 * **「何を、どう見せたか」の組で数える。**
 * 見出し（＝内容）だけで数えると、製造業で共通するのが当然の情報
 * （対応範囲・材質・条件・設備・事例）まで「重なり」として数えてしまい、
 * **情報を削れという圧になる**（D-204）。数えるのは内容×表現の組。
 */
const kindsOf = (r) => new Set(r.sig.bands.map((b) => b.split("|")[0]));
let kTot = 0, kSame = 0, kN = 0;
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const A = kindsOf(results[i]), B = kindsOf(results[j]);
    const inter = [...A].filter((x) => B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    const sc = uni ? inter / uni : 1;
    kTot += sc; kN++; if (sc === 1) kSame++;
  }
}
for (const { d, sig } of results) {
  console.log(`  ${d.label.padEnd(7)} ${[...kindsOf({ sig })].join(" ")}`);
}
console.log(`\n  種類の重なり： 平均 ${(kTot / kN).toFixed(2)}`);
console.log(`  **出ている情報がまったく同じ組み合わせ： ${kSame}/${kN}通り**`);

const identical = pairs.filter((p) => p.same).length;
const avg = pairs.reduce((s, p) => s + p.score, 0) / pairs.length;
console.log("\n━━━ まとめ ━━━");
console.log(`  組み合わせ ${pairs.length}通り　平均の似ている度合い ${avg.toFixed(2)}`);
console.log(`  **まったく同じ構成になった組み合わせ： ${identical}通り**`);
console.log(`  いちばん似ている： ${worst.pair}（${worst.score.toFixed(2)}）`);
console.log(`\n  目で見て確かめる（ご指示⑥-3）：`);
for (const { d } of results) console.log(`    npm run preview:site -- qa-${d.id}`);
console.log("");
