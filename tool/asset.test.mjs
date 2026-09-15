/**
 * KOBO — 素材の判断（Asset）の試験
 *
 * **第1段階で確かめたいのは2つ。**
 *   ① 証拠と雰囲気が混ざらないこと（生成画像が実績写真にならない）
 *   ② **既存の画面を1つも動かしていないこと**
 *
 * ②が本体である。この段階は「計算して持ち、data属性で出す」だけと決めてあるので、
 * 帯の数・順番・内容・見せ方・面・地紋・リズムが1つでも動いたら、約束を破っている。
 */
import fs from "node:fs";
import { analyze } from "./lib/design/analysis.ts";
import { composeTop, composePage } from "./lib/design/sections.ts";
import { composeVisual } from "./lib/design/visual.ts";
import { composeAssets, wantedPhotos, PHOTO_OF_PAGE, SUBJECT_OF_CATEGORY, categoryFor } from "./lib/design/assets.ts";
import { ALLOWED, EVIDENTIAL, SUBJECT_OF, DRAWABLE, canUse } from "./lib/design/system/index.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

const FIXTURES = [
  ["製造業A 精度", "fixtures/design-diversity/a-precision.json"],
  ["製造業B 難加工", "fixtures/design-diversity/b-difficulty.json"],
  ["製造業C 短納期", "fixtures/design-diversity/c-speed.json"],
  ["汎用A サービス", "fixtures/visual-general/g-a-service.json"],
  ["汎用B ブランド", "fixtures/visual-general/g-b-brand.json"],
  ["汎用C 人・店舗", "fixtures/visual-general/g-c-people.json"],
];
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const PAGES = ["strengths", "capability", "equipment", "cases", "company", "message", "recruit", "contact"];

/** そのページの帯を、素材の判断まで通して返す */
function build(p, page, over = {}) {
  const project = { ...p, ...over };
  const a = analyze(project);
  const dir = project.theme?.direction;
  const base = page === "index"
    ? composeTop(project, a, { direction: dir, hasProse: false })
    : composePage(page, project, a, { direction: dir, hasProse: false });
  const visual = composeVisual(base, project, a, { direction: dir });
  return { visual, assets: composeAssets(visual, project, a, { direction: dir, page }) };
}

console.log("\n━━━ 証拠と雰囲気が混ざらないか ━━━");
{
  check("evidence に library を許していない", !ALLOWED.evidence.includes("library"));
  check("evidence に generated を許していない", !ALLOWED.evidence.includes("generated"));
  check("evidence に none を許している（無ければ置かない・依頼する）", ALLOWED.evidence.includes("none"));
  check("可否表が、表の外からも守られている", !canUse("evidence", "generated") && canUse("evidence", "customer"));

  let bad = [], gen = 0, total = 0;
  for (const [label, f] of FIXTURES) {
    const p = load(f);
    for (const page of ["index", ...PAGES]) {
      for (const s of build(p, page).assets) {
        total++;
        if (s.asset.source === "generated") gen++;
        if (!canUse(s.asset.intent, s.asset.source)) bad.push(`${label}/${page} ${s.content}=${s.asset.source}`);
      }
    }
  }
  check(`証拠の帯に、お客様以外の素材が入っていない（${total}本）`, bad.length === 0, bad.join(" "));
  /** **生成画像は、返す経路そのものを作っていない**（docs/31 §5） */
  check("生成画像が1本も返っていない", gen === 0, `${gen}本`);
}

console.log("\n━━━ 写真が無いときに、人に知らせているか ━━━");
{
  const p = load("fixtures/design-diversity/b-difficulty.json");
  const PHOTOS = [
    { file: "gaikan.png", category: "外観", caption: "外観" },
    { file: "kojo-1.png", category: "工場・設備", caption: "現場" },
    { file: "jirei-1.png", category: "加工事例", caption: "事例", caseNo: 1 },
  ];
  const zero = build(p, "index", { photos: [] });
  const some = build(p, "index", { photos: PHOTOS });
  const svg = build(p, "index", { photos: [{ file: "jirei-1.svg", category: "加工事例" }] });

  check("写真0枚：依頼が立つ", wantedPhotos(zero.assets).length > 0,
    wantedPhotos(zero.assets).map((w) => w.category).join(" "));
  check("写真あり：その置き場所の依頼が消える",
    !wantedPhotos(some.assets).some((w) => w.category === "加工事例"),
    wantedPhotos(some.assets).map((w) => w.category).join(" ") || "（依頼なし）");
  check("写真あり：お客様の素材として印が付く",
    some.assets.some((s) => s.asset.source === "customer"));
  /** **仮の画像を実写として数えない**（D-174） */
  check("仮の画像（SVG）は実写として数えない",
    wantedPhotos(svg.assets).some((w) => w.category === "加工事例"));
  /** **代替素材で埋めない**（docs/31 原則②） */
  check("写真0枚の証拠の帯は、素材ライブラリで埋まっていない",
    zero.assets.filter((s) => s.asset.intent === "evidence").every((s) => s.asset.source === "none"));
}

console.log("\n━━━ 語を2箇所で持っている所の突き合わせ ━━━");
{
  /** `schema.ts` の PhotoCategory と、素材の語彙が同じか（D-197と同じ形の事故を防ぐ） */
  const schema = fs.readFileSync("lib/schema.ts", "utf8");
  const inSchema = [...schema.matchAll(/\|\s*"([^"]+)"\s*\/\/[^\n]*\n/g)].map((m) => m[1]);
  for (const c of Object.keys(SUBJECT_OF_CATEGORY)) {
    check(`置き場所「${c}」が schema.ts にもある`, inSchema.includes(c) || c === "その他");
  }
  /**
   * **ページごとの写真の選び方が、`Present.astro` と同じか。**
   * 同じ対応表が2箇所にある。写し間違えると、
   * **依頼する写真と、画面に出す写真が食い違う。**
   */
  const present = fs.readFileSync("site-template/src/components/Present.astro", "utf8");
  for (const [page, cat] of Object.entries(PHOTO_OF_PAGE)) {
    if (page === "case") continue; // caseNo で選ぶので対応表に出ない
    check(`ページ「${page}」の写真の選び方が Present.astro と同じ（${cat}）`,
      present.includes(`page === "${page}" ? photosOf("${cat}")`), `Present.astro に見当たりません`);
  }
  /** 内容から決まる主題と、置き場所から決まる主題が食い違わないか */
  for (const content of EVIDENTIAL) {
    if (content === "photos") continue; // ページで変わる
    const viaCategory = SUBJECT_OF_CATEGORY[categoryFor(content, "index")];
    check(`「${content}」の主題が、内容と置き場所で一致（${viaCategory}）`, SUBJECT_OF[content] === viaCategory,
      `内容=${SUBJECT_OF[content]} 置き場所=${viaCategory}`);
  }
  check("型すべてに、素材の主題の候補がある", DIRECTIONS.every((d) => Array.isArray(d.assets)));
  check("描ける主題だけが DRAWABLE に入っている",
    DRAWABLE.every((x) => ["texture", "grid", "dimension", "geometry", "light"].includes(x)));
}

/**
 * ── ここからが第1段階の本体 ──────────────────────
 *
 * **素材の層を足したが、画面は1つも動いていない。**
 * 約束したのは「計算して持ち、data属性で出すところまで」なので、
 * 帯の数・順番・内容・見せ方・強さ・面・組み方・地紋・リズムが
 * **1つでも変わっていたら、約束を破っている。**
 */
console.log("\n━━━ 既存の帯を1つも動かしていないか（第1段階の約束）━━━");
{
  const KEYS = ["kind", "content", "presentation", "emphasis", "width", "surface", "layout", "motif", "media", "heading", "slug", "form", "decidedBy"];
  const shape = (s) => KEYS.map((k) => `${k}=${s[k] ?? ""}`).join("|")
    + `|visual=${JSON.stringify(s.visual ?? null)}`;

  let moved = [], bands = 0;
  for (const [label, f] of FIXTURES) {
    const p = load(f);
    for (const page of ["index", ...PAGES]) {
      const { visual, assets } = build(p, page);
      if (visual.length !== assets.length) { moved.push(`${label}/${page} 本数 ${visual.length}→${assets.length}`); continue; }
      for (const [i, before] of visual.entries()) {
        bands++;
        if (shape(before) !== shape(assets[i])) moved.push(`${label}/${page} #${i + 1} ${before.content}`);
      }
    }
  }
  check(`帯の数・順番・中身が1つも変わっていない（${bands}本）`, moved.length === 0, moved.slice(0, 5).join("　"));

  /** **元の配列を書き換えていないか。** 返り値だけ見ても、元が壊れていたら意味がない */
  const p = load("fixtures/design-diversity/a-precision.json");
  const a = analyze(p);
  const visual = composeVisual(composeTop(p, a, { direction: p.theme?.direction }), p, a, { direction: p.theme?.direction });
  const before = JSON.stringify(visual);
  composeAssets(visual, p, a, { direction: p.theme?.direction, page: "index" });
  check("元の帯を書き換えていない", JSON.stringify(visual) === before);

  /** 帯には必ず1つだけ素材の判断が付く（無い＝`none` であって、欄が無いのではない） */
  const assets = composeAssets(visual, p, a, { direction: p.theme?.direction, page: "index" });
  check("すべての帯に素材の判断が1つ付いている",
    assets.every((s) => s.asset && typeof s.asset.source === "string"));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
