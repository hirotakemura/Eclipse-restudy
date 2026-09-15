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
import { analyze } from "./lib/design/analysis.ts";
import { photoRequestsFor } from "./lib/design/assets.ts";

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
    /**
     * **依頼は画面からは数えられない**（D-317）。
     * 写真の無い帯は描かれないので、`data-asset-wanted` はHTMLに出ない。
     * **持っているが描かない**ものなので、Asset層に直接聞く。
     */
    const wanted = photoRequestsFor(p, analyze(p)).length;
    let customer = 0, pages = 0;
    for (const pg of ["", "strengths", "capability", "equipment", "cases", "cases/1", "cases/2", "company", "contact"]) {
      const r = read(pg); if (!r) continue; pages++;
      customer += r.filter((b) => b.src === "customer").length;
    }
    const peak = top.find((b) => b.peak);
    seen.push({ label, skeleton, rhythm, wanted, customer, pages, peak: peak ? `${peak.content}:${peak.peak}` : "なし", pid, root });
    /** **人が見て判断するための3枚**（第4段階）。トップ・事例1件目・設備 */
    built.push({ plan: "A/B/C", id: `abc-${seen.length}`, label, pid, root, shots: ["/", "/cases/1/", "/equipment/"] });
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
  console.log(`  ${down ? "○" : "✗"} 写真が届くほど、依頼が減る（${seen.map((x) => x.wanted).join(" → ")}　※置き場所ごとに1件）`);
  const up = seen[0].customer <= seen[1].customer && seen[1].customer <= seen[2].customer;
  console.log(`  ${up ? "○" : "✗"} 写真が届くほど、お客様の写真を出す帯が増える（${seen.map((x) => x.customer).join(" → ")}）`);
  if (!same || !down || !up) process.exitCode = 1;
}

/**
 * ── 原則C：表現が内容を壊していないか（第6.5段階）───────────────
 *
 * **語彙表（`KEEPS`）を信じない。書き出したHTMLで数え直す。**
 *
 * 実測でこうなっていた：加工事例が4件ある会社の一覧ページで、
 * **画面に出ていたのは0件**（`process` が代表1件、`quote` が1発言）。
 * 可否表も材料の条件も通っていたので、どの検査も緑のまま素通ししていた。
 *
 * ここで見るのは「サイト全体のどこかで、その内容の全件が読めるか」である。
 * **1つの帯で全部出せという意味ではない**——トップページが代表1件を見せて
 * 一覧へ誘導するのは正しい設計で、一覧に全件あれば内容は壊れていない。
 */
{
  const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const bad = [];
  let checked = 0;
  for (const b of built) {
    const pj = JSON.parse(fs.readFileSync(path.join("projects", b.pid, "project.json"), "utf8"));
    const cap = pj.capability ?? {};
    const ITEMS = {
      加工事例: (pj.cases ?? []).map((c) => c.title).filter(Boolean),
      設備: (cap.equipment ?? []).map((e) => e.model || e.maker).filter(Boolean),
      対応材質: (cap.materials ?? []).filter(Boolean),
      沿革: (pj.basics?.history ?? []).map((h) => h.event).filter(Boolean),
      取り扱い: (pj.general?.offerings ?? []).map((o) => o.name).filter(Boolean),
    };
    const root = b.root;
    if (!fs.existsSync(root)) continue;
    const files = fs.readdirSync(root, { recursive: true }).filter((f) => String(f).endsWith(".html"));
    /** サイト全体の文字。**どのページで読めてもよい** */
    const all = files.map((f) => strip(fs.readFileSync(path.join(root, String(f)), "utf8"))).join(" ");
    for (const [name, items] of Object.entries(ITEMS)) {
      if (items.length < 2) continue;
      checked++;
      const hit = items.filter((t) => all.includes(String(t).slice(0, 12))).length;
      if (hit < items.length) bad.push(`  ✗ ${b.plan} ${b.label} ${name}：${items.length}件のうち ${hit}件しか画面に出ていません`);
    }
  }
  console.log(`\n  ── 表現が内容を壊していないか（原則C）── ${checked}件の内容`);
  if (bad.length) { bad.forEach((x) => console.log(x)); process.exitCode = 1; }
  else console.log("  ○ 複数件ある内容は、すべてサイトのどこかで全件読める");
}

console.log("\n  画面を撮ります…");
const shot = spawnSync("node", ["qa-assets-shot.mjs", OUT, ...built.map((b) => `${b.pid}|${b.plan} ${b.label}|${b.root}|${(b.shots ?? []).join(",")}`)], { encoding: "utf8", stdio: "inherit" });
if (shot.status !== 0) process.exitCode = 1;
/**
 * ── 人が見て判断するための紙 ────────────────────────
 *
 * **機械が確かめられることと、人が見て決めることを分ける**（ご指示・第4段階）。
 *
 * 機械に言えるのは「あってはいけないことが無い」までである。
 * **「写真0枚でも完成して見えるか」は、人が画面を見て決めるしかない。**
 * 数にすると、その数を下げることが目的になってしまう（docs/31 原則⑤）。
 */
{
  const q = [
    ["写真0枚でも未完成に見えないか", "A 写真0枚 の3枚。**穴が空いて見えないか。** 装飾が無い型（落ち着き・信頼）も同じ目で見る"],
    ["写真がある場合、意味のある使われ方になっているか", "B と C。**その写真でなければいけない場所に出ているか**（事例の写真が事例のページに、など）"],
    ["視線の流れがあるか", "各型のトップ。上から下へ、止まる場所と流す場所があるか"],
    ["ページに適切な Visual Peak があるか", "各型のトップ。**どこが山か、目で分かるか**"],
    ["会社ごとの個性が感じられるか", "6つの型を並べて見る。**同じ会社データで型だけを変えている**ので、差は型の差である"],
    ["装飾過多になっていないか", "モダン・力強い。**装飾が本文より目立っていないか**"],
    ["写真が単なる穴埋めになっていないか", "C 十分。**枚数が増えただけになっていないか**"],
  ];
  const lines = [];
  const o = (x = "") => lines.push(x);
  o("# 素材（Asset）の見え方 — 人が見て判断するもの");
  o("");
  o(`作成 ${new Date().toLocaleDateString("ja-JP")}　／　\`npm run qa:assets\` が作っています`);
  o("");
  o("**機械が確かめたことは、ここには書きません。**（画面に出ています）");
  o("ここにあるのは、**人が画面を見ないと決められないこと**だけです。");
  o("");
  o("> 数にしないでください。**「装飾が何本」「写真が何枚」は品質ではありません。**");
  o("> `none`（素材を置かない）は、決まらなかったのではなく**要らないと決めた**状態です。");
  o("");
  o("---");
  o("");
  /**
   * **画面そのものはGitに置かない**（D-328）。18MBを毎回積む意味がない。
   * 代わりに、**この紙だけで撮り直せるように**手順を書いておく。
   */
  o("## この画面の撮り直し方");
  o("");
  o("```");
  o("cd tool && npm run qa:assets");
  o("```");
  o("");
  o("PNGは**Gitに入れていません**（`.gitignore`・D-328）。上を実行すると同じ場所に出ます。");
  o("画面は手元で見るもので、履歴に積むものではない、という判断です。");
  o("");
  o("---");
  o("");
  o("## 見るところ");
  o("");
  for (const [i, [name, how]] of q.entries()) {
    o(`### ${i + 1}. ${name}`);
    o("");
    o(`- ${how}`);
    o("- [ ] 見た　／　気づいたこと：");
    o("");
  }
  o("---");
  o("");
  o("## 画面の一覧");
  o("");
  o("### 型ごと（同じ会社データ・写真0枚）");
  o("");
  o("| 型 | PC | スマホ |");
  o("|---|---|---|");
  for (const b of built.filter((x) => x.plan !== "A/B/C")) {
    o(`| ${b.plan} ${b.label} | \`${b.pid}-pc-index.png\` ほか4枚 | \`${b.pid}-sp-index.png\` ほか4枚 |`);
  }
  o("");
  o("### 写真 0枚 / 少数 / 十分（同じ会社・同じ型）");
  o("");
  o("| | PC | スマホ |");
  o("|---|---|---|");
  for (const b of built.filter((x) => x.plan === "A/B/C")) {
    o(`| ${b.label} | \`${b.pid}-pc-index.png\` / \`-cases-1.png\` / \`-equipment.png\` | 同名の \`-sp-\` |`);
  }
  o("");
  fs.writeFileSync(path.join(OUT, "検査票.md"), lines.join("\n") + "\n");
  console.log(`  検査票： ${path.join(OUT, "検査票.md")}`);
}

console.log(`\n  保存先： ${OUT}\n`);
