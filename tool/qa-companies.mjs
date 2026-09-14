/**
 * KOBO — 同じ型でも、会社によって情報表現が変わるか
 *
 *   npm run qa:companies                    AI OFF。**これが基準（baseline）**
 *   npm run qa:companies -- --ai-brief      AI ON。基準との差分を出す
 *   npm run qa:companies -- --update-baseline   基準を更新する（意図した変更のときだけ）
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
 * 【AI OFF を基準にする理由】（ご指示）
 * **「AIを切れば、同じ入力から同じHTMLが出る」を毎回機械で確かめる。**
 * AI版の実装過程で入れた修正（D-219〜221）と、AI機能そのものによる変更を
 * 混ぜないための歯止めである。基準は `fixtures/design-diversity/baseline-ai-off.json`。
 *
 * 使うのは Visual QA 専用の架空データ（`fixtures/design-diversity/`）。
 * **実案件には使わない。**
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeBrief } from "./brief.mjs";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { resolveTheme } from "./lib/theme.ts";
import { ruleBrief } from "./lib/design/brief-rules.ts";

const FLAGS = process.argv.slice(2);
/** `--ai-brief`（ご指示の名前）と `--ai` のどちらでも受ける */
const USE_AI = FLAGS.includes("--ai-brief") || FLAGS.includes("--ai");
const UPDATE = FLAGS.includes("--update-baseline");

const SRC = path.join("fixtures", "design-diversity");
const BASELINE = path.join(SRC, "baseline-ai-off.json");
const COMPANIES = [
  ["a-precision", "A 精度が強い会社"],
  ["b-difficulty", "B 難加工が強い会社"],
  ["c-speed", "C 短納期が強い会社"],
];
/** 構成をデータから決めているページ。ここが検証の対象 */
const PAGES = ["index", "strengths/index", "capability/index", "equipment/index"];

/**
 * **鍵が無いときは、ここで止める**（ご指示）。
 *
 * `decideBrief` 自体は鍵が無くても規則版に落として最後まで進む（D-215）。
 * **その振る舞いは変えない。** 変えてよいのは検証の側だけで、
 * 規則版に落ちた結果を「AI版の比較結果」として報告するのが、いちばんまずい。
 */
if (USE_AI && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("\n  ✗ AI版の検証はできません。**APIキーがありません。**\n");
  console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...\n");
  console.error("  キーを設定してから、もう一度このコマンドを実行してください：");
  console.error("    npm run qa:companies -- --ai-brief\n");
  console.error("  （AI OFF の検証は、鍵が無くても走ります： npm run qa:companies）\n");
  process.exit(1);
}

for (const f of fs.existsSync("projects") ? fs.readdirSync("projects") : []) {
  if (f.startsWith("qc-")) fs.rmSync(path.join("projects", f), { recursive: true, force: true });
}

/** 帯を読む。**HTMLそのものから読む。**Briefの中身ではない */
const bandsOf = (html) =>
  [...html.matchAll(/<section class="section band"([^>]*)>/g)].map((m) => {
    const at = (k) => (new RegExp(`data-${k}="([a-zA-Z-]+)"`).exec(m[1]) ?? [, "-"])[1];
    return { content: at("content"), presentation: at("presentation"), emphasis: at("emphasis"), by: at("decided-by") };
  });
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
const pairOf = (b) => `${b.content}:${b.presentation}`;

console.log(`\n  **型を「精密加工」に固定し、会社の強みだけを変えます**`);
console.log(`  AIの呼び出し：${USE_AI ? "あり（--ai-brief）" : "なし。これが基準です"}\n`);

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
   * **AI OFF のときは Brief を作らない。**
   * 規則版の Brief を保存しても出力は同じだが、
   * 「基準＝いつもの書き出しと同じ道」でなければ基準の意味がない。
   */
  let brief = null, rules = null;
  if (USE_AI) {
    // 比較のために、規則版の判断も同じ手順で作っておく
    const clean = sanitizeProject(p);
    const a = analyze(clean);
    const r = resolveTheme(p.theme, "manufacturing");
    rules = ruleBrief(clean, a, { hero: r.hero.id, direction: r.direction, hasProse: false });
    brief = await writeBrief(JSON.parse(fs.readFileSync(projectFile, "utf8")), projectFile, {
      useAI: true, onProgress: (m) => console.log(`  ${label}${m}`),
    });
  }

  const r = spawnSync("node", ["build-site.mjs", id], { encoding: "utf8" });
  const root = fs.existsSync(path.join(dir, "site")) ? path.join(dir, "site") : path.join(dir, "site-draft");
  const read = (page) => {
    const f = path.join(root, `${page}.html`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  };
  const html = read("index");
  if (!html) {
    console.log(`  ✗ ${label} を書き出せませんでした`);
    console.log((r.stdout ?? "").split("\n").slice(-10).join("\n"));
    continue;
  }
  const pages = {};
  for (const page of PAGES) {
    const body = read(page);
    if (body) pages[page] = { bands: bandsOf(body), hash: digest(body) };
  }
  results.push({
    id: file, label, brief, rules, pages,
    strength: /この会社の最大の強み：([^\n<]*)/.exec(r.stdout ?? "")?.[1]?.trim() ?? "",
    bands: pages.index.bands,
    hero: /data-hero="([a-z]+)"/.exec(html)?.[1] ?? "-",
  });
}

// ── いつもの見立て ────────────────────────────────
console.log("━━━ 同じ型「精密加工」で、会社だけを変えた結果 ━━━\n");
for (const r of results) {
  console.log(`  ${r.label}　最大の強み: ${r.strength || "(表示なし)"}　最初の画面: ${r.hero}`);
  for (const b of r.bands) console.log(`      ${pairOf(b)}`);
  console.log("");
}

console.log("━━━ 情報の見せ方の重なり（1.00 = まったく同じ）━━━\n");
let tot = 0, n = 0, same = 0;
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const A = new Set(results[i].bands.map(pairOf)), B = new Set(results[j].bands.map(pairOf));
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

// ── 基準との照合 ──────────────────────────────────
const snapshot = Object.fromEntries(results.map((r) => [r.id, Object.fromEntries(
  Object.entries(r.pages).map(([page, v]) => [page, {
    hash: v.hash,
    bands: v.bands.map((b) => `${b.content}:${b.presentation}:${b.emphasis}`),
  }]),
)]));

if (UPDATE) {
  if (USE_AI) {
    console.error("\n  ✗ AI ON のまま基準を更新することはできません。基準は AI OFF の出力です。\n");
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\n  基準を更新しました：${BASELINE}`);
  console.log("  **意図した変更のときだけ更新してください。** 差分は git で確認できます。\n");
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.log(`\n  △ 基準がまだありません。作る：  npm run qa:companies -- --update-baseline\n`);
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

if (!USE_AI) {
  /**
   * **AI OFF なら、同じ入力から同じHTMLが出る**（ご指示の今後の基準）。
   * ページまるごとのハッシュで見るので、帯以外が変わっても気づく。
   */
  console.log("\n━━━ AI OFF の基準との照合 ━━━\n");
  let drift = 0;
  for (const r of results) {
    for (const page of PAGES) {
      const now = snapshot[r.id]?.[page], was = base[r.id]?.[page];
      if (!was) { console.log(`  △ ${r.id}/${page}　基準にありません`); continue; }
      if (!now) { console.log(`  ✗ ${r.id}/${page}　書き出されていません`); drift++; continue; }
      if (now.hash === was.hash) continue;
      drift++;
      console.log(`  ✗ ${r.id}/${page}　HTMLが基準と違います`);
      const a = was.bands.join(" ／ "), b = now.bands.join(" ／ ");
      if (a !== b) {
        console.log(`      基準：${a}`);
        console.log(`      現在：${b}`);
      } else {
        console.log(`      帯は同じですが、中身が変わっています（本文・部品・CSSなど）`);
      }
    }
  }
  if (drift) {
    console.log(`\n  ✗ ${drift}ページが基準と違います。`);
    console.log("  意図した変更なら：  npm run qa:companies -- --update-baseline");
    console.log("  意図していないなら、直してください。**AI OFF の出力は動かさない**のが約束です。\n");
    process.exit(1);
  }
  console.log("  ○ 全ページ、基準とまったく同じHTMLです（AI機能は出力に触れていません）\n");
}

// ── AI ON：基準との差分 ───────────────────────────
if (USE_AI) {
  const SOURCE = { rules: "規則版", ai: "AI版", "ai-fallback": "AI版→規則版に戻した" };
  console.log("\n━━━ AI OFF → AI ON で、最終HTMLの何が変わったか ━━━\n");
  let changedPages = 0, changedBands = 0;
  for (const r of results) {
    const b = r.brief, rl = r.rules;
    const adopted = b?.source === "ai";
    const line = (blocks) => (blocks ?? []).map((x) => `${x.content}:${x.presentation}/${x.emphasis}`).join("　");
    console.log(`  ── ${r.label} ──`);
    console.log(`  1. 規則版の primaryStrength　${rl?.primaryStrength}（2番目 ${rl?.secondaryStrength}）`);
    console.log(`  2. AI版の primaryStrength　　${adopted ? `${b.primaryStrength}（2番目 ${b.secondaryStrength}）` : "（採用されず）"}`);
    console.log(`  3. 規則版の priority`);
    console.log(`       ${line(rl?.blocks)}`);
    console.log(`  4. AI版の priority`);
    console.log(`       ${adopted ? line(b.blocks) : "（採用されず）"}`);
    /** 5・6：**Briefの中身の差**。画面に出たかどうかは10で見る */
    const diffs = adopted
      ? (rl?.blocks ?? []).map((x) => {
          const y = b.blocks.find((z) => z.content === x.content);
          return y && (y.presentation !== x.presentation || y.emphasis !== x.emphasis)
            ? `${x.content}　${x.presentation}/${x.emphasis} → ${y.presentation}/${y.emphasis}` : null;
        }).filter(Boolean)
      : [];
    console.log(`  5・6. AI版で変えた presentation / emphasis　${diffs.length ? "" : "（なし）"}`);
    for (const d of diffs) console.log(`       ${d}`);
    console.log(`  7. 最終採用された判断`);
    console.log(`       ${line(b?.blocks)}`);
    console.log(`  8. source　${SOURCE[b?.source] ?? "-"}`
      + (adopted ? `　規則版と${b.agreedWithRules ? "同じ" : "違う"}判断` : ""));
    if (b?.problems?.length) {
      console.log("  9. 4段検査　落ちました：");
      for (const p of b.problems) console.log(`       ${p.stage}　${p.where}　${p.message}`);
    } else {
      console.log("  9. 4段検査　問題なし");
    }
    console.log("  10. 最終HTMLで実際に変わったところ");
    for (const page of PAGES) {
      const now = snapshot[r.id]?.[page], was = base[r.id]?.[page];
      if (!now || !was) continue;
      if (now.hash === was.hash) { console.log(`       ${page.padEnd(18)} 変化なし`); continue; }
      changedPages++;
      console.log(`       ${page.padEnd(18)} **変わった**`);
      const nowBands = r.pages[page].bands;
      for (let i = 0; i < Math.max(was.bands.length, now.bands.length); i++) {
        const x = was.bands[i] ?? "（なし）", y = now.bands[i] ?? "（なし）";
        if (x === y) continue;
        changedBands++;
        console.log(`           ${x}  →  ${y}　[${nowBands[i]?.by ?? "-"}]`);
      }
    }
    console.log("");
  }
  console.log(`  変わったページ ${changedPages}　変わった帯 ${changedBands}`);
  console.log("\n  **AIが規則版と同じ判断をしても失敗ではありません。**");
  console.log("  規則で十分なところで、AIが余計なことをしていないかを見ています。");
  console.log("  **単なる変更は価値ではありません。** project.json の材料と画面を見て、");
  console.log("  その情報を主役にするのが妥当かを、人が判断してください。\n");
}

console.log(`\n  目で見て確かめる：`);
for (const [file] of COMPANIES) console.log(`    npm run preview:site -- qc-${file}`);
console.log("");
