/**
 * KOBO — 同じ型でも、会社によって情報表現が変わるか
 *
 *   npm run qa:companies
 *
 * **これが本丸**（D-209）。
 * `qa:directions` は「同じ会社 × 違う型」を見るので、
 * **型ごとにテーマを当てているだけ**でも数字は下がってしまう。
 *
 * ここでは**型を1つに固定し、会社の強みだけを変える。**
 * 同じ「精密加工」を選んでも、
 *   精度が強み   → 大きな数字・仕様表
 *   難加工が強み → 工程・引用
 *   短納期が強み → 対比・工程
 * になるかを見る。
 *
 * 使うのは Visual QA 専用の架空データ（`fixtures/design-diversity/`）。
 * **実案件には使わない。**
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeBrief } from "./brief.mjs";

/**
 * `--compare` を付けると、**規則版とAI版を並べて出す。**
 * `--ai` を付けたときだけ本物のAIを呼ぶ（鍵が無ければ規則版に落ちて、そのまま最後まで進む）。
 */
const FLAGS = process.argv.slice(2);
const COMPARE = FLAGS.includes("--compare");
const USE_AI = FLAGS.includes("--ai");

const SRC = path.join("fixtures", "design-diversity");
const COMPANIES = [
  ["a-precision", "A 精度が強い会社"],
  ["b-difficulty", "B 難加工が強い会社"],
  ["c-speed", "C 短納期が強い会社"],
];

for (const f of fs.existsSync("projects") ? fs.readdirSync("projects") : []) {
  if (f.startsWith("qc-")) fs.rmSync(path.join("projects", f), { recursive: true, force: true });
}

console.log("\n  **型を「精密加工」に固定し、会社の強みだけを変えます**\n");

const results = [];
for (const [file, label] of COMPANIES) {
  const id = `qc-${file}`;
  const dir = path.join("projects", id);
  fs.mkdirSync(dir, { recursive: true });
  const p = JSON.parse(fs.readFileSync(path.join(SRC, `${file}.json`), "utf8"));
  p.id = id;
  const projectFile = path.join(dir, "project.json");
  fs.writeFileSync(projectFile, JSON.stringify(p, null, 2));

  /**
   * **比べるときだけ Brief を作る。**
   * 付けなければ `designBrief` は無く、**いままでどおり規則版だけで決まる。**
   */
  let brief = null;
  if (COMPARE) {
    brief = await writeBrief(JSON.parse(fs.readFileSync(projectFile, "utf8")), projectFile, {
      useAI: USE_AI, onProgress: (m) => { if (USE_AI) console.log(`  ${label}${m}`); },
    });
  }

  const r = spawnSync("node", ["build-site.mjs", id], { encoding: "utf8" });
  const file1 = path.join(dir, "site", "index.html");
  const file2 = path.join(dir, "site-draft", "index.html");
  const html = fs.existsSync(file1) ? fs.readFileSync(file1, "utf8")
    : fs.existsSync(file2) ? fs.readFileSync(file2, "utf8") : null;
  if (!html) {
    console.log(`  ✗ ${label} を書き出せませんでした`);
    console.log((r.stdout ?? "").split("\n").slice(-10).join("\n"));
    continue;
  }
  const strength = /この会社の最大の強み：([^\n<]*)/.exec(r.stdout ?? "")?.[1]?.trim() ?? "";
  const bands = [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
    const at = (k) => (new RegExp(`data-${k}="([a-zA-Z]+)"`).exec(m[1]) ?? [, "-"])[1];
    return `${at("content")}:${at("presentation")}`;
  });
  const hero = /data-hero="([a-z]+)"/.exec(html)?.[1] ?? "-";
  /**
   * **HTMLそのものから読む。**
   * 「AIがそう判断した」ではなく「画面がそうなった」を見ないと、
   * AIを入れた意味があったのかを確かめようがない（ご指示6）。
   */
  const decided = [...html.matchAll(/data-content="([a-z]+)" data-presentation="([a-zA-Z]+)" data-decided-by="([a-z-]+)"/g)]
    .map((m) => ({ content: m[1], presentation: m[2], by: m[3] }));
  results.push({ label, strength, bands, hero, brief, decided });
}

console.log("━━━ 同じ型「精密加工」で、会社だけを変えた結果 ━━━\n");
for (const r of results) {
  console.log(`  ${r.label}　最大の強み: ${r.strength || "(表示なし)"}　最初の画面: ${r.hero}`);
  for (const b of r.bands) console.log(`      ${b}`);
  console.log("");
}

console.log("━━━ 情報の見せ方の重なり（1.00 = まったく同じ）━━━\n");
let tot = 0, n = 0, same = 0;
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const A = new Set(results[i].bands), B = new Set(results[j].bands);
    const inter = [...A].filter((x) => B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    const s = uni ? inter / uni : 1;
    tot += s; n++; if (s === 1) same++;
    console.log(`  ${s.toFixed(2)}  ${results[i].label} × ${results[j].label}${s === 1 ? "　★まったく同じ" : ""}`);
  }
}
console.log("\n━━━ まとめ ━━━");
console.log(`  組み合わせ ${n}通り　平均 ${(tot / n).toFixed(2)}`);
console.log(`  **まったく同じ見せ方になった組み合わせ： ${same}/${n}通り**`);
if (COMPARE) {
  console.log("\n━━━ 規則版とAI版 ━━━\n");
  console.log(`  AIの呼び出し：${USE_AI ? "あり（--ai）" : "なし。--ai を付けると呼びます"}\n`);
  for (const r of results) {
    const b = r.brief;
    const SOURCE = { rules: "規則版", ai: "AI版", "ai-fallback": "AI版→規則版に戻した" };
    console.log(`  ${r.label}　判断の出所：${SOURCE[b?.source] ?? "-"}`
      + (b?.source === "ai" ? `　規則版と${b.agreedWithRules ? "同じ" : "違う"}判断` : ""));
    if (b?.problems?.length) for (const p of b.problems) console.log(`      検査落ち：${p.stage}　${p.where}　${p.message}`);
    /** **画面に出ている印**で数える。Briefの中身ではない */
    const byAI = r.decided.filter((d) => d.by === "ai");
    const fell = r.decided.filter((d) => d.by === "ai-fallback");
    console.log(`      トップの帯 ${r.decided.length}本　うちAIの判断で変わった ${byAI.length}本　検査で規則版に戻した ${fell.length}本`);
    for (const d of r.decided) {
      if (d.by === "rules") continue;
      console.log(`        ${d.content}:${d.presentation}　[${d.by}]`);
    }
    console.log("");
  }
  console.log("  **AIが規則版と同じ判断をしても失敗ではありません。**");
  console.log("  規則で十分なところで、AIが余計なことをしていないかを見ています。\n");
}

console.log(`\n  目で見て確かめる：`);
for (const [file] of COMPANIES) console.log(`    npm run preview:site -- qc-${file}`);
console.log("");
