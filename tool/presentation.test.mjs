/**
 * KOBO — 情報表現の語彙・可否表・Brief検査の試験
 *
 * **この改修の目的は「情報の種類を減らして違いを作る」ことではない**（D-204）。
 * **「同じ必要情報を持っていても、その会社にとって何が重要なのかによって、
 * 情報の見せ方が変わる」状態を作ること。**
 *
 * ここで確かめるのは、その土台：
 *   ・内容と表現が分かれていること
 *   ・使ってよい組み合わせが表で縛られていること
 *   ・材料が無ければ選べないこと
 *   ・AIの出力が4段で検査され、落ちても止まらないこと
 */
import {
  CONTENTS, PRESENTATIONS, COMPATIBLE, canPresent, hasMaterial, usablePresentations,
} from "./lib/design/system/index.ts";
import { validateBrief, projectHash } from "./lib/design/brief.ts";
import { asContentPresentation } from "./lib/design/sections.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

const full = {
  count: 9, length: 400, hasShortValue: true, hasPair: true,
  hasQuote: true, hasSteps: true, hasRealPhotos: true,
};
const empty = {
  count: 0, length: 0, hasShortValue: false, hasPair: false,
  hasQuote: false, hasSteps: false, hasRealPhotos: false,
};

console.log("\n━━━ 語彙 ━━━");
check("表現は12個。増やしていない", PRESENTATIONS.length === 12, `${PRESENTATIONS.length}個`);
check("「散文」と「読み物」が別物として定義されている",
  PRESENTATIONS.some((p) => p.id === "prose") && PRESENTATIONS.some((p) => p.id === "longform"));
check("読み物は長い文章を要求する（散文より厳しい）",
  hasMaterial("longform", { ...empty, length: 100 }) === false && hasMaterial("prose", { ...empty, length: 100 }) === true);
check("すべての内容に、使える表現が1つ以上ある",
  CONTENTS.every((c) => (COMPATIBLE[c.id] ?? []).length > 0),
  CONTENTS.filter((c) => !(COMPATIBLE[c.id] ?? []).length).map((c) => c.id).join(","));
check("可否表に、語彙にない表現が入っていない",
  Object.values(COMPATIBLE).flat().every((p) => PRESENTATIONS.some((x) => x.id === p)));

console.log("\n━━━ 可否表が縛りとして効く ━━━");
check("材質 × 札 は許可", canPresent("materials", "chips"));
check("材質 × 仕様表 は許可", canPresent("materials", "spec"));
check("材質 × 年表 は禁止", !canPresent("materials", "timeline"));
check("対応条件 × 引用 は禁止", !canPresent("conditions", "quote"));
check("沿革 × 年表 は許可", canPresent("history", "timeline"));

console.log("\n━━━ 材料が無ければ選べない ━━━");
check("沿革が2件では年表にしない", !hasMaterial("timeline", { ...empty, count: 2 }));
check("沿革が3件なら年表にできる", hasMaterial("timeline", { ...empty, count: 3 }));
check("短く言い切れる値が無ければ、大きな数字にしない", !hasMaterial("largeNumber", empty));
check("写真が無ければ全幅にしない", !hasMaterial("fullWidth", empty));
check("材料が何も無ければ、使える表現はゼロ", usablePresentations("cases", empty).length === 0);
check("材料が揃えば、加工事例は複数の表現から選べる",
  usablePresentations("cases", full).length >= 3, usablePresentations("cases", full).join(","));

console.log("\n━━━ 内容と表現が分かれている（D-206）━━━");
check("kind から内容と表現の組が引ける", asContentPresentation("materials")?.presentation === "chips");
check("同じ内容で表現が違う kind がある（設備）",
  asContentPresentation("equipment").content === asContentPresentation("equipmentTable").content
  && asContentPresentation("equipment").presentation !== asContentPresentation("equipmentTable").presentation);
check("いまの kind の組み合わせは、すべて可否表を通る",
  ["figures","declined","technique","materials","equipment","equipmentTable","specTable","cases","gallery","timeline","people","points","prose"]
    .every((k) => { const x = asContentPresentation(k); return canPresent(x.content, x.presentation); }),
  ["figures","declined","technique","materials","equipment","equipmentTable","specTable","cases","gallery","timeline","people","points","prose"]
    .filter((k) => { const x = asContentPresentation(k); return !canPresent(x.content, x.presentation); }).join(","));

console.log("\n━━━ Briefの4段検査（D-208）━━━");
const good = {
  primaryStrength: "difficulty",
  hero: { form: "headline", media: "none" },
  blocks: [{ content: "declined", presentation: "quote", emphasis: "lead" }],
  motif: "section", motionLevel: "subtle",
};
const mats = () => full;
check("正しいBriefは通る", validateBrief(good, mats).length === 0,
  JSON.stringify(validateBrief(good, mats)));
check("1段目：JSONでなければ落ちる", validateBrief("だめ", mats)[0]?.stage === "form");
check("1段目：知らない項目があれば落ちる",
  validateBrief({ ...good, layoutStyle: "cool" }, mats).some((p) => p.stage === "form"));
check("2段目：語彙にない値は落ちる",
  validateBrief({ ...good, motif: "gear" }, mats).some((p) => p.stage === "vocabulary"));
check("2段目：知らない表現は落ちる",
  validateBrief({ ...good, blocks: [{ content: "cases", presentation: "carousel", emphasis: "lead" }] }, mats)
    .some((p) => p.stage === "vocabulary"));
check("3段目：可否表にない組み合わせは落ちる",
  validateBrief({ ...good, blocks: [{ content: "materials", presentation: "timeline", emphasis: "lead" }] }, mats)
    .some((p) => p.stage === "compatibility"));
check("4段目：材料が無ければ落ちる",
  validateBrief(good, () => empty).some((p) => p.stage === "material"));
check("語彙で落ちたら、可否と材料は見ない（指摘を重ねない）",
  validateBrief({ ...good, blocks: [{ content: "materials", presentation: "carousel", emphasis: "lead" }] }, () => empty)
    .every((p) => p.stage === "vocabulary" || p.stage === "form"));
check("推測で強みを決めさせない：unknown も語彙として認める",
  validateBrief({ ...good, primaryStrength: "unknown" }, mats).length === 0);
check("語彙にない強みは落ちる",
  validateBrief({ ...good, primaryStrength: "seems-precise" }, mats).some((p) => p.stage === "vocabulary"));

console.log("\n━━━ 案件データが変わったら分かる（ご指示④）━━━");
check("同じデータからは同じ印", projectHash({ a: 1 }) === projectHash({ a: 1 }));
check("違うデータからは違う印", projectHash({ a: 1 }) !== projectHash({ a: 2 }));

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
