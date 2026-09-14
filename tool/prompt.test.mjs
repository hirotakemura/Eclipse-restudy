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
import { decidePages, hasCaseMaterial } from "./lib/generate/pages.ts";
import { writerView } from "./lib/generate/writer-view.ts";
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
check("判断材料そのものは渡している（書かせないだけ）",
  projectContext(writerView(project)).includes("wantLessOf"), "見立てが立たなくなる");

/**
 * **渡さなければ、書きようがない**（D-253）。
 *
 * 指示文の禁止は守られなかった。D-170で公開テンプレートから消したはずの
 * 「人手が足りず受注を絞っている」が、**言い換えられて3ページに出た**（実測）。
 * 公開判定は同じ文字列しか見ないので、言い換えは素通りする。**前で落とす。**
 */
console.log("\n━━━ 社内向けの控えを、そもそも渡していないか（D-253）━━━");
const tempted = {
  ...project,
  recruitment: { ...(project.recruitment ?? {}), retentionNotes: "若手が続かない。人手が足りず受注を絞っている" },
  capability: {
    ...(project.capability ?? {}),
    equipment: [{ maker: "オークマ", model: "MB-46VA", count: 1, note: "銘板を現地で確認すること" }],
  },
  cases: (project.cases ?? []).map((c) => ({ ...c, confidentialityNotes: "社名は不可。業界までは可" })),
  unconfirmedNotes: { "capability.tolerance": "ミクロン単位までは可能です" },
};
const sent = projectContext(writerView(tempted));
check("若手の定着状況（社内メモ）を渡していない", !sent.includes("受注を絞っている"));
check("設備の備考（社内メモ）を渡していない", !sent.includes("銘板を現地で確認"));
check("秘密保持のメモを渡していない", !sent.includes("社名は不可"));
check("答えてもらえなかったときの発言を渡していない", !sent.includes("ミクロン単位までは可能"));
check("欄の名前ごと消えている", !sent.includes("retentionNotes") && !sent.includes("confidentialityNotes"));
check("公開してよい欄は残っている", sent.includes("MB-46VA") && sent.includes(project.basics.name));
check("何が未確認かは伝えている（項目名だけ）", sent.includes("unconfirmed"));
check("共通ルールも、発言が渡る前提の書き方をしていない",
  !SYSTEM_RULES.includes("実際に言った言葉が記録されています"));
check("渡していないことを、データの前書きで断っている",
  sent.includes("ここには入っていません"));

console.log("\n━━━ テンプレートが出すものの一覧が、共通ルールにあるか（D-255）━━━");
check("共通ルールに、テンプレートが出すものの節がある",
  SYSTEM_RULES.includes("テンプレートが出すものを、文章で書かない"));
for (const word of ["設備の名称と型番", "募集要項", "電話番号・メールアドレス"]) {
  check(`${word} を書くなと明示している`, SYSTEM_RULES.includes(word));
}

/**
 * **無い材料は、渡しても出てこない**（D-254）。
 * 出てくるのは `{{要確認}}` で埋まった原稿で、費用だけかかり、人間がそれを読まされる。
 */
console.log("\n━━━ 材料の足りない事例ページを作っていないか（D-254）━━━");
check("どう解決したかが無い事例は、ページにしない",
  !hasCaseMaterial({ title: "薄物", challenge: "他社が断った", solution: "", partDescription: "アルミ" }));
check("相談も部品も無い事例は、ページにしない",
  !hasCaseMaterial({ solution: "治具を自作した" }));
check("両方そろっていれば、ページにする",
  hasCaseMaterial({ challenge: "反りで断られた", solution: "加工順序を組み直した" }));
const thin = {
  ...project,
  cases: [
    { title: "書ける事例", challenge: "反りで断られた", solution: "治具を自作した", result: "納品" },
    { title: "書けない事例", challenge: "歪むと断られた", solution: "{{要確認}} 工場長に確認", result: "{{要確認}}" },
  ],
};
const thinSlugs = decidePages(writerView(thin)).map((p) => p.slug);
check("{{要確認}}だけの事例は、生成の対象から外れる",
  thinSlugs.includes("case-1") && !thinSlugs.includes("case-2"), thinSlugs.join(" "));
check("番号は詰めない（事例1件目はcase-1のまま）", thinSlugs.includes("case-1"));

console.log("\n━━━ 安全装置が外れていないか ━━━");
check("出典のない数値・型番を書くなという規則が残っている", SYSTEM_RULES.includes("絶対に書かない"));
check("未確認マーカーの使い方が残っている", SYSTEM_RULES.includes("{{要確認}}"));

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
