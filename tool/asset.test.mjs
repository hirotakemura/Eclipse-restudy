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
import { composeAssets, wantedPhotos, photoRequests, PHOTO_OF_PAGE, SUBJECT_OF_CATEGORY, categoryFor } from "./lib/design/assets.ts";
import { ALLOWED, EVIDENTIAL, SUBJECT_OF, DRAWABLE, canUse } from "./lib/design/system/index.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";

const ORDER = { high: 3, medium: 2, low: 1 };
const RANK_OK = (a, b) => ORDER[a] >= ORDER[b];

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
  /**
   * **依頼はサイト全体で見る**（第3段階）。
   *
   * 最初はトップページだけで数えていたが、**写真を出す帯はページによって違う。**
   * トップに写真の帯が無い会社では、依頼が0本に見えて検査が落ちた。
   * 依頼が立つのは**その写真を出すページ**である。
   */
  const across = (photos) => ["index", ...PAGES].flatMap((page) => build(p, page, { photos }).assets);
  const zero = across([]);
  const some = across(PHOTOS);
  const svg = across([{ file: "jirei-1.svg", category: "加工事例", caseNo: 1 }]);

  check("写真0枚：依頼が立つ", wantedPhotos(zero).length > 0,
    [...new Set(wantedPhotos(zero).map((w) => w.category))].join(" "));
  check("写真あり：その置き場所の依頼が消える",
    !wantedPhotos(some).some((w) => w.category === "加工事例"),
    [...new Set(wantedPhotos(some).map((w) => w.category))].join(" ") || "（依頼なし）");
  check("写真あり：お客様の素材として印が付く",
    some.some((s) => s.asset.source === "customer"));
  /** **仮の画像を実写として数えない**（D-174） */
  check("仮の画像（SVG）は実写として数えない",
    wantedPhotos(svg).some((w) => w.category === "加工事例"),
    [...new Set(wantedPhotos(svg).map((w) => w.category))].join(" ") || "（依頼なし）");
  /** **代替素材で埋めない**（docs/31 原則②） */
  check("写真0枚の証拠の帯は、素材ライブラリで埋まっていない",
    zero.filter((s) => s.asset.intent === "evidence").every((s) => s.asset.source === "none"));
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

/**
 * ── 第2段階：淡い光と幾何の線 ─────────────────────
 *
 * **数を増やしても良くならない**（docs/31 原則⑤）。
 * ここで確かめるのは「付いたか」ではなく「**付きすぎていないか**」である。
 */
console.log("\n━━━ 装飾が、付きすぎていないか（第2段階）━━━");
{
  const GEN = ["editorial", "luxury", "modern", "human", "dynamic", "classic", "seikatsu", "shop", "gstandard"];
  let over = [], onMotif = [], onEvidence = [], lightOnDark = [];
  let pages = 0, decorated = 0;
  for (const [label, f] of FIXTURES) {
    const p = load(f);
    for (const id of GEN) {
      const d = DIRECTIONS.find((x) => x.id === id);
      if (!d || d.plan !== "general") continue;
      const project = { ...p, formSet: "general", photos: [], theme: { ...d.axes, direction: id } };
      for (const page of ["index", ...PAGES]) {
        const a = analyze(project);
        const base = page === "index"
          ? composeTop(project, a, { direction: id, hasProse: false })
          : composePage(page, project, a, { direction: id, hasProse: false });
        const secs = composeAssets(composeVisual(base, project, a, { direction: id }), project, a, { direction: id, page });
        pages++;
        const NEW = secs.filter((s) => s.asset.source === "graphic" && ["light", "geometry"].includes(s.asset.subject));
        decorated += NEW.length;
        for (const k of ["light", "geometry"]) {
          const n = NEW.filter((s) => s.asset.subject === k).length;
          if (n > 1) over.push(`${label}/${id}/${page} ${k}=${n}本`);
        }
        for (const s of NEW) {
          if (s.motif !== "none") onMotif.push(`${label}/${id}/${page} ${s.content}`);
          if (s.asset.intent !== "atmosphere") onEvidence.push(`${label}/${id}/${page} ${s.content}`);
          if (s.asset.subject === "light" && ["accent", "dark"].includes(s.surface)) lightOnDark.push(`${label}/${id}/${page}`);
        }
      }
    }
  }
  check(`1ページに light 1本・geometry 1本まで（${pages}ページ・装飾 ${decorated}本）`, over.length === 0, over.slice(0, 4).join("　"));
  check("地紋のある帯には装飾を重ねない", onMotif.length === 0, onMotif.slice(0, 4).join("　"));
  check("証拠の帯に装飾を置かない", onEvidence.length === 0, onEvidence.slice(0, 4).join("　"));
  /** **暗い地に淡い光を重ねない。** 白い文字のコントラストが落ちる */
  check("白抜きの地に淡い光を置かない", lightOnDark.length === 0, lightOnDark.slice(0, 4).join("　"));
  /** **製造業には広げていない**（第2段階の範囲・ご指示） */
  const man = load("fixtures/design-diversity/b-difficulty.json");
  let manNew = 0;
  for (const id of ["standard", "technical", "craft", "engineering", "industrial", "product"]) {
    const d = DIRECTIONS.find((x) => x.id === id);
    const project = { ...man, photos: [], theme: { ...d.axes, direction: id } };
    const a = analyze(project);
    const secs = composeAssets(composeVisual(composeTop(project, a, { direction: id }), project, a, { direction: id }), project, a, { direction: id, page: "index" });
    manNew += secs.filter((s) => s.asset.source === "graphic" && ["light", "geometry"].includes(s.asset.subject)).length;
  }
  check("製造業の6型には、第2段階の装飾を出していない", manNew === 0, `${manNew}本`);
}

/**
 * ── 第3段階：写真の依頼（`wanted`）──────────────────
 *
 * **目的は「写真を増やすこと」ではない。**
 * 「どの情報を本物の写真で証拠化すると効果が高いか」を判定できるようにすること。
 */
console.log("\n━━━ 写真の依頼（第3段階）━━━");
{
  const PHOTOS = [
    { file: "gaikan.png", category: "外観", caption: "外観" },
    { file: "kojo-1.png", category: "工場・設備", caption: "現場" },
    { file: "jirei-1.png", category: "加工事例", caption: "事例1", caseNo: 1 },
    { file: "daihyo.png", category: "代表者", caption: "代表" },
    { file: "hataraku-1.png", category: "働く人", caption: "働く人" },
  ];
  const p = load("fixtures/design-diversity/b-difficulty.json");
  const all = (photos, pages = ["index", ...PAGES]) => pages.map((page) => {
    const project = { ...p, photos };
    const a = analyze(project);
    const dir = project.theme?.direction;
    const base = page === "index" ? composeTop(project, a, { direction: dir }) : composePage(page, project, a, { direction: dir });
    return { page, sections: composeAssets(composeVisual(base, project, a, { direction: dir }), project, a, { direction: dir, page }) };
  });

  const zero = all([]), full = all(PHOTOS);
  const flat = (x) => x.flatMap((y) => y.sections);

  /** ① 証拠はお客様のものだけ（ご指示1） */
  const evid = flat(full).filter((s) => s.asset.intent === "evidence");
  check("証拠の帯の素材は customer か none だけ",
    evid.every((s) => ["customer", "none"].includes(s.asset.source)),
    [...new Set(evid.map((s) => s.asset.source))].join(" "));

  /** ② 顧客写真が無ければ none（ご指示2・3） */
  check("写真0枚のとき、証拠の帯は1本も素材を持たない",
    flat(zero).filter((s) => s.asset.intent === "evidence").every((s) => s.asset.source === "none"));
  /** **仮の画像で代替しない**（D-174）。SVG は実写として数えない */
  const mock = all([{ file: "jirei-1.svg", category: "加工事例", caseNo: 1 }]);
  check("仮の画像（SVG）を証拠として使わない",
    flat(mock).every((s) => s.asset.source !== "customer"));

  /** ③ category / why / priority の3つまで（ご指示4） */
  const wants = flat(zero).map((s) => s.asset.wanted).filter(Boolean);
  check("依頼が持つのは category / why / priority の3つだけ",
    wants.length > 0 && wants.every((w) => JSON.stringify(Object.keys(w).sort()) === JSON.stringify(["category", "priority", "why"])),
    wants[0] ? Object.keys(wants[0]).join(" ") : "依頼が無い");
  check("理由の文が空でない", wants.every((w) => typeof w.why === "string" && w.why.length > 6));

  /** ④ 写真があるから必ず使う、にはしない（ご指示6） */
  const shows = flat(full).filter((s) => s.asset.source === "customer");
  check("お客様の素材を名乗るのは、写真を実際に出す帯だけ",
    shows.length > 0 && shows.every((s) => s.content === "photos"),
    [...new Set(shows.map((s) => s.content))].join(" "));
  /** 事例の表・設備のカードは画像を1枚も描かないので、素材を持たない */
  check("事例の表・設備のカードは素材を持たない",
    flat(full).filter((s) => ["cases", "equipment", "profile"].includes(s.content)).every((s) => s.asset.source === "none"));

  /** ⑤ 置き場所との対応を見ている（ご指示5） */
  const onlyExterior = all([{ file: "gaikan.png", category: "外観", caption: "外観" }]);
  const stillWant = flat(onlyExterior).map((s) => s.asset.wanted).filter(Boolean).map((w) => w.category);
  check("外観だけ届いても、加工事例の依頼は残る", stillWant.includes("加工事例"), stillWant.join(" "));
  check("外観が届いたら、外観の依頼は消える", !stillWant.includes("外観"), stillWant.join(" "));

  /** ⑥ 届くほど依頼は減り、写真を出す帯は増える */
  const w0 = flat(zero).filter((s) => s.asset.wanted).length;
  const w1 = flat(full).filter((s) => s.asset.wanted).length;
  check(`写真が届くと依頼が減る（${w0} → ${w1}）`, w1 < w0);

  /** ⑦ 同じ頼みを何度も並べない（人に渡す紙として役に立たない） */
  const req = photoRequests(zero);
  check("依頼は置き場所ごとに1行にまとまる",
    req.length === new Set(req.map((r) => r.category)).size && req.length > 0,
    req.map((r) => `${r.category}:${r.priority}`).join(" "));
  check("強い順に並ぶ", req.every((r, i) => i === 0 || RANK_OK(req[i - 1].priority, r.priority)),
    req.map((r) => r.priority).join(" "));
  /** **加工品と設備をいちばん先に頼む**（`analysis.ts` の写真の点数付けに合わせている） */
  check("加工事例の依頼がいちばん強い", req[0] && ["加工事例", "工場・設備"].includes(req[0].category),
    req[0]?.category ?? "依頼が無い");

  /** ⑧ 骨格は写真の枚数で変わらない（ご指示8） */
  const bone = (x) => flat(x).filter((s) => s.content !== "photos").map((s) => `${s.content}:${s.presentation}`).join(" ");
  check("写真の枚数で、帯の並びと見せ方が変わらない", bone(zero) === bone(full));
}

console.log("\n━━━ 装飾の描き方（site.css）━━━");
{
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
  const bare = strip(css);

  /**
   * **章の区切りの縞が、帯の面を塗り替えないか**（D-310）。
   *
   * 【実測】`html[data-sections="alternate"] .section:nth-of-type(even)`（0,3,1）が
   * `.band[data-surface="dark"]`（0,2,0）に勝ち、**暗い地が薄い地に変わって、
   * 白い文字だけが残った。コントラスト比 1.08:1。**
   * `test:contrast` が通っていたのは、あれが**宣言**を見ていて
   * **重なりの勝ち負け**を見ていないからである。
   */
  const alt = /html\[data-sections="alternate"\]\s*\.section:nth-of-type\(even\)([^{]*)\{/.exec(bare);
  check("章の区切りの縞に、帯の面を守る条件が付いている",
    !!alt && /:is\(:not\(\.band\),\s*\.band\[data-surface="plain"\]\)/.test(alt[1]),
    alt ? `条件 → ${alt[1].trim() || "（無し）"}` : "縞の指定が見当たりません");

  check("淡い光の描き方がある", /\[data-asset-subject="light"\][^{]*::before/.test(bare));
  check("幾何の線の描き方がある", /\[data-asset-subject="geometry"\][^{]*::before/.test(bare));
  /**
   * 装飾に関わる規則を、**選択子と中身の組**で取り出す。
   * 選択子だけを見ると、消すための規則（印刷）まで数えてしまう。
   */
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2].trim() }))
    .filter((r) => r.sel.includes('data-asset-source="graphic"') || r.sel.includes("data-asset-subject="));
  /** **描く規則**＝擬似要素を作る（`content:` を持つ）もの */
  const draws = rules.filter((r) => /content:/.test(r.body));

  /** **地紋のある帯には敷かない。** 語彙の側でも止めているが、両側で止める */
  for (const k of ["light", "geometry"]) {
    const mine = draws.filter((r) => r.sel.includes(`data-asset-subject="${k}"`));
    check(`「${k}」は地紋のある帯に敷かない（:not([data-motif])）`,
      mine.length > 0 && mine.every((r) => r.sel.includes(":not([data-motif])")),
      mine.filter((r) => !r.sel.includes(":not([data-motif])")).map((r) => r.sel).join(" ") || `${mine.length}件`);
  }
  /** **動きは足していない**（第2段階の範囲外・ご指示） */
  const moving = rules.filter((r) => /animation|transition/.test(r.body));
  check("装飾に動きを付けていない", moving.length === 0, moving.map((r) => r.sel).join(" "));
  /** **紙には出さない。** インクを使うだけで、読む助けにならない */
  const print = bare.slice(bare.indexOf("@media print"));
  check("印刷では装飾を消す", /data-asset-source="graphic"[\s\S]{0,240}display:\s*none/.test(print));
  /** **小さい画面では、線を本文の裏から外す**（画面を見て直した） */
  const mobile = bare.slice(bare.lastIndexOf("@media (max-width: 720px)"));
  check("スマホで幾何の線の位置を変えている", /data-asset-subject="geometry"[\s\S]{0,200}bottom:/.test(mobile));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
