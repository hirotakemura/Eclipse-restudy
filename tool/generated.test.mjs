/**
 * KOBO — 生成ビジュアルの検査（第9段階）
 *
 * **確かめたいのは「絵が増えたか」ではない。**
 *   ① 生成が**証拠に届かない**こと（実写の代用品にならない）
 *   ② 絵が無いとき、**既存の画面が1つも動かない**こと
 *   ③ 絵があるとき、**決めた場所にだけ**入ること
 *   ④ 会社が違えば、**視覚言語とプロンプトが違う**こと
 */
import fs from "node:fs";
import path from "node:path";
import { analyze } from "./lib/design/analysis.ts";
import { composeTop, composePage } from "./lib/design/sections.ts";
import { composeVisual } from "./lib/design/visual.ts";
import { composeAssets } from "./lib/design/assets.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { planGeneratedVisuals, visualLanguageOf, storedPlan, companySignals } from "./lib/design/generated-brief.ts";
import {
  assertGenerated, assertVisualLanguages, isReady, generatedPath, DRAWABLE, EVIDENTIAL,
  ALLOWED, MAX_GENERATED, VISUAL_LANGUAGES, LANGUAGE_OF, NEGATIVE_PROMPT, FORBIDDEN_IN_PROMPT,
} from "./lib/design/system/index.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";
import { PRIMARY_STRENGTHS } from "./lib/design/analysis.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); }
};
const load = (f) => sanitizeProject(JSON.parse(fs.readFileSync(f, "utf8")));
const FIXTURES = [
  ["A 精度", "fixtures/design-diversity/a-precision.json"],
  ["B 難加工", "fixtures/design-diversity/b-difficulty.json"],
  ["C 短納期", "fixtures/design-diversity/c-speed.json"],
  ["汎用A", "fixtures/visual-general/g-a-service.json"],
  ["汎用B", "fixtures/visual-general/g-b-brand.json"],
  ["汎用C", "fixtures/visual-general/g-c-people.json"],
];
const PAGES = ["strengths", "capability", "equipment", "company", "contact"];

console.log("\n━━━ 語彙：生成は証拠に届かない ━━━");
{
  check("生成は雰囲気にだけ許されている",
    ALLOWED.atmosphere.includes("generated") && !ALLOWED.evidence.includes("generated"));
  check("視覚言語の主題は、描ける5つの中だけ",
    VISUAL_LANGUAGES.every((l) => l.subjects.every((s) => DRAWABLE.includes(s))));
  /** **実写でしか撮れない主題を、視覚言語が持てないこと**（工場写真の代用品にしない） */
  const REAL = ["workpiece", "facility", "exterior", "person", "workplace", "product"];
  check("実写の主題を、視覚言語が1つも持っていない",
    VISUAL_LANGUAGES.every((l) => l.subjects.every((s) => !REAL.includes(s))));
  check("勝ち筋は全部、視覚言語に対応がある",
    PRIMARY_STRENGTHS.every((s) => LANGUAGE_OF[s] !== undefined),
    PRIMARY_STRENGTHS.filter((s) => LANGUAGE_OF[s] === undefined).join(" "));
  /** 語彙そのものが自分で自分を検査している */
  let threw = false;
  try { assertVisualLanguages([{ id: "x", label: "x", note: "x", axis: ["a"], subjects: ["facility"] }]); }
  catch { threw = true; }
  check("描けない主題を書いた視覚言語は、読み込みで落ちる", threw);
}

console.log("\n━━━ 注文書の検査 ━━━");
{
  const p = load(FIXTURES[1][1]);
  const a = analyze(p);
  const { visuals } = planGeneratedVisuals(p, a, "technical");
  check("上限を超えない（2〜4枚）", visuals.length > 0 && visuals.length <= MAX_GENERATED, `${visuals.length}枚`);
  check("出所と意図がリテラルで固定されている",
    visuals.every((v) => v.source === "generated" && v.intent === "atmosphere"));
  check("主題は描ける5つの中だけ", visuals.every((v) => DRAWABLE.includes(v.subject)));
  check("既定は「絵はまだ無い」", visuals.every((v) => v.status === "brief" && !v.provenance.file));
  check("打ち消しが全件に入っている", visuals.every((v) => v.negativePrompt === NEGATIVE_PROMPT));
  check("モバイルの指定が全件にある",
    visuals.every((v) => v.mobile.cropSafe && v.mobile.textSafeArea && v.mobile.focalPoint));
  /** **禁じた言葉が注文書に混ざらない**（打ち消しに書くだけにしない） */
  const dirty = visuals.filter((v) => FORBIDDEN_IN_PROMPT.some((w) => new RegExp(`\\b${w}\\b`).test(v.prompt.toLowerCase())));
  check("プロンプトに、実在しないものを描かせる言葉が無い", dirty.length === 0,
    dirty.map((v) => v.visualId).join(" "));

  const bad = (patch) => { try { assertGenerated([{ ...visuals[0], ...patch }]); return false; } catch { return true; } };
  check("実写の主題は登録できない", bad({ subject: "facility" }));
  check("用途の語彙外は登録できない", bad({ purpose: "banner" }));
  check("プロンプトが空だと登録できない", bad({ prompt: "  " }));
  check("禁じた言葉を入れると登録できない", bad({ prompt: "a factory floor with cnc machine" }));
  check("絵があるのに来歴が空だと登録できない", bad({ status: "ready", provenance: { file: "x.png" } }));
  check("上限を超えると登録できない", (() => {
    try { assertGenerated(Array.from({ length: MAX_GENERATED + 1 }, (_, i) => ({ ...visuals[0], visualId: `x${i}` }))); return false; }
    catch { return true; }
  })());
}

console.log("\n━━━ 会社ごとに、絵の方針が変わるか ━━━");
{
  const langs = new Map();
  for (const [name, f] of FIXTURES) {
    const p = load(f);
    const a = analyze(p);
    const plan = visualLanguageOf(p, a, "standard");
    langs.set(name, `${plan.id}|${plan.material}|${plan.lighting}|${plan.density}`);
  }
  check("6社で、視覚言語の組み合わせが1種類に潰れていない",
    new Set(langs.values()).size >= 3, [...langs.entries()].map(([k, v]) => `${k}:${v.split("|")[0]}`).join(" "));
  /** **同じ会社でも、型が変われば光が変わる**（型の面から引いているため） */
  const p = load(FIXTURES[0][1]);
  const a = analyze(p);
  const byDir = new Set(DIRECTIONS.map((d) => visualLanguageOf(p, a, d.id).lighting));
  check("同じ会社でも、型によって光が変わる", byDir.size >= 2, `${byDir.size}種類`);
  /** **同じ入力なら同じ結果**（乱数も時刻も使っていない） */
  const x = planGeneratedVisuals(p, a, "technical");
  const y = planGeneratedVisuals(p, a, "technical");
  check("同じ入力なら、注文書は完全に一致する",
    JSON.stringify(x) === JSON.stringify(y));
  /**
   * **注文書を保存しても、印は変わらない**（D-256と同じ理屈・第9段階で1度やった）。
   * 印が変わると `visualId` が変わり、**届いていた絵の状態を引き継げなくなる。**
   */
  {
    const before = JSON.stringify(planGeneratedVisuals(p, a, "technical").visuals.map((v) => v.visualId));
    const saved = { ...p, visualPlan: storedPlan(p, planGeneratedVisuals(p, a, "technical")) };
    const after = JSON.stringify(planGeneratedVisuals(saved, a, "technical").visuals.map((v) => v.visualId));
    check("注文書を保存しても visualId が変わらない", before === after, `${before} → ${after}`);
  }
}

console.log("\n━━━ 会社固有性：別の会社のプロンプトとして成立しないか（第9段階②）━━━");
{
  /**
   * **ここがこの段のいちばん重要な検査である。**
   *
   * 1枚目を実際に生成して分かったのは、「アルミを扱うどの会社でも成立する絵」だったこと。
   * 勝ち筋そのままの言葉は抽象すぎて絵にならないので、**その会社が話した言葉**を拾うようにした。
   * ここでは「拾えているか」ではなく、**別の会社と入れ替えて成立しないか**を見る。
   */
  const words = (s) => new Set(s.toLowerCase().split(/[,\s]+/).filter((w) => w.length > 3));
  const overlap = (a, b) => {
    const A = words(a), B = words(b);
    const shared = [...A].filter((w) => B.has(w)).length;
    return shared / Math.max(A.size, B.size);
  };
  const plans = FIXTURES.map(([name, f]) => {
    const p = load(f);
    return { name, sig: companySignals(p), plan: planGeneratedVisuals(p, analyze(p), "standard") };
  });

  /** ① その会社の言葉から、手がかりを拾えているか */
  const thin = plans.filter((x) => x.sig.from.length < 2);
  check("6社とも、会社の言葉から手がかりを2つ以上拾えている", thin.length === 0,
    thin.map((x) => `${x.name}:${x.sig.from.length}`).join(" "));

  /**
   * ② 会社どうしで、同じ絵の注文になっていないか。
   *
   * **測るのは「会社から来た部分」だけ**である。
   * プロンプトの後半（構図・光・比・モバイル・打ち消し）は**用途ごとの共通文**で、
   * 同じ用途なら一致していて当たり前——そこを混ぜて数えると、
   * **中身が違うのに「似ている」と出る**（実測：A精度とC短納期が89%。
   * 中身は「極小の平面／等間隔に並ぶ同形」で、まったく別の絵だった）。
   * 測りたいものに、測り方を合わせる（D-192）。
   */
  const own = (x) => [...x.sig.form, ...x.sig.problem, ...x.sig.act, ...x.sig.time, x.sig.scale,
    x.plan.language.material].join(", ");
  let worst = { r: 0, pair: "" }, worstAll = { r: 0, pair: "" };
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const r = overlap(own(plans[i]), own(plans[j]));
      if (r > worst.r) worst = { r, pair: `${plans[i].name} × ${plans[j].name}` };
      const a = plans[i].plan.visuals[0], b = plans[j].plan.visuals[0];
      if (!a || !b) continue;
      const ra = overlap(a.prompt, b.prompt);
      if (ra > worstAll.r) worstAll = { r: ra, pair: `${plans[i].name} × ${plans[j].name}` };
    }
  }
  check("どの2社を並べても、会社から来た部分が8割以上は一致しない", worst.r < 0.8,
    `最も似ている組：${worst.pair} ${(worst.r * 100).toFixed(0)}%`);
  /** 安全網。**全文が丸ごと同じなら、それは会社を見ていない** */
  check("どの2社を並べても、プロンプト全文が同一ではない", worstAll.r < 0.95,
    `最も似ている組：${worstAll.pair} ${(worstAll.r * 100).toFixed(0)}%`);

  /** ③ 同じ会社でも、ページ目的が違えば別のプロンプトになるか */
  const one = plans.find((x) => x.plan.visuals.length >= 3);
  if (one) {
    const ps = one.plan.visuals.map((v) => v.prompt);
    const uniq = new Set(ps).size;
    check("同じ会社でも、ページ目的ごとにプロンプトが違う", uniq === ps.length, `${uniq}/${ps.length}`);
    let sim = 0;
    for (let i = 1; i < ps.length; i++) sim = Math.max(sim, overlap(ps[0], ps[i]));
    check("同じ会社の中でも、用途どうしが9割以上は一致しない", sim < 0.9, `${(sim * 100).toFixed(0)}%`);
    /** **用途ごとに主役が違う**（同じ絵を4枚作らない） */
    /** **用途ごとに主役の手がかりが違う**（同じ会社に似た絵を4枚作らない） */
    const leads = one.plan.visuals.map((v) => v.prompt.split(", ")[2]);
    check("用途ごとに、主役にしている手がかりが違う", new Set(leads).size >= 3,
      leads.map((x) => (x ?? "").slice(0, 24)).join(" / "));
    check("用途ごとに、視点（viewpoint）が違う",
      new Set(one.plan.visuals.map((v) => /view[^,]*/.exec(v.prompt)?.[0])).size >= 2);
  }

  /** ④ 画像生成に渡して意味のある項目が、すべて入っているか */
  const need = [/focal point at \d+%/, /aspect ratio/, /cropped to/, /negative space/, /view/, /composition/];
  const missing = [];
  for (const x of plans) for (const v of x.plan.visuals) {
    for (const re of need) if (!re.test(v.prompt)) missing.push(`${x.name}/${v.purpose}:${re}`);
  }
  check("焦点・比・モバイル・余白・視点・構図が、全プロンプトに入っている", missing.length === 0,
    missing.slice(0, 3).join(" "));

  /** ⑤ **数値も固有名詞も絵に渡していない**（事実を捏造させない） */
  const leaked = [];
  for (const x of plans) for (const v of x.plan.visuals) {
    if (/\d+\s*mm|±|ISO\s*\d|\bJIS\b/i.test(v.prompt)) leaked.push(`${x.name}/${v.purpose}`);
  }
  check("公差・規格・型番などの数値が、プロンプトに漏れていない", leaked.length === 0, leaked.join(" "));
}

console.log("\n━━━ 絵が無いとき、画面が動かないか ━━━");
{
  let moved = 0, pages = 0;
  for (const [, f] of FIXTURES) {
    const p = load(f);
    const a = analyze(p);
    const withPlan = { ...p, visualPlan: storedPlan(p, planGeneratedVisuals(p, a, "standard")) };
    for (const d of DIRECTIONS.slice(0, 6)) {
      for (const page of ["index", ...PAGES]) {
        const base = () => page === "index" ? composeTop(p, a, { direction: d.id }) : composePage(page, p, a, { direction: d.id });
        const before = composeAssets(composeVisual(base(), p, a, { direction: d.id }), p, a, { direction: d.id, page });
        const after = composeAssets(composeVisual(base(), withPlan, a, { direction: d.id }), withPlan, a, { direction: d.id, page });
        pages++;
        if (JSON.stringify(before.map((s) => s.asset)) !== JSON.stringify(after.map((s) => s.asset))) moved++;
      }
    }
  }
  check(`注文書があっても、絵が無ければ素材の判断が1つも動かない（${pages}ページ）`, moved === 0, `${moved}ページで動いた`);
}

console.log("\n━━━ 絵があるとき、決めた場所にだけ入るか ━━━");
{
  const p = load(FIXTURES[1][1]);
  const a = analyze(p);
  const plan = planGeneratedVisuals(p, a, "standard");
  /** **検査用の絵**。生成サービスで作ったものではないので、出所もそう書く */
  const ready = plan.visuals.map((v) => ({
    ...v, status: "ready",
    provenance: { provider: "fixture（検査用・生成ではない）", generatedAt: "2026-09-16T00:00:00.000Z", commercialUse: "自社検査用", file: `${v.visualId}.png` },
  }));
  assertGenerated(ready);
  const withImg = { ...p, visualPlan: { language: plan.language, visuals: ready, sourceProjectHash: "x", generatedAt: "x" } };

  const secs = composeAssets(composeVisual(composeTop(p, a, { direction: "standard" }), withImg, a, { direction: "standard" }),
    withImg, a, { direction: "standard", page: "index" });
  const gen = secs.filter((s) => s.asset.source === "generated");
  check("トップに生成ビジュアルが入った", gen.length > 0, `${gen.length}本`);
  check("入ったのは、注文書が指した帯だけ",
    gen.every((s) => ready.some((v) => v.placement.page === "index"
      && (v.placement.slot === "hero" ? s.kind === "hero" : v.placement.slot === s.content))),
    gen.map((s) => `${s.kind}/${s.content}`).join(" "));
  check("生成が入った帯は、すべて雰囲気", gen.every((s) => s.asset.intent === "atmosphere"));
  check("証拠の帯に生成が1つも入っていない",
    secs.every((s) => s.asset.intent !== "evidence" || s.asset.source !== "generated"));
  check("証拠になる内容に、生成が入っていない",
    secs.every((s) => !EVIDENTIAL.includes(s.content) || s.asset.source !== "generated"),
    secs.filter((s) => EVIDENTIAL.includes(s.content) && s.asset.source === "generated").map((s) => s.content).join(" "));
  check("画像の場所と焦点が、参照として残っている",
    gen.every((s) => s.asset.generated?.path?.startsWith("/generated/") && /%/.test(s.asset.generated?.focal ?? "")));
  check("お客様の写真の扱いが変わっていない",
    secs.filter((s) => s.asset.source === "customer").every((s) => s.asset.intent === "evidence"));
  /** **すでに描かれている帯は触らない**（装飾を重ねない・D-324） */
  check("graphic / library の帯を上書きしていない",
    secs.every((s) => s.asset.source !== "generated" || s.asset.library === undefined));
}

console.log("\n━━━ 画像の場所 ━━━");
{
  check("公開のパスは /generated/ の下", generatedPath("a.png") === "/generated/a.png");
  check("絵が無ければ、出せる状態にならない",
    !isReady({ status: "ready", provenance: {} }) && !isReady({ status: "brief", provenance: { file: "a.png" } }));
  /** **注文書の置き場所と、お客様の写真の置き場所を混ぜない** */
  const build = fs.readFileSync("build-site.mjs", "utf8");
  check("書き出しは generated/ と photos/ を別に配る",
    /"generated"/.test(build) && /public", "photos"/.test(build));
  check("書き出しで画像を作っていない", !/(生成|generate).*API|anthropic/i.test(build.split("const genDst")[1]?.slice(0, 800) ?? ""));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
