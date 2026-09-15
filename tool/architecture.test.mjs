/**
 * KOBO — サイトの骨格（Company Site Plan）の試験
 *
 * **確かめたいのは「ページ数が変わったか」ではない**（ご指示）。
 *
 *   ① コアページが、どんな勝ち筋でも落ちないこと
 *   ② URLが勝ち筋で変わらないこと（変わると再生成のたびに検索順位が動く）
 *   ③ **同じ案件から必ず同じ骨格が出ること**
 *   ④ **会社の勝ち筋が、実際に導線へ出ていること**
 *   ⑤ 目的（集客／選別）と、来てほしくない問い合わせが効いていること
 *   ⑥ 厚みが水増しになっていないこと
 */
import fs from "node:fs";
import { analyze } from "./lib/design/analysis.ts";
import { composeSite, navOf, pageOf } from "./lib/design/architecture.ts";
import { composePage, composeTop } from "./lib/design/sections.ts";
import { CORE, ROLES, ROLE_OF } from "./lib/design/system/index.ts";
import { ARCHITECTURE, PLAYBOOK } from "./lib/design/playbook.ts";
import { PRIMARY_STRENGTHS } from "./lib/design/analysis.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

const FIXTURES = [
  ["A 精度", "fixtures/design-diversity/a-precision.json"],
  ["B 難加工", "fixtures/design-diversity/b-difficulty.json"],
  ["C 短納期", "fixtures/design-diversity/c-speed.json"],
  ["汎用A", "fixtures/visual-general/g-a-service.json"],
  ["汎用B", "fixtures/visual-general/g-b-brand.json"],
  ["汎用C", "fixtures/visual-general/g-c-people.json"],
];
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const plan = (p) => composeSite(p, analyze(p));
const ids = (pl) => pl.pages.map((x) => x.id);
const labels = (pl) => navOf(pl).map((x) => x.label);

console.log("\n━━━ コアページは落ちない ━━━");
{
  /**
   * **勝ち筋を全部当てて確かめる。** 実データに出てくる強みだけでは足りない
   * （15種のうち実案件で出るのは数種で、残りは一度も通っていない）。
   */
  let missing = [];
  for (const [name, f] of FIXTURES) {
    const p = load(f);
    const a0 = analyze(p);
    for (const st of PRIMARY_STRENGTHS) {
      const pl = composeSite(p, { ...a0, primaryStrength: st });
      for (const core of CORE[pl.formSet]) {
        if (!ids(pl).includes(core)) missing.push(`${name}/${st}/${core}`);
      }
    }
  }
  check("全6社 × 全15勝ち筋で、コアページが1枚も落ちない", missing.length === 0, missing.slice(0, 5).join(" "));

  /** コアページは `presence: "core"` として出る。**理由も残っている** */
  const pl = plan(load(FIXTURES[0][1]));
  check("コアページは core と記録されている",
    CORE.manufacturing.every((id) => pageOf(pl, id)?.presence === "core"));
  check("すべてのページに理由がある", pl.pages.every((x) => x.why.length > 0));

  /**
   * **落とす経路そのものを作っていない。**
   * 条件を書けば落とせる、という構造にしておくと、いつか誰かが書く。
   */
  const src = fs.readFileSync("lib/design/architecture.ts", "utf8");
  check("コアページに条件が書かれていない",
    /\["index", true,/.test(src) && /\["company", true,/.test(src) && /\["contact", true,/.test(src));
}

console.log("\n━━━ URLは勝ち筋で変わらない ━━━");
{
  let moved = [];
  for (const [name, f] of FIXTURES) {
    const p = load(f);
    const a0 = analyze(p);
    const base = [...new Set(composeSite(p, a0).pages.map((x) => x.href))].sort().join(",");
    for (const st of PRIMARY_STRENGTHS) {
      const got = [...new Set(composeSite(p, { ...a0, primaryStrength: st }).pages.map((x) => x.href))].sort().join(",");
      if (got !== base) moved.push(`${name}/${st}`);
    }
  }
  check("勝ち筋を変えても、URLの集合が変わらない", moved.length === 0, moved.slice(0, 5).join(" "));
}

console.log("\n━━━ 同じ案件から、同じ骨格が出る ━━━");
{
  let differ = [];
  for (const [name, f] of FIXTURES) {
    const p = load(f);
    const a = JSON.stringify(plan(p));
    const b = JSON.stringify(plan(JSON.parse(fs.readFileSync(f, "utf8"))));
    if (a !== b) differ.push(name);
  }
  check("2回組んで、骨格が完全に一致する", differ.length === 0, differ.join(" "));
  /** **乱数も時刻も使っていない。** 「使っていない」は放っておくと崩れる */
  for (const f of ["lib/design/architecture.ts", "lib/design/system/page.ts"]) {
    const t = fs.readFileSync(f, "utf8");
    check(`${f.split("/").pop()} に乱数も時刻も無い`, !/Math\.random|new Date|Date\.now/.test(t));
  }
  /** **AI Brief に依存していない**（ご指示・D-304と同じ形） */
  check("骨格は AI Brief を引数に取らない",
    !/brief/i.test(fs.readFileSync("lib/design/architecture.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
}

console.log("\n━━━ 入口と問い合わせは動かない ━━━");
{
  let bad = [];
  for (const [name, f] of FIXTURES) {
    const p = load(f);
    const a0 = analyze(p);
    for (const st of PRIMARY_STRENGTHS) {
      const nav = navOf(composeSite(p, { ...a0, primaryStrength: st }));
      if (nav[0]?.id !== "index") bad.push(`${name}/${st} 先頭=${nav[0]?.id}`);
      if (nav[nav.length - 1]?.id !== "contact") bad.push(`${name}/${st} 末尾=${nav[nav.length - 1]?.id}`);
    }
  }
  check("どの勝ち筋でも、先頭はトップ・末尾はお問い合わせ", bad.length === 0, bad.slice(0, 4).join(" "));
}

console.log("\n━━━ 勝ち筋が導線に出ているか（最重要）━━━");
{
  const A = plan(load(FIXTURES[0][1]));
  const B = plan(load(FIXTURES[1][1]));
  const C = plan(load(FIXTURES[2][1]));
  const pos = (pl, id) => navOf(pl).findIndex((x) => x.id === id);

  console.log(`      A 精度　 ${labels(A).join(" → ")}`);
  console.log(`      B 難加工 ${labels(B).join(" → ")}`);
  console.log(`      C 短納期 ${labels(C).join(" → ")}`);

  /** **3社の導線が、実際に違うこと。** 同じなら、この段をやった意味が無い */
  const three = new Set([labels(A).join(), labels(B).join(), labels(C).join()]);
  check("A/B/C の導線が、3通りとも違う", three.size === 3, `${three.size}通り`);

  /** A 精度：**受けられる条件**（対応可能範囲）が、事例より前 */
  check("A 精度：対応可能範囲が加工事例より前", pos(A, "capability") < pos(A, "cases"),
    `対応可能範囲=${pos(A, "capability")} 加工事例=${pos(A, "cases")}`);
  check("A 精度：対応可能範囲を厚くしている", pageOf(A, "capability")?.depth === "thick");

  /** B 難加工：**事例**が、対応可能範囲より前 */
  check("B 難加工：加工事例が対応可能範囲より前", pos(B, "cases") < pos(B, "capability"),
    `加工事例=${pos(B, "cases")} 対応可能範囲=${pos(B, "capability")}`);
  check("B 難加工：加工事例を厚くしている", pageOf(B, "cases")?.depth === "thick");

  /** C 短納期：**回せる体制**（設備）が、対応可能範囲より前 */
  check("C 短納期：設備一覧が対応可能範囲より前", pos(C, "equipment") < pos(C, "capability"),
    `設備一覧=${pos(C, "equipment")} 対応可能範囲=${pos(C, "capability")}`);
  check("C 短納期：設備一覧を厚くしている", pageOf(C, "equipment")?.depth === "thick");

  /** **厚くしたページは、実際に帯が増えていること**（表だけ変わって画面が変わらない、を防ぐ） */
  for (const [nm, pl, id] of [["A", A, "capability"], ["B", B, "cases"], ["C", C, "equipment"]]) {
    const p = load(FIXTURES[{ A: 0, B: 1, C: 2 }[nm]][1]);
    const a = analyze(p);
    const std = composePage(id, p, a, { depth: "standard" }).length;
    const thick = composePage(id, p, a, { depth: "thick" }).length;
    check(`${nm}：${id} が厚くすると帯が増える`, thick > std, `${std} → ${thick}`);
  }
}

console.log("\n━━━ 目的・受けたい仕事・避けたい仕事 ━━━");
{
  const base = load(FIXTURES[0][1]);
  const withGoal = (g) => {
    const p = JSON.parse(JSON.stringify(base));
    p.inquiry = { ...(p.inquiry ?? {}), goals: [g], wantLessOf: "", wantMoreOf: "" };
    return plan(p);
  };
  const shuu = withGoal("集客"), sen = withGoal("選別");
  console.log(`      集客 ${labels(shuu).join(" → ")}`);
  console.log(`      選別 ${labels(sen).join(" → ")}`);
  check("同じ会社でも、集客と選別で導線が変わる", labels(shuu).join() !== labels(sen).join());

  /**
   * **来てほしくない問い合わせを、情報を消す方向に使わない**（ご指示）。
   * 対応条件を**厚く・前に**して、問い合わせる前に読む人が判断できるようにする。
   */
  const p2 = JSON.parse(JSON.stringify(base));
  p2.inquiry = { ...(p2.inquiry ?? {}), wantLessOf: "1個だけの試作で、図面も無い相談" };
  const avoid = plan(p2), plain = plan(base);
  check("避けたい仕事がある会社は、対応可能範囲が厚くなる",
    pageOf(avoid, "capability")?.depth === "thick");
  check("避けたい仕事があっても、ページは1枚も減らない",
    avoid.pages.length >= plain.pages.length, `${plain.pages.length} → ${avoid.pages.length}`);
  check("避けたい仕事の理由が、骨格に残っている", /問い合わせる前に判断/.test(avoid.why));

  /** もっと受けたい仕事がある会社は、その実例を先に見せる */
  const p3 = JSON.parse(JSON.stringify(base));
  p3.inquiry = { ...(p3.inquiry ?? {}), wantMoreOf: "", wantLessOf: "" };
  const noSeek = plan(p3);
  const yesSeek = plan(base);
  const iOf = (pl, id) => navOf(pl).findIndex((x) => x.id === id);
  check("もっと受けたい仕事があると、加工事例が強み・技術より前に出る",
    iOf(yesSeek, "cases") < iOf(yesSeek, "strengths") && iOf(noSeek, "cases") > iOf(noSeek, "strengths"),
    `有=${iOf(yesSeek, "cases")}/${iOf(yesSeek, "strengths")} 無=${iOf(noSeek, "cases")}/${iOf(noSeek, "strengths")}`);
}

console.log("\n━━━ 水増しになっていないか ━━━");
{
  for (const [name, f] of FIXTURES) {
    const pl = plan(load(f));
    const thick = pl.pages.filter((x) => x.depth === "thick");
    check(`${name}：厚くするページは2枚まで`, thick.length <= 2, thick.map((x) => x.id).join(" "));
  }
  /** **導線の順と、検索での重みは別物**（ご指示）。同じ数値を使い回していないこと */
  const pl = plan(load(FIXTURES[0][1]));
  const byOrder = pl.pages.map((x) => x.id).join();
  const byWeight = [...pl.pages].sort((a, b) => b.searchWeight - a.searchWeight).map((x) => x.id).join();
  check("導線の順と検索の重みが、同じ並びになっていない", byOrder !== byWeight);
}

console.log("\n━━━ 単一の正になっているか ━━━");
{
  const site = fs.readFileSync("site-template/src/lib/site.ts", "utf8");
  check("メニューが骨格から出ている", /navOf\(sitePlan\)/.test(site));
  check("sitemap が骨格から出ている",
    /sitePlan\.pages/.test(fs.readFileSync("site-template/src/pages/sitemap.xml.ts", "utf8")));
  check("sitemap が searchWeight を使っている（order ではない）",
    /searchWeight/.test(fs.readFileSync("site-template/src/pages/sitemap.xml.ts", "utf8")));
  check("robots が sitemap の場所を出している",
    /Sitemap: /.test(fs.readFileSync("site-template/src/pages/robots.txt.ts", "utf8")));
  /** 役割の表に抜けが無いか。**ページを足したときに気づく** */
  check("すべてのページに役割がある", Object.keys(ROLE_OF).every((k) => ROLES.includes(ROLE_OF[k])));
  check("すべての勝ち筋に骨格の指定がある",
    PRIMARY_STRENGTHS.every((s) => ARCHITECTURE[s] && PLAYBOOK[s]),
    PRIMARY_STRENGTHS.filter((s) => !ARCHITECTURE[s]).join(" "));
  check("根拠の無い会社（unknown）は並べ替えない",
    !ARCHITECTURE.unknown.roles && !ARCHITECTURE.unknown.first && !ARCHITECTURE.unknown.thicken);
}

console.log("\n━━━ 説明文が会社ごとに違うか ━━━");
{
  const t = fs.readFileSync("site-template/src/lib/site.ts", "utf8");
  check("説明文が、聞き取った事実から作られている",
    /descriptionOf/.test(t) && /cap\.materials/.test(t) && /cap\.equipment/.test(t));
  const pages = ["capability", "equipment", "strengths", "cases", "company"];
  for (const f of ["site-template/src/pages/capability/[...page].astro", "site-template/src/pages/equipment/[...page].astro"]) {
    check(`${f.split("/").pop()} が説明文を骨格から取っている`, /descriptionOf\(/.test(fs.readFileSync(f, "utf8")));
  }
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
