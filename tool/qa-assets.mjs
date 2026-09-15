/**
 * KOBO — 素材（Asset）の見え方を並べる
 *
 *   npm run qa:assets                書き出して撮る
 *   npm run qa:assets -- --out <dir> 保存先を変える（実装前後の比較用）
 *
 * **確かめたいのは「装飾が増えたか」ではない**（docs/31 原則⑤）。
 *
 *   ・写真が無くても未完成に見えないか
 *   ・もとからある情報が読みやすいままか
 *   ・型ごとの差が、はっきり出ているか
 *   ・**どのページも同じ雰囲気になっていないか**
 *
 * 会社データは1社に固定し、**型（方向性）だけを入れ替える。**
 * そうしないと、差が会社の違いなのか型の違いなのか分からない。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DIRECTIONS } from "./lib/design/direction.ts";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", path.join("..", "docs", "assets", "captures", "asset-stage2"));

/** 製造業3方向・汎用3方向。**同じ会社データで、型だけを変える** */
const SETS = [
  ["製造業", "fixtures/design-diversity/b-difficulty.json", ["standard", "technical", "craft"]],
  ["汎用", "fixtures/visual-general/g-b-brand.json", ["modern", "dynamic", "classic"]],
];
const PAGES = ["/", "/strengths/", "/capability/", "/company/", "/contact/"];

const built = [];
for (const [plan, src, dirs] of SETS) {
  for (const id of dirs) {
    const d = DIRECTIONS.find((x) => x.id === id);
    if (!d) { console.error(`  型が見つかりません：${id}`); continue; }
    const pid = `qas-${id}`;
    const dir = path.join("projects", pid);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const p = JSON.parse(fs.readFileSync(src, "utf8"));
    p.id = pid;
    /** **写真0枚で見る。** 実案件は写真0枚から始まる（ご指示§10） */
    p.photos = [];
    /** 型を押したときと同じ状態にする。9軸も型のものに揃える */
    p.theme = { ...d.axes, direction: id };
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));
    const r = spawnSync("node", ["build-site.mjs", pid], { encoding: "utf8" });
    if (r.status !== 0 && !fs.existsSync(path.join(dir, "site-draft"))) {
      console.error(`  ${pid} の書き出しに失敗しました`); continue;
    }
    built.push({ plan, id, label: d.label, pid, root: fs.existsSync(path.join(dir, "site")) ? path.join(dir, "site") : path.join(dir, "site-draft") });
  }
}

/** 帯ごとに、素材の判断がどう出たか */
console.log("\n━━━ 型ごとに、どの帯へ素材が付いたか（写真0枚・トップページ）━━━\n");
for (const b of built) {
  const html = fs.readFileSync(path.join(b.root, "index.html"), "utf8");
  const rows = [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
    const at = (k) => (new RegExp(`data-${k}="([^"]*)"`).exec(m[1]) ?? [, "-"])[1];
    return { content: at("content"), surface: at("surface"), src: at("asset-source"), subj: at("asset-subject") };
  });
  const drawn = rows.filter((r) => r.src === "graphic");
  console.log(`  ${b.plan} ${b.label.padEnd(8)}（${b.id}）　帯 ${rows.length}本　装飾 ${drawn.length}本`);
  console.log(`      ${rows.map((r) => `${r.content}:${r.src === "graphic" ? r.subj : "—"}`).join("  ")}`);
}

/**
 * ── 写真0枚 / 少数 / 十分 の3通り（ご指示§15・第3段階）────────
 *
 * **確かめたいのは「写真が増えたか」ではない。**
 *
 *   A 写真0枚 … Graphic と Typography で完成している。写真を待っている穴が無い
 *   B 少数　　 … 届いた写真が、山または証拠として効く。**骨格は A のまま**
 *   C 十分　　 … 証拠の要る場所が埋まる。**骨格は A のまま、写真の層だけが厚くなる**
 *
 * **枚数と素材数は品質の指標にしない**（docs/31 原則⑤）。
 * 数えるのは「骨格が動いていないか」と「依頼が正しく減るか」である。
 */
console.log("\n━━━ 写真 0枚 / 少数 / 十分（A/B/C）━━━\n");
{
  const SRC = path.join("fixtures", "visual-photos");
  const FULL = [
    { file: "gaikan.png", category: "外観", caption: "外観" },
    { file: "kojo-1.png", category: "工場・設備", caption: "現場1" },
    { file: "kojo-2.png", category: "工場・設備", caption: "現場2" },
    { file: "daihyo.png", category: "代表者", caption: "代表" },
    { file: "hataraku-1.png", category: "働く人", caption: "働く人" },
    { file: "jirei-1.png", category: "加工事例", caption: "事例1", caseNo: 1 },
    { file: "jirei-2.png", category: "加工事例", caption: "事例2", caseNo: 2 },
  ];
  /** **少数は「外観1枚と、事例1件だけ」。** 実案件でいちばんよくある届き方 */
  const FEW = [FULL[0], FULL[5]];
  const CASES = [["A 写真0枚", []], ["B 少数（2枚）", FEW], ["C 十分（7枚）", FULL]];
  const base = JSON.parse(fs.readFileSync("fixtures/design-diversity/b-difficulty.json", "utf8"));
  const seen = [];
  for (const [label, photos] of CASES) {
    const pid = `qas-abc-${CASES.findIndex((c) => c[0] === label)}`;
    const dir = path.join("projects", pid);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "photos"), { recursive: true });
    const p = { ...base, id: pid, photos };
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(p, null, 2));
    for (const ph of photos) fs.copyFileSync(path.join(SRC, ph.file), path.join(dir, "photos", ph.file));
    spawnSync("node", ["build-site.mjs", pid], { encoding: "utf8" });
    const root = fs.existsSync(path.join(dir, "site")) ? path.join(dir, "site") : path.join(dir, "site-draft");
    /**
     * 骨格＝**写真の帯を除いた、内容と見せ方の並び。**
     *
     * `qa:visual` が使っている定義に合わせる（**同じものを2通りに定義しない**・D-197）。
     * 面・余白・組み方は、帯が1本増えればリズムの計算が変わるので動く。
     * それは骨格が壊れたのではなく、**リズムが取り直された**ということ。
     */
    const read = (pg) => {
      const f = path.join(root, pg, "index.html");
      if (!fs.existsSync(f)) return null;
      const html = fs.readFileSync(f, "utf8");
      return [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
        const at = (k) => (new RegExp(`data-${k}="([^"]*)"`).exec(m[1]) ?? [, ""])[1];
        return { content: at("content"), presentation: at("presentation"), surface: at("surface"),
          density: at("density"), layout: at("layout"), peak: at("peak"),
          src: at("asset-source"), wanted: at("asset-wanted"), prio: at("asset-priority") };
      });
    };
    const top = read("") ?? [];
    const skeleton = top.filter((b) => b.content !== "photos")
      .map((b) => `${b.content}:${b.presentation}`).join(" ");
    /** 面・余白・組み方は注記にとどめる */
    const rhythm = top.filter((b) => b.content !== "photos")
      .map((b) => `${b.surface}/${b.density}/${b.layout}`).join(" ");
    let wanted = 0, customer = 0, pages = 0;
    for (const pg of ["", "strengths", "capability", "equipment", "cases", "cases/1", "cases/2", "company", "contact"]) {
      const r = read(pg); if (!r) continue; pages++;
      wanted += r.filter((b) => b.wanted).length;
      customer += r.filter((b) => b.src === "customer").length;
    }
    const peak = top.find((b) => b.peak);
    seen.push({ label, skeleton, rhythm, wanted, customer, pages, peak: peak ? `${peak.content}:${peak.peak}` : "なし", pid });
  }
  for (const x of seen) {
    console.log(`  ${x.label.padEnd(14)} ${x.pages}ページ　写真の帯 ${String(x.customer).padStart(2)}本　写真の依頼 ${String(x.wanted).padStart(2)}本　トップの山 ${x.peak}`);
  }
  const same = seen.every((x) => x.skeleton === seen[0].skeleton);
  console.log(`\n  **骨格（写真の帯を除いた、内容と見せ方の並び）**`);
  console.log(`  ${same ? "○ A/B/C で同じ" : "✗ 写真の枚数で骨格が変わっています"}`);
  if (!same) for (const x of seen) console.log(`      ${x.label}： ${x.skeleton}`);
  const rh = seen.every((x) => x.rhythm === seen[0].rhythm);
  if (!rh) {
    console.log(`  （面・余白・組み方は取り直されました。帯が増えればリズムの計算が変わります）`);
    for (const x of seen) console.log(`      ${x.label.padEnd(14)} ${x.rhythm}`);
  }
  const down = seen[0].wanted >= seen[1].wanted && seen[1].wanted >= seen[2].wanted;
  console.log(`  ${down ? "○" : "✗"} 写真が届くほど、依頼が減る（${seen.map((x) => x.wanted).join(" → ")}）`);
  const up = seen[0].customer <= seen[1].customer && seen[1].customer <= seen[2].customer;
  console.log(`  ${up ? "○" : "✗"} 写真が届くほど、お客様の写真を出す帯が増える（${seen.map((x) => x.customer).join(" → ")}）`);
  if (!same || !down || !up) process.exitCode = 1;
}

console.log("\n  画面を撮ります…");
const shot = spawnSync("node", ["qa-assets-shot.mjs", OUT, ...built.map((b) => `${b.pid}|${b.plan} ${b.label}|${b.root}`)], { encoding: "utf8", stdio: "inherit" });
if (shot.status !== 0) process.exitCode = 1;
console.log(`\n  保存先： ${OUT}\n`);
