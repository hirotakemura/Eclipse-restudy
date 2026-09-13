/**
 * KOBO — 原稿生成の指示の試験
 *
 * **確かめたいのは「構成を知らないまま原稿を書かせていないか」。**
 *
 * 段階2までは、どのセクションがどの順で出るかを知らないまま原稿を書いていた。
 * その結果、**すぐ下に材質の札が出ているのに、原稿でも材質を並べる**が起きていた（D-193）。
 *
 * APIは叩かない。**組み立てた指示の文面そのもの**を見る。
 * 生成の質は機械では測れないが、「必要な情報が入っているか」は測れる。
 */
import fs from "node:fs";
import { decidePages } from "./lib/generate/pages.ts";
import { pagePrompt, SYSTEM_RULES, projectContext } from "./lib/generate/prompts.ts";
import { analyze } from "./lib/design/analysis.ts";
import { composeTop, composePage } from "./lib/design/sections.ts";
import { resolveTheme } from "./lib/theme.ts";

const project = JSON.parse(fs.readFileSync("fixtures/mock-manufacturing/project.json", "utf8"));
const analysis = analyze(project);
const resolved = resolveTheme(project.theme);
const pages = decidePages(project);

const layoutOf = (slug) => {
  let sections = [];
  if (slug === "index") {
    sections = composeTop(project, analysis, { hero: resolved.hero.id, direction: resolved.direction, hasProse: true });
  } else if (["strengths", "capability", "equipment"].includes(slug)) {
    sections = composePage(slug, project, analysis, { direction: resolved.direction, hasProse: true });
  }
  return sections.length ? { sections, analysis, direction: resolved.direction } : undefined;
};
const promptFor = (slug) => {
  const page = pages.find((p) => p.slug === slug);
  return page ? pagePrompt(page, project, layoutOf(slug)) : "";
};

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

console.log("\n━━━ 構成を知った状態で原稿を書かせているか ━━━");
const top = promptFor("index");
check("トップの指示に、このページの構成が入っている", top.includes("## このページの構成"));
check("セクションが順番どおりに並んでいる",
  top.indexOf("他社様で難しいと言われた案件") < top.indexOf("**あなたの文章**"), "順番がずれている");
check("自分の文章がどこに入るかが示されている", top.includes("——ここにあなたの文章が入ります——"));
check("すでに出ているものを繰り返すな、と書いてある", top.includes("文章で繰り返さないでください"));
check("この会社の見立てが入っている", top.includes("## この会社の見立て"));
check("選ばれた型が入っている", top.includes("型「精密加工」"), "型が伝わっていない");

console.log("\n━━━ 構成の無いページでは、余計なことを言わない ━━━");
const msg = promptFor("message");
check("代表挨拶には構成の節が付かない", msg !== "" && !msg.includes("## このページの構成"));

console.log("\n━━━ テンプレートが出すものを、原稿で書かせていないか ━━━");
for (const [slug, word] of [["capability", "表を書かない"], ["equipment", "表を書かない"]]) {
  check(`${slug}：表を書かせない`, promptFor(slug).includes(word));
}
check("トップ：条件の箇条書きを書かせない", top.includes("箇条書きで条件を並べない"));
check("トップ：電話番号やメールを書かせない", top.includes("電話番号やメールアドレスを書かない"));
for (const p of pages) {
  const t = pagePrompt(p, project, layoutOf(p.slug));
  if (t.includes("電話番号とメールアドレスを必ず併記")) {
    check(`${p.slug}：古い指示（電話とメールを併記）が残っていない`, false, p.slug);
  }
}
check("どのページにも、古い「電話番号とメールアドレスを必ず併記」が残っていない",
  !pages.some((p) => pagePrompt(p, project, layoutOf(p.slug)).includes("必ず併記")));

console.log("\n━━━ 社内の判断材料を書かせない（D-182）━━━");
check("共通ルールに、社内の判断材料の節がある", SYSTEM_RULES.includes("社内の判断材料を、そのまま書かない"));
for (const key of ["wantMoreOf", "wantLessOf", "mostProfitableWork", "lostDealReasons", "outlookConcern"]) {
  check(`${key} を書くなと明示している`, SYSTEM_RULES.includes(key));
}
check("案件データそのものは、これまでどおり全部渡している",
  projectContext(project).includes("wantLessOf"), "出典が減っては困る");

console.log("\n━━━ 安全装置が外れていないか ━━━");
check("出典のない数値・型番を書くなという規則が残っている", SYSTEM_RULES.includes("絶対に書かない"));
check("未確認マーカーの使い方が残っている", SYSTEM_RULES.includes("{{要確認}}"));

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
