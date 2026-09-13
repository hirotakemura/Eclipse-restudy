/**
 * KOBO — デザイン生成の試験
 *
 * **確かめたいのは1つ。「会社が違えば、構成が違うか」。**
 *
 * これまでは会社が違っても全ページが同じ形だった（docs/21）。
 * 配色や書体を変えても同じ顔に見えるのは、装飾しか変わっていなかったから。
 *
 * ここでは、**作り物の案件データを何通りか作って、出てくる構成が違うこと**を確かめる。
 * あわせて、**材料が無い会社に、そのセクションを作らないこと**も確かめる。
 */
import { analyze } from "./lib/design/analysis.ts";
import { composeTop } from "./lib/design/sections.ts";

const base = {
  basics: { name: "試験株式会社", founded: "1972年", tel: "093-000-0000" },
  capability: {},
  strengths: {},
  inquiry: { goals: ["集客"] },
  cases: [],
  photos: [],
};
const make = (over) => JSON.parse(JSON.stringify({ ...base, ...over }));
const kinds = (p, opts = {}) => composeTop(p, analyze(p), opts).map((s) => s.kind);

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

console.log("\n━━━ 会社が違えば構成が違う ━━━");

// ① 他社が断った仕事で勝っている会社
const dankotu = make({
  strengths: {
    wonAfterOthersDeclined: "他社から「割れるから無理」と断られた薄肉部品を受けている。",
    workOthersAvoid: "薄肉・複雑形状の小ロット。",
    followUpFindings: "【治具の内製】図面を見て支持点を判断し、治具を自社で作る。",
  },
  inquiry: { goals: ["集客"], wantLessOf: "単純な量産の相見積もり。" },
});

// ② 設備と材質で勝っている会社（強みの聞き取りが薄い）
const setsubi = make({
  capability: {
    materials: ["アルミ", "ステンレス", "鋳鉄", "チタン"],
    lotSize: "1個から", shortestLeadTime: "最短3日", tolerance: "±0.01mm",
    equipment: [
      { maker: "ブラザー工業", model: "S700X1", count: 6 },
      { maker: "オークマ", model: "LB3000", count: 4 },
    ],
  },
});

// ③ 歴史と人で見せる会社
const shinise = make({
  basics: {
    ...base.basics, generation: "四代目",
    history: [{ year: "1952", event: "創業" }, { year: "1980", event: "工場移転" }, { year: "2005", event: "二代目就任" }],
  },
  executive: { vision: "100年続く会社にしたい。" },
  photos: [{ file: "daihyo.jpg", category: "代表者" }, { file: "gaikan.jpg", category: "外観" }],
});

const a = kinds(dankotu), b = kinds(setsubi), c = kinds(shinise);
console.log(`      ①断りを受ける会社: ${a.join(" → ")}`);
console.log(`      ②設備の会社      : ${b.join(" → ")}`);
console.log(`      ③老舗の会社      : ${c.join(" → ")}`);

check("① 他社が断った案件が先頭に来る", a[1] === "declined", a.join(","));
check("② 設備の会社では declined が出ない（材料が無いので）", !b.includes("declined"));
check("② 設備の会社では設備と数字が出る", b.includes("equipment") && b.includes("figures"), b.join(","));
check("③ 老舗では沿革と写真が出る", c.includes("timeline") && c.includes("gallery"), c.join(","));
check("3社の構成がすべて違う", new Set([a.join(), b.join(), c.join()]).size === 3);

console.log("\n━━━ 無いものを作らない ━━━");
const karappo = kinds(make({}));
check("材料が何も無ければ、最初の画面だけになる", karappo.join() === "hero", karappo.join(","));
check("写真が無ければ gallery を作らない", !kinds(setsubi).includes("gallery"));
check("仮の画像（.svg）は写真として数えない",
  !kinds(make({ photos: [{ file: "gaikan.svg", category: "外観" }, { file: "k.svg", category: "工場・設備" }] })).includes("gallery"));
check("沿革が2件では年表を作らない",
  !kinds(make({ basics: { ...base.basics, history: [{ year: "1972", event: "創業" }, { year: "1990", event: "移転" }] } })).includes("timeline"));

console.log("\n━━━ 同じものを二度出さない ━━━");
const spec = kinds(setsubi, { hero: "spec" });
const head = kinds(setsubi, { hero: "headline" });
check("「対応範囲を先に」の型では、数字の帯を重ねて出さない", !spec.includes("figures"), spec.join(","));
check("「見出しを先に」の型では、数字の帯を出す", head.includes("figures"), head.join(","));
check("原稿がまだ無ければ、空の帯を出さない", !kinds(dankotu).includes("prose"));
check("原稿があれば出す", kinds(dankotu, { hasProse: true }).includes("prose"));

console.log("\n━━━ 引き合いの実態が順番を動かす ━━━");
const futsu = make({ strengths: dankotu.strengths, inquiry: { goals: ["集客"] } });
const sc = (p, id) => analyze(p).strands.find((s) => s.id === id)?.score ?? 0;
check("「減らしたい問い合わせ」があると、断られた案件の順位が上がる",
  sc(dankotu, "declined") > sc(futsu, "declined"),
  `${sc(futsu, "declined")} → ${sc(dankotu, "declined")}`);
check("「減らしたい問い合わせ」の文面そのものは、構成に入らない",
  !JSON.stringify(composeTop(dankotu, analyze(dankotu))).includes("相見積もり"));

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
