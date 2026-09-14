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
import { composeTop, composePage } from "./lib/design/sections.ts";

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
// 条件が主役になる会社（短納期）
const hayai = make({
  capability: { shortestLeadTime: "標準7日。急ぎの場合は最短翌日", lotSize: "1個から", materials: ["アルミ"] },
});
const spec = kinds(setsubi, { hero: "spec" });
const head = kinds(setsubi, { hero: "headline" });
/**
 * **主役の内容は、最初の画面と重なっても消さない**（D-214）。
 * 消すと、その会社のいちばん見せたい情報が出なくなる（D-204）。
 * 重なりは「消す」ではなく「別の見せ方にする」で避ける。
 */
check("「対応範囲を先に」の型では、条件の帯を重ねて出さない（主役でないとき）",
  !kinds(dankotu, { hero: "spec" }).includes("figures"),
  kinds(dankotu, { hero: "spec" }).join(","));
check("条件が主役の会社では、最初の画面と重なっても条件の帯を残す",
  kinds(hayai, { hero: "spec" }).includes("figures"), kinds(hayai, { hero: "spec" }).join(","));
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

console.log("\n━━━ 型（方向性）が並び方を変える ━━━");

/** 同じ会社・同じ材料で、型だけを変える */
const zenbu = make({
  basics: {
    ...base.basics, generation: "四代目",
    history: [{ year: "1952", event: "創業" }, { year: "1980", event: "工場移転" }, { year: "2005", event: "二代目就任" }],
  },
  capability: {
    materials: ["アルミ", "ステンレス", "鋳鉄"], lotSize: "1個から", shortestLeadTime: "最短3日",
    equipment: [{ maker: "ブラザー工業", model: "S700X1", count: 6 }],
  },
  strengths: {
    wonAfterOthersDeclined: "他社から断られた薄肉部品を受けている。",
    followUpFindings: "【治具の内製】治具を自社で作る。",
  },
  executive: { vision: "100年続く会社にしたい。" },
  photos: [{ file: "kojo.jpg", category: "工場・設備" }, { file: "daihyo.jpg", category: "代表者" }],
});

const byDirection = {};
for (const d of ["standard", "technical", "craft", "engineering", "industrial", "product"]) {
  byDirection[d] = kinds(zenbu, { direction: d });
  console.log(`      ${d.padEnd(9)}: ${byDirection[d].join(" → ")}`);
}
check("型が違えば並びが違う（6種のうち4種以上が別の並び）",
  new Set(Object.values(byDirection).map((v) => v.join())).size >= 4,
  `別の並びは ${new Set(Object.values(byDirection).map((v) => v.join())).size} 種`);
check("「老舗・職人」では沿革か代表が前に出る",
  byDirection.craft.indexOf("timeline") < byDirection.technical.indexOf("timeline")
  || byDirection.craft.includes("people"),
  byDirection.craft.join(","));
check("「精密加工」では条件・材質・設備が前に出る",
  byDirection.technical.slice(0, 4).some((k) => ["figures", "materials", "equipment"].includes(k)),
  byDirection.technical.join(","));
check("「量産・設備」では設備か写真が前に出る",
  byDirection.industrial.slice(0, 3).some((k) => ["equipment", "gallery"].includes(k)),
  byDirection.industrial.join(","));
check("型で後ろに回しても、材料があるセクションを消さない",
  kinds(zenbu, { direction: "product" }).length === kinds(zenbu, { direction: "technical" }).length
  || kinds(zenbu, { direction: "product" }).length > 1);

console.log("\n━━━ トップ以外のページも構成される ━━━");
const page = (slug, p, opts = {}) => composePage(slug, p, analyze(p), opts).map((s) => s.kind);
console.log(`      強み・技術  : ${page("strengths", zenbu).join(" → ")}`);
console.log(`      対応可能範囲: ${page("capability", zenbu).join(" → ")}`);
console.log(`      設備一覧    : ${page("equipment", zenbu).join(" → ")}`);
check("強み・技術は1つの帯で終わらない", page("strengths", zenbu).length >= 3);
check("対応可能範囲では条件が先に来る", page("capability", zenbu)[0] === "figures", page("capability", zenbu).join(","));
check("設備一覧では型番の分かる設備が表より先に来る",
  page("equipment", zenbu).indexOf("equipment") < page("equipment", zenbu).indexOf("equipmentTable"));
check("型番の分かる設備が無ければ、その帯を作らない",
  !page("equipment", make({ capability: { equipment: [{ model: "旋盤", count: 2 }] } })).includes("equipment"));

/**
 * 動きの実装原則（`lib/design/system/motion.ts`・例外なし）を、
 * **スタイルシートそのもので確かめる。**
 *
 * ここを検査していなかったため、
 * 「白抜きの地の地紋を直したつもりが、`prefers-reduced-motion` の中に入っていた」
 * という取りこぼしが起きた（D-238）。**書いた場所は、読まないと分からない。**
 */
console.log("\n━━━ 動きの原則 ━━━");
{
  const fs = await import("node:fs");
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");

  /** `@media (prefers-reduced-motion: no-preference) { … }` の中身を取り出す */
  const start = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  let depth = 0, i = css.indexOf("{", start), from = i + 1, end = -1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) { end = i; break; }
  }
  const inside = css.slice(from, end);
  const outside = css.slice(0, start) + css.slice(end + 1);

  check("動きは prefers-reduced-motion の中だけに書いてある",
    !/animation-timeline/.test(outside),
    "外側に animation-timeline があります");
  /**
   * **素のHTMLは最初から見えている**（motion.ts の原則2）。
   * 最初に書いた検査は、自分で付けた除外処理のせいで**何も検査していなかった。**
   * わざと `opacity: 0` を入れて、落ちることを確かめてある。
   */
  check("本文を opacity:0 で隠していない",
    !/opacity:\s*0(?![.\d%])/.test(inside),
    "動きの中に opacity:0 があります");
  check("動きの中に「見た目の修正」を紛れ込ませていない（D-238）",
    !/data-surface="dark"/.test(inside),
    "暗い面の指定が動きのブロックに入っています");
  check("印刷では動きを止めている", /@media print[\s\S]{0,200}animation: none/.test(css));
  check("謳っている動きは実装してある（工程の線が伸びる）",
    /kobo-grow/.test(inside) && /@keyframes kobo-grow/.test(css));
}


/**
 * **「どうやって受けているか」は、事例のすぐ後ろ**（D-264）。
 *
 * 事例は「こう相談され、こう解決した」と言い、技術の帯は**その方法に名前をつける。**
 * 間に材質の札や設備のカードが挟まると、話の筋が切れる。
 * 帯の並びを「見立ての点数順」にしていたのが原因で、点数順は**読み手の疑問の順ではない。**
 */
console.log("\n━━━ 事例の直後に「どうやって受けているか」が来るか（D-264）━━━");
{
  const fs = await import("node:fs");
  for (const f of ["a-precision", "b-difficulty", "c-speed"]) {
    const p = JSON.parse(fs.readFileSync(`fixtures/design-diversity/${f}.json`, "utf8"));
    const list = kinds(p, { hero: "spec", direction: "technical" });
    const iCase = list.indexOf("cases");
    const iTech = list.indexOf("technique");
    if (iCase < 0 || iTech < 0) { check(`${f}：事例と技術の帯が両方ある（前提）`, false, list.join(" ")); continue; }
    check(`${f}：事例の直後が「どうやって受けているか」`, iTech === iCase + 1, list.join(" "));
  }
  /** **技術の帯が無い会社では、何も起きない** */
  const noTech = make({ capability: { materials: ["アルミ", "鉄"] }, cases: [{ title: "例", challenge: "難", solution: "解", result: "良" }] });
  const list = kinds(noTech, { hero: "spec", direction: "technical" });
  check("技術の帯が無ければ、並びは変わらない（落ちない）", !list.includes("technique"), list.join(" "));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
