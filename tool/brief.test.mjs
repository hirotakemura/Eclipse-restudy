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
import { ruleBrief, sameDecision } from "./lib/design/brief-rules.ts";
import { decideBrief, checkAIResponse } from "./lib/design/brief-ai.ts";
import { userPrompt, SYSTEM } from "./lib/design/brief-prompt.ts";
import { usablePresentations } from "./lib/design/system/index.ts";
import { materialsOf } from "./lib/design/materials.ts";

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
const quiet = () => {};

console.log("\n━━━ 規則版の Brief は、いまの判断をそのまま写したものか ━━━");
for (const f of FIXTURES) {
  const { project, a, ctx, rules } = setup(f);
  const without = composeTop(project, a, ctx);
  const with_ = composeTop(project, a, { ...ctx, brief: rules });
  check(`${f}：規則版の Brief を渡しても出力が変わらない`,
    JSON.stringify(bands(without)) === JSON.stringify(bands(with_)),
    `${bands(without).join(",")}\n      → ${bands(with_).join(",")}`);
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

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
