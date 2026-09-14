/**
 * KOBO — AI版 Design Brief の試験
 *
 * **APIは叩かない。** 作り物の応答を食わせて、
 * **検査が効くか・安全に規則版へ戻るか・判断が本当に画面へ届くか**だけを見る。
 *
 * ここで確かめたいのは「AIが賢いか」ではない。
 * **AIが変なことを言ったときに、こちらが壊れないか**である。
 */
import fs from "node:fs";
import path from "node:path";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { resolveTheme } from "./lib/theme.ts";
import { composeTop, composePage, traceOf } from "./lib/design/sections.ts";
import { ruleBrief, sameDecision, describeDiff } from "./lib/design/brief-rules.ts";
import { decideBrief, checkAIResponse } from "./lib/design/brief-ai.ts";
import { userPrompt, SYSTEM } from "./lib/design/brief-prompt.ts";
import { usablePresentations, keepsLess } from "./lib/design/system/index.ts";
import { materialsOf } from "./lib/design/materials.ts";
import { projectHashOf } from "./lib/design/brief.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

/** Visual QA 専用の架空データ。**実案件には使わない** */
const load = (f) => sanitizeProject(JSON.parse(fs.readFileSync(path.join("fixtures", "design-diversity", `${f}.json`), "utf8")));
const FIXTURES = ["a-precision", "b-difficulty", "c-speed"];
const setup = (f) => {
  const project = load(f);
  const a = analyze(project);
  const r = resolveTheme(project.theme, "manufacturing");
  const ctx = { hero: r.hero.id, direction: r.direction, hasProse: false };
  return { project, a, ctx, rules: ruleBrief(project, a, ctx) };
};
const bands = (sections) =>
  sections.filter((s) => s.kind !== "hero").map((s) => `${s.content}:${s.presentation}`);
/** **強さまで含めて**比べる。見落としの元になった（下の回帰試験） */
const full = (sections) =>
  sections.map((s) => `${s.kind}:${s.content}:${s.presentation}:${s.emphasis}:${s.decidedBy ?? "-"}`).join(" ／ ");
/** 全ページ。トップだけ見ていると、下層で起きたずれに気づけない */
const allPages = (project, a, ctx, brief) => ({
  index: composeTop(project, a, { ...ctx, brief }),
  strengths: composePage("strengths", project, a, { direction: ctx.direction }),
  capability: composePage("capability", project, a, { direction: ctx.direction }),
  equipment: composePage("equipment", project, a, { direction: ctx.direction }),
});
const quiet = () => {};

console.log("\n━━━ 規則版の Brief は、いまの判断をそのまま写したものか ━━━");
for (const f of FIXTURES) {
  const { project, a, ctx, rules } = setup(f);
  const without = allPages(project, a, ctx, undefined);
  const with_ = allPages(project, a, ctx, rules);
  for (const page of Object.keys(without)) {
    check(`${f} / ${page}：規則版の Brief を渡しても、強さまで含めて1文字も変わらない`,
      full(without[page]) === full(with_[page]),
      `基準：${full(without[page])}\n      現在：${full(with_[page])}`);
  }
  check(`${f}：強みは見立てのものをそのまま持つ（AIが推測で作らない）`,
    rules.primaryStrength === a.primaryStrength && rules.secondaryStrength === a.secondaryStrength);
  check(`${f}：印は保存するときに付ける（判断そのものには付けない）`, rules.sourceProjectHash === undefined);
}

console.log("\n━━━ AIに渡すもの ━━━");
{
  const { project, a, rules } = setup("b-difficulty");
  const p = userPrompt(project, a, rules);
  check("案件データそのもの（会社名・住所・電話）を渡していない",
    !p.includes(project.basics.name) && !p.includes(project.basics.tel ?? "＠") && !p.includes(project.basics.address ?? "＠"));
  check("選べる表現の一覧を渡している", p.includes("選べる表現"));
  check("強みの候補を渡している", p.includes("precision / difficulty / speed"));
  check("強さは3段だけを示している（support は無い）",
    SYSTEM.includes("lead / normal / quiet") && !SYSTEM.includes("support") && !p.includes("support"));
  check("返す形をJSONひとつに限っている",
    SYSTEM.includes("JSONひとつだけ") && SYSTEM.includes("HTMLやCSSを書くこと"));
  check("文章も数字も書かせない", SYSTEM.includes("文章を書くこと") && SYSTEM.includes("数字を言い直すこと"));
}

console.log("\n━━━ 4段検査：AIの不適切な判断が止まるか ━━━");
{
  const { project, a, rules } = setup("a-precision");
  const base = {
    primaryStrength: rules.primaryStrength,
    secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => ({ ...b })),
  };
  const res = (o) => checkAIResponse(typeof o === "string" ? o : JSON.stringify(o), project, a, rules);

  check("そのままなら通る", res(base).problems.length === 0, JSON.stringify(res(base).problems));
  check("```json で包まれていても読める", res("```json\n" + JSON.stringify(base) + "\n```").problems.length === 0);

  check("1段：JSONでなければ落ちる", res("すみません、できません").problems[0]?.stage === "form");
  check("1段：HTMLを返してきたら落ちる",
    res({ ...base, html: "<section>…</section>" }).problems.some((p) => p.stage === "form" && p.where === "html"));
  check("1段：出所を偽らせない（source を返しても落ちる）",
    res({ ...base, source: "rules" }).problems.some((p) => p.stage === "form"));
  check("1段：情報を削ったら落ちる（D-204）",
    res({ ...base, blocks: base.blocks.slice(1) }).problems.some((p) => p.stage === "form" && /消えています/.test(p.message)));

  check("2段：語彙にない表現を発明したら落ちる",
    res({ ...base, blocks: [{ ...base.blocks[0], presentation: "carousel" }, ...base.blocks.slice(1)] })
      .problems.some((p) => p.stage === "vocabulary"));
  check("2段：強さを4段目にしたら落ちる（support は無い）",
    res({ ...base, blocks: [{ ...base.blocks[0], emphasis: "support" }, ...base.blocks.slice(1)] })
      .problems.some((p) => p.stage === "vocabulary"));
  check("2段：推測の強みを作ったら落ちる",
    res({ ...base, primaryStrength: "とても丁寧" }).problems.some((p) => p.stage === "vocabulary"));

  const conditions = base.blocks.find((b) => b.content === "conditions");
  check("3段：可否表にない組み合わせは落ちる",
    res({ ...base, blocks: base.blocks.map((b) => b.content === "conditions" ? { ...b, presentation: "timeline" } : b) })
      .problems.some((p) => p.stage === "compatibility"), JSON.stringify(conditions));
  check("4段：材料のない表現は落ちる",
    res({ ...base, blocks: base.blocks.map((b) => b.content === "history" ? { ...b, presentation: "timeline" } : b) })
      .problems.some((p) => p.stage === "material") || !base.blocks.some((b) => b.content === "history"));
}

console.log("\n━━━ 落ちたら安全に規則版へ戻るか（止まらないか）━━━");
{
  const { project, a, ctx, rules } = setup("a-precision");
  const run = (ask) => decideBrief(project, a, ctx, { useAI: true, ask, onProgress: quiet });

  const broken = await run(async () => "これは JSON ではありません");
  check("壊れた応答でも例外を投げない", broken.source === "ai-fallback");
  check("壊れた応答でも Brief は返る（生成が止まらない）", broken.blocks.length === rules.blocks.length);
  check("落ちた理由が残る", broken.problems.length > 0);

  const dead = await run(async () => { const e = new Error("connect ECONNREFUSED"); throw e; });
  check("通信が切れても止まらない", dead.source === "ai-fallback" && dead.blocks.length > 0);
  const limited = await run(async () => { const e = new Error("rate"); e.status = 429; throw e; });
  check("429 でも止まらない", limited.source === "ai-fallback" && limited.problems[0]?.message === "API 429");

  const none = await decideBrief(project, a, ctx, { useAI: false, onProgress: quiet });
  check("AIを使わないときは規則版（実案件の既定）", none.source === "rules" && none.agreedWithRules === true);
  check("AIを使わないとき、判断は規則版と完全に一致", sameDecision(none, rules));
}

console.log("\n━━━ AIの判断が、本当に画面へ届くか ━━━");
{
  const { project, a, ctx, rules } = setup("a-precision");
  /**
   * **材料のある中から、規則版とは違う表現をAIが選んだ場合。**
   * 架空データに合わせて機械的に選ぶ（材料の無いものを選ぶと、それはただの検査落ち）。
   */
  const target = rules.blocks
    // 条件の帯は「最初の画面と同じ形を繰り返さない」規則が別にかかる。下で別に確かめる
    .filter((b) => b.content !== "conditions")
    .map((b) => ({ b, usable: usablePresentations(b.content, materialsOf(project, b.content, a.hasRealPhotos)) }))
    .find((x) => x.usable.some((p) => p !== x.b.presentation));
  const swapTo = target.usable.find((p) => p !== target.b.presentation);
  const asked = {
    primaryStrength: rules.primaryStrength,
    secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => b.content === target.b.content ? { ...b, presentation: swapTo } : { ...b }),
  };
  const brief = await decideBrief(project, a, ctx, { useAI: true, ask: async () => JSON.stringify(asked), onProgress: quiet });
  const before = composeTop(project, a, ctx);
  const after = composeTop(project, a, { ...ctx, brief });
  const band = after.find((s) => s.content === target.b.content);
  const bandBefore = before.find((s) => s.content === target.b.content);

  check("AIの判断が採用される", brief.source === "ai" && brief.agreedWithRules === false);
  check("採用された判断が、実際のセクションに出ている",
    band?.presentation === swapTo, `${bandBefore?.presentation} → ${band?.presentation}（求めたのは ${swapTo}）`);
  check("誰が決めたかが帯に残る", band?.decidedBy === "ai");
  check("規則版なら何を選んだかも残る", band?.ruleChoice?.presentation === bandBefore?.presentation);

  const trace = traceOf(after);
  const t = trace.find((x) => x.content === target.b.content);
  check("来歴に「規則版・AI版・最終・出所」が揃う",
    t && t.rules.presentation === bandBefore.presentation && t.ai?.presentation === swapTo
    && t.final.presentation === swapTo && t.source === "ai",
    JSON.stringify(t));
  check("変えていない帯は規則版のまま（AIが余計な変更をしない）",
    trace.filter((x) => x.source !== "rules").length === 1, JSON.stringify(trace.map((x) => `${x.content}:${x.source}`)));
  check("採用された判断でも、下層ページは規則版のまま（ページごとの筋を壊さない）",
    ["strengths", "capability", "equipment"].every((page) =>
      full(composePage(page, project, a, { direction: ctx.direction }))
      === full(allPages(project, a, ctx, brief)[page])));
  check("全部そのままなら、画面はAIを使う前と1文字も変わらない",
    JSON.stringify(bands(composeTop(project, a, { ...ctx, brief: rules }))) === JSON.stringify(bands(before)));

  /** 情報は減らせない。**Brief から消しても、帯そのものは規則版が出す**（D-204） */
  const thinned = await decideBrief(project, a, ctx, {
    useAI: true, onProgress: quiet,
    ask: async () => JSON.stringify({ ...asked, blocks: asked.blocks.filter((b) => b.content !== "materials") }),
  });
  const thin = composeTop(project, a, { ...ctx, brief: thinned });
  check("内容を削った Brief は検査で落ちる", thinned.source === "ai-fallback");
  check("それでも帯は1つも減っていない（D-204）",
    bands(thin).length === bands(before).length, `${bands(before).join(",")}\n      → ${bands(thin).join(",")}`);

  /**
   * **最初の画面と同じ形を、すぐ下で繰り返さない規則は、AIより強い**（D-183）。
   * 大きな数字の最初の画面を出している会社で、条件の帯まで大きな数字にはさせない。
   */
  if (ctx.hero === "figure" || a.heroFigure) {
    const forceBig = {
      ...rules,
      blocks: rules.blocks.map((b) => b.content === "conditions" ? { ...b, presentation: "largeNumber" } : b),
    };
    const top = composeTop(project, a, { ...ctx, brief: forceBig });
    const cond = top.find((s) => s.content === "conditions");
    check("最初の画面が数字なら、AIが指定しても条件の帯は数字にならない（D-183）",
      cond?.presentation !== "largeNumber", `${cond?.presentation}`);
  }

  /**
   * **描く直前の2重の関所。**
   * 検査を通った Brief を後から書き換えても（人が手で直した場合も含む）、
   * 材料の無い表現は画面に出ない。
   */
  const tampered = {
    ...rules,
    blocks: rules.blocks.map((b) => b.content === "cases" ? { ...b, presentation: "quote" } : b),
  };
  const drawn = composeTop(project, a, { ...ctx, brief: tampered });
  const forcedBand = drawn.find((s) => s.content === "cases");
  const casesMaterials = materialsOf(project, "cases", a.hasRealPhotos);
  check("材料の無い表現を後から差し込んでも、画面には出ない（2重の関所）",
    casesMaterials.hasQuote || (forcedBand?.presentation !== "quote" && forcedBand?.decidedBy === "ai-fallback"),
    `${forcedBand?.presentation} / ${forcedBand?.decidedBy}`);
  check("そのときも帯は消えない（D-204）", Boolean(forcedBand));
}

console.log("\n━━━ AIを採用しなかったときは、AI OFF と1文字も変わらない ━━━");
for (const f of FIXTURES) {
  const { project, a, ctx, rules } = setup(f);
  const off = allPages(project, a, ctx, undefined);
  /**
   * **APIが落ちたとき（ai-fallback）の中身は規則版そのもの。**
   * それを渡して出力が変われば、「AIを切れば同じHTML」が嘘になる。
   * 実際に401で落ちた案件の強み・設備ページが変わり、`ai` の印まで付いた。
   */
  for (const source of ["rules", "ai-fallback"]) {
    const brief = { ...rules, source, agreedWithRules: true, problems: [], generatedAt: "" };
    const on = allPages(project, a, ctx, brief);
    const bad = Object.keys(off).filter((page) => full(off[page]) !== full(on[page]));
    check(`${f}：source=${source} の Brief を渡しても、全ページ同じ`,
      bad.length === 0,
      bad.map((page) => `${page}\n        基準：${full(off[page])}\n        現在：${full(on[page])}`).join("\n      "));
  }
}

console.log("\n━━━ 情報が落ちないか（D-204）━━━");
{
  /** 型番が2台しか分かっていない8台の会社で、**一覧表が数字に置き換わらない** */
  const many = { ...load("a-precision") };
  many.capability = {
    ...many.capability,
    equipment: [
      { maker: "アマダ", model: "HFE3", count: 1 },
      { maker: "オークマ", model: "LB3000", count: 1 },
      ...Array.from({ length: 6 }, (_, i) => ({ maker: "", model: `旋盤${i + 1}`, count: 1 })),
    ],
  };
  const a2 = analyze(many);
  const secs = composePage("equipment", many, a2, { direction: "technical" });
  const list = secs.filter((s) => s.content === "equipment");
  check("型番が揃っていなくても、保有設備一覧は表のまま",
    list.some((s) => s.presentation === "spec"),
    list.map((s) => `${s.heading}:${s.presentation}`).join(", "));
}

console.log("\n━━━ 同じ内容を、同じページで2度同じ形にしない ━━━");
for (const f of FIXTURES) {
  const { project, a, ctx } = setup(f);
  for (const slug of ["capability", "equipment", "strengths"]) {
    const secs = composePage(slug, project, a, { direction: ctx.direction });
    const pairs = secs.map((s) => `${s.content}:${s.presentation}`);
    check(`${f} / ${slug}：同じ内容が同じ形で重なっていない`,
      new Set(pairs).size === pairs.length, pairs.join(", "));
  }
}


/**
 * **提案と採用を分ける**（D-256）。
 *
 * 4段検査は妥当性を見ていない（D-249）。実測でも、精度が強みの会社で
 * 「精度の物証である三次元測定機を目立たなくする」という判断が検査を素通りした。
 * **止める仕組みは人の目しかない**のだから、目を通る場所が要る。
 * `--ai` は提案を置くだけで、`--adopt` するまでサイトには効かない。
 */
console.log("\n━━━ AI版は、採用するまで効かないか（D-256）━━━");
{
  const { writeBrief } = await import("./brief.mjs");
  const dir = path.join("projects", "zz-brief-flow");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "project.json");
  const raw = JSON.parse(fs.readFileSync(path.join("fixtures", "design-diversity", "a-precision.json"), "utf8"));
  raw.id = "zz-brief-flow";
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

  const { project, a, ctx } = setup("a-precision");
  const rulesBrief = ruleBrief(project, a, ctx);
  /** 実測で外した判断そのもの：**精度の物証（設備）を目立たなくする** */
  const proposal = {
    primaryStrength: rulesBrief.primaryStrength,
    secondaryStrength: rulesBrief.secondaryStrength,
    blocks: rulesBrief.blocks.map((b) => b.content === "equipment" ? { ...b, emphasis: "quiet" } : { ...b }),
  };
  const ask = async () => JSON.stringify(proposal);

  await writeBrief(read(), file, { useAI: false, onProgress: quiet });
  const afterRules = read();
  check("規則版は、これまでどおりその場で採用される", afterRules.designBrief?.source === "rules");

  await writeBrief(read(), file, { useAI: true, ask, onProgress: quiet });
  const afterAI = read();
  check("AI版は提案として別に保存される", afterAI.designBriefProposal?.source === "ai");
  check("採用されている判断は、まだ規則版のまま", afterAI.designBrief?.source === "rules");
  check("提案は、実際にAIが言った内容になっている",
    afterAI.designBriefProposal.blocks.find((b) => b.content === "equipment")?.emphasis === "quiet");
  check("提案を保存しても、画面は1文字も変わらない",
    JSON.stringify(bands(composeTop(project, a, { ...ctx, brief: afterAI.designBrief })))
    === JSON.stringify(bands(composeTop(project, a, ctx))));

  /** **提案を保存したせいで「案件データが変わりました」と言わない** */
  check("提案を保存しても、案件データの印は変わらない",
    projectHashOf(afterAI) === projectHashOf(afterRules));
  check("採用されている判断の印が、いまの案件データと合っている",
    afterAI.designBrief.sourceProjectHash === projectHashOf(afterAI));

  const returned = await writeBrief(read(), file, { useAI: true, ask, onProgress: quiet });
  check("呼んだ側に返るのは、採用されている判断のほう", returned.source === "rules");

  await writeBrief(read(), file, { adopt: true, onProgress: quiet });
  const adopted = read();
  check("--adopt で、提案が採用される", adopted.designBrief?.source === "ai");
  check("採用したら、画面にも効く",
    composeTop(project, a, { ...ctx, brief: adopted.designBrief })
      .find((s) => s.content === "equipment")?.emphasis === "quiet");

  /** **人が見たものと、採用されるものがずれない** */
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  await writeBrief(read(), file, { useAI: true, ask, onProgress: quiet });
  const stale = read();
  stale.basics = { ...stale.basics, employees: 999 };  // 取材の追加。見せ方の前提が変わる
  fs.writeFileSync(file, JSON.stringify(stale, null, 2));
  await writeBrief(read(), file, { adopt: true, onProgress: quiet });
  check("案件データが変わった後の古い提案は、採用されない", read().designBrief?.source !== "ai");

  /** **差の説明が、目立たなくなる帯を指さす**（人が見る手がかり） */
  const diff = describeDiff(rulesBrief, proposal);
  check("規則版との差だけが出る（同じ行は出さない）", diff.length === 1, diff.join(" / "));
  check("目立たなくなることが、はっきり書かれている",
    diff[0].includes("equipment") && diff[0].includes("目立たなくなります"), diff[0]);

  fs.rmSync(dir, { recursive: true, force: true });
}


/**
 * **情報の少ない表現への乗り換えを止める**（D-259）。
 *
 * 3社の実測で、AIが変えた5箇所は**5箇所とも情報の少ないほうへの乗り換え**だった。
 * 多いほうへ動いたものは1つも無い。そして4段検査は全部「問題なし」で通した。
 * 可否も材料も、確かに満たしていたからである。
 */
console.log("\n━━━ 情報が減る乗り換えを止めるか（D-259）━━━");
{
  const { project, a, ctx } = setup("a-precision");
  const rules = ruleBrief(project, a, ctx);
  const swap = (content, presentation) => ({
    primaryStrength: rules.primaryStrength,
    secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => b.content === content ? { ...b, presentation } : { ...b }),
  });
  const run = (ai) => checkAIResponse(JSON.stringify(ai), project, a, rules);

  check("規則版が設備をカードの格子にしている（前提）",
    rules.blocks.find((b) => b.content === "equipment")?.presentation === "cardGrid");

  /** 実測でそのまま画面に出た乗り換え。メーカー名と一覧への導線が消えた */
  const toList = run(swap("equipment", "list"));
  check("設備を箇条書きに落とす判断は、検査で落ちる", toList.brief === null);
  check("落ちた理由が「情報量」だと分かる",
    toList.problems.some((p) => p.stage === "information" && p.message.includes("少なくなります")),
    JSON.stringify(toList.problems));

  /** 実測でB社が返した判断。画面に出ていたら「保有設備 7台」の1語になっていた */
  const toBig = run(swap("equipment", "largeNumber"));
  check("設備を大きな数字に潰す判断も、検査で落ちる", toBig.brief === null);

  /** お客様の言葉：カードの格子は3項目、引用は1発言 */
  const toQuote = run(swap("praise", "quote"));
  check("お客様の言葉を引用1つに絞る判断も、検査で落ちる", toQuote.brief === null);

  /**
   * **減らないほうは通す。** 禁止したいのは「減ること」であって「変えること」ではない。
   * 材料のある表現の中から、情報が減らないものを探して試す
   * （`spec` は3行以上が要るので、決め打ちにすると材料の段で落ちる）。
   */
  const richer = rules.blocks
    .map((b) => ({
      b,
      to: usablePresentations(b.content, materialsOf(project, b.content, a.hasRealPhotos))
        .find((pp) => pp !== b.presentation && !keepsLess(b.presentation, pp)),
    }))
    .find((x) => x.to);
  check("情報が減らない乗り換えが、この会社にも1つはある", Boolean(richer),
    "見つからなければ、この確認は意味をなさない");
  if (richer) {
    const up = run(swap(richer.b.content, richer.to));
    check(`情報が減らない乗り換えは、通る（${richer.b.content}：${richer.b.presentation} → ${richer.to}）`,
      up.brief !== null, JSON.stringify(up.problems));
  }

  /** **強さは制限しない。** 何を主役にするかはAIの仕事である */
  const quieter = run({
    primaryStrength: rules.primaryStrength, secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => b.content === "equipment" ? { ...b, emphasis: "quiet" } : { ...b }),
  });
  check("強さを下げるだけなら、通る", quieter.brief !== null, JSON.stringify(quieter.problems));

  check("同じ表現のままなら、当然通る", run(swap("equipment", "cardGrid")).brief !== null);
}

/**
 * **効かない場所を判断させない**（D-260）。
 * Brief が効くのはトップページだけ（D-225）。実測では、AIが変えた5箇所のうち
 * **4箇所が、そもそも画面に出ない下層ページの帯**だった。
 */
console.log("\n━━━ どれがトップに出るかを、AIに伝えているか（D-260）━━━");
{
  const { project, a, ctx } = setup("a-precision");
  const rules = ruleBrief(project, a, ctx);
  const onTop = new Set(composeTop(project, a, ctx).filter((s) => s.kind !== "hero").map((s) => s.content));
  const text = userPrompt(project, a, rules, onTop);

  check("トップに出ない内容が、たたき台に混ざっている（前提）",
    rules.blocks.some((b) => !onTop.has(b.content)),
    rules.blocks.map((b) => b.content).join(" "));
  check("トップに出る内容に、その印がある", text.includes("【トップページに出ます】"));
  check("トップに出ない内容に、その印がある", text.includes("【下層ページのみ】"));
  check("下層は触らなくてよいと伝えている", text.includes("画面には出ません"));
  check("内容の一覧からは外していない（D-224の理由を守る）",
    rules.blocks.every((b) => text.includes(`### ${b.content}`)));
  check("情報が減る乗り換えは落ちる、と先に伝えている",
    text.includes("画面に出る情報が減る乗り換えは、検査で落ちます"));
  check("強さは下げてよい、と断っている", text.includes("強さ（emphasis）を下げるのは構いません"));
  check("印を渡さなければ、これまでどおりの文面",
    !userPrompt(project, a, rules).includes("【トップページに出ます】"));
}


/**
 * **規則版が描けているものを、検査が「描けない」と言ってはいけない**（D-262）。
 *
 * 実測で、B社は保有設備の行が1行しかなく `hasMaterial("spec")` の3行以上を満たさない。
 * ところが**画面には保有設備一覧がちゃんと出ている。**
 * その結果、**AIが規則版とまったく同じ判断を返しても検査で落ちる**会社ができていた。
 * AIは最初から勝てない試験を受けていた。
 */
console.log("\n━━━ AIが規則版と同じ答えを返したら、必ず通るか（D-262）━━━");
for (const f of FIXTURES) {
  const { project, a, ctx } = setup(f);
  const rules = ruleBrief(project, a, ctx);
  const echo = JSON.stringify({
    primaryStrength: rules.primaryStrength,
    secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => ({ content: b.content, presentation: b.presentation, emphasis: b.emphasis })),
  });
  const { brief, problems } = checkAIResponse(echo, project, a, rules);
  check(`${f}：規則版と同じ答えが、検査を通る`, brief !== null,
    problems.map((p) => `${p.stage} ${p.message}`).join(" / "));
}
{
  /** **緩めすぎていないか。** 規則版が描いていない組は、いままでどおり落ちる */
  const { project, a, ctx } = setup("b-difficulty");
  const rules = ruleBrief(project, a, ctx);
  /** B社の設備は、型番の分かっているものが0件。カードの格子は2件以上が要る */
  const bad = JSON.stringify({
    primaryStrength: rules.primaryStrength, secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => b.content === "equipment" ? { ...b, presentation: "cardGrid" } : { ...b }),
  });
  const r = checkAIResponse(bad, project, a, rules);
  check("規則版が描いていない組は、材料が無ければ落ちたまま",
    r.brief === null && r.problems.some((p) => p.stage === "material"),
    JSON.stringify(r.problems));
}

/**
 * **訊いておいて捨てない**（D-263）。
 *
 * `blocks` は前から順に「先に見せるもの」と定義してあり、AIへの指示にもそう書いてある。
 * ところが `composeTop` はこれを一度も読んでいなかった。
 * 実測で、AIが「技術の説明を2番目に上げる」と返したのに画面は1文字も動かなかった。
 */
console.log("\n━━━ Brief の並び順が、画面に効くか（D-263）━━━");
{
  const { project, a, ctx } = setup("a-precision");
  const rules = ruleBrief(project, a, ctx);
  const before = bands(composeTop(project, a, ctx));
  const order = (list) => list.map((x) => x.split(":")[0]);

  /** 規則版で最後に出ている帯を、Brief で先頭のほうへ動かす */
  const last = order(before).at(-1);
  const moved = {
    ...rules,
    blocks: [rules.blocks.find((b) => b.content === last), ...rules.blocks.filter((b) => b.content !== last)],
  };
  const after = bands(composeTop(project, a, { ...ctx, brief: { ...moved, source: "ai" } }));

  check("動かす前は、その帯が最後に出ている（前提）", order(before).at(-1) === last, before.join(" "));
  check("Brief で前に出した帯が、画面でも前に来る",
    order(after).indexOf(last) < order(before).indexOf(last),
    `${before.join(" ")}\n      → ${after.join(" ")}`);
  check("帯は1つも増えても減ってもいない（D-204）",
    after.length === before.length && new Set(order(after)).size === new Set(order(before)).size,
    `${before.length} → ${after.length}`);
  check("最初の画面（hero）は動かない",
    composeTop(project, a, { ...ctx, brief: { ...moved, source: "ai" } })[0]?.kind === "hero");

  /** **採用していない判断では、並び順も効かない**（D-256と同じ筋） */
  const notAdopted = bands(composeTop(project, a, { ...ctx, brief: { ...moved, source: "ai-fallback" } }));
  check("採用されていない Brief の並び順は、効かない",
    JSON.stringify(notAdopted) === JSON.stringify(before), notAdopted.join(" "));

  /** **規則版の Brief を渡しても、画面は変わらない**（これまでどおり） */
  const same = bands(composeTop(project, a, { ...ctx, brief: { ...rules, source: "ai" } }));
  check("規則版と同じ並びなら、画面は1文字も変わらない",
    JSON.stringify(same) === JSON.stringify(before), same.join(" "));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
