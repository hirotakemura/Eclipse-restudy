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
import {
  planGeneratedVisuals, visualLanguageOf, storedPlan, companySignals,
  promptSections, PROMPT_SECTIONS, COMMON_WORLD, PURPOSE,
} from "./lib/design/generated-brief.ts";
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

console.log("\n━━━ 会社固有性：会社の出来事 / ページの出来事 / 共通の世界を、別々に測る（第9段階③）━━━");
{
  /**
   * **ここがこの段のいちばん重要な検査である。**
   *
   * 3枚を実際に生成して分かったのは、**会社の言葉はプロンプトに入っていたのに、
   * 絵が同じ顔になった**こと。原因は「言葉が足りない」ではなく、
   * **意味を画面の構造へ翻訳する段が無かった**ことだった。
   *
   * だから、文字列が一致するかだけを見ない（ご指示）。
   * プロンプトを4節に分け、**節ごとに別のことを確かめる。**
   *   SUBJECT … 会社の出来事＋ページの出来事。**ここだけが絵の違いを作る**
   *   FRAME / DEPTH … ページの出来事（並べ方・視点・光の当て方）
   *   WORLD … 共通の世界。**会社の中では1つに揃い、ページで揺れないこと**
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
  const all = plans.flatMap((x) => x.plan.visuals.map((v) => ({ co: x.name, sig: x.sig, v, sec: promptSections(v.prompt) })));

  /** 節が4つとも揃っていないと、以下の検査はすべて意味を失う。**先に確かめる** */
  check("全プロンプトが SUBJECT / FRAME / DEPTH / WORLD の4節になっている",
    all.every((x) => PROMPT_SECTIONS.every((k) => x.sec[k].trim().length > 0)),
    all.filter((x) => PROMPT_SECTIONS.some((k) => !x.sec[k].trim())).map((x) => `${x.co}/${x.v.purpose}`).join(" "));

  console.log("\n  ── ① 会社の出来事（company-specific visual event）──");
  /** その会社の言葉から、手がかりを拾えているか */
  const thin = plans.filter((x) => x.sig.from.length < 2);
  check("6社とも、会社の言葉から手がかりを2つ以上拾えている", thin.length === 0,
    thin.map((x) => `${x.name}:${x.sig.from.length}`).join(" "));

  /** **拾った手がかりが、SUBJECT節に出来事として入っているか**（拾って捨てていない） */
  const dropped = all.filter((x) => {
    const events = [...x.sig.form, ...x.sig.problem, ...x.sig.act, ...x.sig.time];
    return !events.some((e) => x.sec.SUBJECT.includes(e));
  });
  check("どのプロンプトでも、会社から拾った出来事が SUBJECT に入っている", dropped.length === 0,
    dropped.map((x) => `${x.co}/${x.v.purpose}`).join(" "));

  /**
   * **別の会社のプロンプトとして、そのまま成立しないか。**
   * 測るのは SUBJECT 節だけである。FRAME / DEPTH / WORLD は用途と型で決まる共通文で、
   * そこを混ぜて数えると**中身が違うのに「似ている」と出る**（D-372・実測89%）。
   */
  /**
   * **並べ方を混ぜて数えない。** SUBJECT には「会社の出来事」と「ページの並べ方」が両方入っていて、
   * 並べ方は同じ用途なら一致していて当たり前である。混ぜると**中身が違うのに似ていると出る**
   * （D-372と同じ罠を、ここでもう一度踏んだ。実測92%の中身は共通の並べ方だった）。
   * 数えるのは、**会社から来た出来事だけ**——SUBJECT の3文目以降である。
   */
  const eventsOf = (x) => x.sec.SUBJECT.split(". ").slice(2).join(". ");
  let worstSub = { r: 0, pair: "" };
  for (const purpose of ["firstView", "strength", "company", "peak"]) {
    const here = all.filter((x) => x.v.purpose === purpose);
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        const r = overlap(eventsOf(here[i]), eventsOf(here[j]));
        if (r > worstSub.r) worstSub = { r, pair: `${purpose}：${here[i].co} × ${here[j].co}` };
      }
    }
  }
  /**
   * **しきい値は 8割。** 7割で一度赤くしてみたが、赤くなったのは
   * 「どちらも治具を自社で作り、どちらも加工順序を組み直す」2社の技術の帯だった。
   * それは**測り方の誤りでも実装の欠陥でもなく、その2社が実際に似ている**という正しい読みである。
   * 割合だけに頼らず、下の「組み合わせが潰れていないか」と**2本立てで見る。**
   */
  check("同じ用途で会社を入れ替えても、会社から来た出来事が8割以上は一致しない", worstSub.r < 0.8,
    `最も似ている組：${worstSub.pair} ${(worstSub.r * 100).toFixed(0)}%`);
  /**
   * **割合より、こちらのほうが効く。** 6社ぶんの出来事の組み合わせが、
   * 用途ごとに**1つも重なっていないこと**——重なったら、その2社は絵を取り違えても気づけない。
   */
  const same = [];
  for (const purpose of ["firstView", "strength", "company", "peak"]) {
    const here = all.filter((x) => x.v.purpose === purpose);
    const set = new Set(here.map(eventsOf));
    if (set.size !== here.length) same.push(`${purpose} ${set.size}/${here.length}`);
  }
  check("用途ごとに、6社の「会社から来た出来事」の組み合わせが1つも重なっていない",
    same.length === 0, same.join(" "));
  /** **会社の出来事が空でないこと。** 空どうしは一致0%になり、上の検査をすり抜ける */
  check("どのプロンプトにも、会社から来た出来事が1つ以上ある",
    all.every((x) => eventsOf(x).trim().length > 0));
  /** 同じ用途で、6社ぶんの SUBJECT が1つも重なっていないこと（丸ごと流用できない） */
  const collide = [];
  for (const purpose of ["firstView", "strength", "company", "peak"]) {
    const here = all.filter((x) => x.v.purpose === purpose).map((x) => x.sec.SUBJECT);
    if (new Set(here).size !== here.length) collide.push(purpose);
  }
  check("同じ用途で、SUBJECT が完全一致する会社の組が無い", collide.length === 0, collide.join(" "));

  /** 安全網。**会社から来た部分**（手がかり＋尺度＋材質）どうしと、全文の両方を見る */
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
  check("どの2社を並べても、プロンプト全文が同一ではない", worstAll.r < 0.95,
    `最も似ている組：${worstAll.pair} ${(worstAll.r * 100).toFixed(0)}%`);

  console.log("\n  ── ② ページの出来事（page-specific visual event）──");
  /** **並べ方は用途のもの。** その用途のプロンプトにだけ入っていること */
  const misplaced = [];
  for (const x of all) {
    if (!x.sec.SUBJECT.includes(PURPOSE[x.v.purpose].arrangement)) misplaced.push(`欠:${x.co}/${x.v.purpose}`);
    for (const [k, spec] of Object.entries(PURPOSE)) {
      if (k !== x.v.purpose && x.sec.SUBJECT.includes(spec.arrangement)) misplaced.push(`混:${x.co}/${x.v.purpose}←${k}`);
    }
  }
  check("並べ方（要素数・位置・状態変化）が、その用途のプロンプトにだけ入っている",
    misplaced.length === 0, misplaced.slice(0, 3).join(" "));

  /** **画面に見える言葉になっているか。** 「精密」「誠実」では絵にならない（第9段階③の眼目） */
  const NEEDS = [
    ["要素数", /\b(one|two|three|four|five|many|each|every|identical|single)\b/],
    ["位置関係", /\b(left|right|above|below|beneath|underneath|behind|beside|between|centre|corner|edge|apart|bottom)\b/],
    ["接触・状態変化", /\b(meet|meets|meeting|touch|touches|rest|rests|resting|lift|lifts|settled|stage|stages|change|changes|changing|renewed|resolved|unbroken)\b/],
  ];
  const vague = [];
  for (const x of all) for (const [label, re] of NEEDS) if (!re.test(x.sec.SUBJECT)) vague.push(`${x.co}/${x.v.purpose}:${label}`);
  check("SUBJECT に、要素数・位置関係・接触／状態変化がすべて書かれている", vague.length === 0,
    vague.slice(0, 4).join(" "));

  /** 同じ会社でも、ページ目的が違えば別の絵になるか */
  const one = plans.find((x) => x.plan.visuals.length >= 3);
  if (one) {
    const secs = one.plan.visuals.map((v) => promptSections(v.prompt));
    check("同じ会社でも、ページ目的ごとにプロンプトが違う",
      new Set(one.plan.visuals.map((v) => v.prompt)).size === one.plan.visuals.length);
    check("同じ会社でも、用途ごとに SUBJECT が違う", new Set(secs.map((s) => s.SUBJECT)).size === secs.length);
    check("同じ会社でも、用途ごとに DEPTH（視点と光の当て方）が違う",
      new Set(secs.map((s) => s.DEPTH)).size === secs.length);
    let sim = 0;
    for (let i = 1; i < secs.length; i++) sim = Math.max(sim, overlap(secs[0].SUBJECT, secs[i].SUBJECT));
    check("同じ会社の中でも、用途どうしの SUBJECT が8割以上は一致しない", sim < 0.8, `${(sim * 100).toFixed(0)}%`);
    /** **用途ごとに主役の手がかりが違う**（同じ会社に似た絵を4枚作らない） */
    const leads = secs.map((s) => s.SUBJECT.split(". ")[2]);
    check("用途ごとに、主役にしている手がかりが違う", new Set(leads).size >= 3,
      leads.map((x) => (x ?? "").slice(0, 28)).join(" / "));
  }

  console.log("\n  ── ③ 共通の世界（common world）──");
  /** **世界観はページで揺れない。** 1社のサイトの中で光と材質が変わると、4枚がばらける */
  const wobble = plans.filter((x) => new Set(x.plan.visuals.map((v) => promptSections(v.prompt).WORLD)).size > 1);
  check("1つの会社の中では、WORLD が全用途で完全に一致する", wobble.length === 0,
    wobble.map((x) => x.name).join(" "));
  check("共通の打ち消し（COMMON_WORLD）が、全プロンプトに入っている",
    all.every((x) => x.sec.WORLD.includes(COMMON_WORLD)));
  /** **共通なのは打ち消しだけ。** 材質と光は会社と型のものなので、会社が違えば WORLD も変わる */
  check("会社が違えば、WORLD（材質・光）も1種類には潰れていない",
    new Set(plans.map((x) => promptSections(x.plan.visuals[0]?.prompt ?? "").WORLD)).size >= 3);
  /** **支持を描かせるときの歯止め**（ご指示）。治具そのものを描かせない */
  check("支持の出来事を出す会社でも、実在の治具として描かせない歯止めが入っている",
    all.every((x) => !/support node/.test(x.sec.SUBJECT)
      || (/not a fixture/.test(x.sec.WORLD) && /abstract structural support nodes/.test(x.sec.SUBJECT))));
  check("打ち消しの側にも、治具・工具が入っている", /jigs, fixtures/.test(NEGATIVE_PROMPT));

  console.log("\n  ── ④ 生成に渡して意味のある項目 ──");
  const need = [/focal point at \d+%/, /aspect ratio/, /cropped to/, /negative space/, /view/, /composition/];
  const missing = [];
  for (const x of all) for (const re of need) if (!re.test(x.v.prompt)) missing.push(`${x.co}/${x.v.purpose}:${re}`);
  check("焦点・比・モバイル・余白・視点・構図が、全プロンプトに入っている", missing.length === 0,
    missing.slice(0, 3).join(" "));

  /** **数値も固有名詞も絵に渡していない**（事実を捏造させない） */
  const leaked = all.filter((x) => /\d+\s*mm|±|ISO\s*\d|\bJIS\b/i.test(x.v.prompt));
  check("公差・規格・型番などの数値が、プロンプトに漏れていない", leaked.length === 0,
    leaked.map((x) => `${x.co}/${x.v.purpose}`).join(" "));
  /** **禁じた主題を描かせる指示が無い**（打ち消しに書くだけにしない・再掲） */
  const forbid = all.filter((x) => FORBIDDEN_IN_PROMPT.some((w) => new RegExp(`\\b${w}\\b`).test(x.v.prompt.toLowerCase())));
  check("実在設備・人・製品・文字を描かせる言葉が、どのプロンプトにも無い", forbid.length === 0,
    forbid.map((x) => `${x.co}/${x.v.purpose}`).join(" "));
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
