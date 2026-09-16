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
import { composeAssets, wantedPhotos, photoRequests, willDraw, PHOTO_OF_PAGE, SUBJECT_OF_CATEGORY, categoryFor } from "./lib/design/assets.ts";
import { ALLOWED, EVIDENTIAL, SUBJECT_OF, DRAWABLE, canUse, LIBRARY, LIBRARY_SUBJECTS, assertLibrary, findLibraryAsset } from "./lib/design/system/index.ts";
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
  /**
   * **どのページが作られるかの条件が、1箇所にまとまったか**（第6段階）。
   *
   * かつては `lib/site.ts` のメニュー・各 `.astro` の `getStaticPaths`・
   * `assets.ts` の写真依頼に、同じ条件が**3箇所に書き写して**あった。
   * ずれると「作られないページの写真をお願いする」が起きるので、
   * 文字列を突き合わせて凌いでいた——**その突き合わせごと不要にする**のが目的である。
   *
   * だから見るのは「同じ文字列があるか」ではなく、
   * **どのファイルも条件を持っていないこと**である。
   */
  {
    const site = fs.readFileSync("site-template/src/lib/site.ts", "utf8");
    const assets = fs.readFileSync("lib/design/assets.ts", "utf8");
    /** メニューの手書き配列が消えていること */
    check("メニューが骨格から作られている",
      /navOf\(sitePlan\)/.test(site) && !/href: "\/capability\/"/.test(site));
    /** 写真の依頼が骨格を見ていること */
    check("写真の依頼が骨格から作られている",
      /composeSite\(project, a\)/.test(assets) && !/hasRecruit/.test(assets));
    /** 各ページの `getStaticPaths` が骨格を見ていること */
    for (const [f, id] of [
      ["site-template/src/pages/capability/[...page].astro", "capability"],
      ["site-template/src/pages/equipment/[...page].astro", "equipment"],
      ["site-template/src/pages/services/[...page].astro", "services"],
      ["site-template/src/pages/[slug].astro", "recruit"],
    ]) {
      const t = fs.readFileSync(f, "utf8");
      const gsp = t.slice(t.indexOf("getStaticPaths"), t.indexOf("getStaticPaths") + 320);
      check(`${id} を作る条件が、骨格だけを見ている`,
        gsp.includes(`buildsPage("${id}")`) && !/isGeneral \?|hasRecruit/.test(gsp), gsp.split("\n")[1] ?? "");
    }
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

  /**
   * ⑧ **持つが、描かない**（D-317）。
   *
   * 写真の帯は、出す写真が無ければ何も描かない。それでも帯を置いたままにすると
   * **見出しだけの帯**が残る。かといって帯ごと消すと、
   * **写真が1枚も無いページから依頼が出なくなる**——いちばん頼みたいページから頼めない。
   */
  const noPhoto = build(p, "company", { photos: [] });
  const gallery = noPhoto.assets.find((x) => x.content === "photos");
  check("写真0枚でも、写真の帯は判断として残る", !!gallery, noPhoto.assets.map((x) => x.content).join(" "));
  check("写真0枚の写真の帯は、依頼を立てる", !!gallery?.asset.wanted, JSON.stringify(gallery?.asset.wanted ?? null));
  check("写真0枚の写真の帯は、画面には描かない", gallery && !willDraw(gallery, { ...p, photos: [] }, "company"));
  /** **仮の画像は描く。** 「ここに写真が入る」と見てもらうためのもの（D-242） */
  const mockOne = { ...p, photos: [{ file: "gaikan.svg", category: "外観" }] };
  const withMock = build(p, "company", { photos: mockOne.photos });
  const g2 = withMock.assets.find((x) => x.content === "photos");
  check("仮の画像があれば、写真の帯は描く", g2 && willDraw(g2, mockOne, "company"));
  /** **別の置き場所の写真では描かない**（合計で見ると、見出しだけの帯が出る） */
  const other = { ...p, photos: [{ file: "kojo-1.png", category: "工場・設備" }] };
  check("別の置き場所の写真では、その帯は描かない", g2 && !willDraw(g2, other, "company"));
  /** **依頼は、写真の無いページからこそ出る** */
  const perCase = ["cases", "case"].flatMap((pg) => build(p, pg, { photos: [] }).assets)
    .filter((x) => x.asset.wanted).length;
  check("写真0枚の事例ページからも依頼が出る", perCase > 0, `${perCase}本`);

  /** ⑨ 骨格は写真の枚数で変わらない（ご指示8） */
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

  /**
   * **白抜きの帯の中の表**（D-329）。
   *
   * D-310 と同じ形の事故が、章の区切りではなく**表**で起きていた。
   * 実測で 18マス中14マスが 1.10〜1.16:1（白い文字と白い地）。
   * **縞と見出し列の指定が、暗い地の指定より強い。**
   */
  {
    const table = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ sel: m[1].trim(), body: m[2].trim() }))
      .filter((r) => /data-surface="dark"/.test(r.sel) && /\b(th|td|tr)\b/.test(r.sel) && /background/.test(r.body));
    check("白抜きの帯の中では、表の地も白に倒している",
      table.length >= 2 && table.every((r) => /rgba\(255,\s*255,\s*255/.test(r.body)),
      table.map((r) => r.body).join(" | ") || "指定が見当たりません");
    /** **縞は残す。** 行数の多い表で目が迷わないための型なので、消してはいけない */
    check("白抜きの帯でも、表の縞は残っている",
      table.some((r) => /nth-child\(odd\)(?!\s+th)/.test(r.sel)),
      table.map((r) => r.sel).join(" | "));
  }

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

console.log("\n━━━ 素材ライブラリ（第5段階）━━━");
{
  /**
   * **この段階で確かめたいのは、「増えたか」ではない。**
   *
   *   ① 証拠に届かないこと（型と実行時の両方で）
   *   ② 生成画像に到達する経路が無いこと
   *   ③ 権利の分からない素材が本番に入らないこと
   *   ④ **必要なページだけが使い、要らないページは `none` のまま成立すること**
   *
   * ④は「0件であること」だけでは足りない。**仕組みが死んでいても0件になる。**
   * だから「実案件では0件」と「条件が揃えば採られる」を**両方**見る。
   */
  const relPath = (x) => `site-template/public${x.path}`;

  check("登録簿そのものが検査を通る", (() => { try { assertLibrary(); return true; } catch { return false; } })());

  /** **実物として読まれる主題は、登録できない**（ご指示の原則③④を型と検査で守る） */
  for (const bad of ["workpiece", "facility", "exterior", "person", "workplace", "product"]) {
    const sample = { ...LIBRARY[0], id: `x-${bad}`, subject: bad };
    let threw = false;
    try { assertLibrary([sample]); } catch { threw = true; }
    check(`「${bad}」は登録できない`, threw);
  }
  /** CSSが描けるものは、ライブラリに来る理由が無い */
  check("登録してよい主題は texture だけ", LIBRARY_SUBJECTS.length === 1 && LIBRARY_SUBJECTS[0] === "texture",
    LIBRARY_SUBJECTS.join(","));

  check("登録された素材は、すべて library / atmosphere",
    LIBRARY.every((x) => x.source === "library" && x.intent === "atmosphere"));

  /** **権利が分からない素材を本番に置かない**（ご指示） */
  for (const x of LIBRARY) {
    check(`「${x.id}」は権利が埋まっている`,
      Boolean(x.license.holder && x.license.terms && x.license.origin && x.license.checked));
    check(`「${x.id}」の実体がある`, fs.existsSync(relPath(x)), relPath(x));
  }
  /** 白い下地を敷くと帯の地を塗りつぶす。**地の上に重ねる素材でなくなる** */
  for (const x of LIBRARY) {
    const svg = fs.readFileSync(relPath(x), "utf8");
    check(`「${x.id}」は地を塗りつぶさない`, !/fill="#f{3,6}"/i.test(svg));
  }
  /** 素材の側から用途が広がらないこと。**「どの型でも使える」は書けない** */
  check("素材は、使ってよい型を必ず挙げている", LIBRARY.every((x) => x.directions.length > 0));
  check("1ページ1枚までが、素材の側に書いてある", LIBRARY.every((x) => x.usage.maxPerPage === 1));
  check("地の層にしか使わないと、素材の側に書いてある", LIBRARY.every((x) => x.usage.as === "background"));

  /** **代わりを探しにいかない。** 見つからなければ `undefined` で終わる */
  check("登録外の主題では、素材を返さない", findLibraryAsset("facility", "classic") === undefined);
  check("登録外の型では、素材を返さない", findLibraryAsset("texture", "technical") === undefined);
  check("挙げてある型でだけ、素材を返す", findLibraryAsset("texture", "classic")?.id === "wood-grain",
    findLibraryAsset("texture", "classic")?.id);
  /**
   * **型ごとに、地の目が変わる**（第8段階②）。
   * 前は紙の目1枚を4つの型で共有していた。**色も書体も余白も型ごとに変えているのに、
   * 地の目だけが全部同じ**という状態だったので、ここで見張る。
   */
  {
    const four = ["craft", "classic", "editorial", "luxury"].map((d) => findLibraryAsset("texture", d)?.id);
    check("老舗・落ち着き・読み物・静かの4型が、それぞれ別の地の目を持つ",
      new Set(four).size === 4 && four.every(Boolean), four.join(" / "));
  }
  /** **表に書いた素材が、実在すること。** 書き写した表はいつかずれる（D-197） */
  for (const x of LIBRARY) {
    check(`素材「${x.id}」の実体がある`, fs.existsSync(`site-template/public${x.path}`), x.path);
  }

  /**
   * **生成画像に到達する経路が無い**（ご指示）。
   * 語彙には `generated` があるが、**そこへ値を入れるコードはどこにも書かない。**
   */
  const srcs = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(f);
      else if (/\.ts$/.test(e.name)) srcs.push([f, fs.readFileSync(f, "utf8")]);
    }
  };
  walk("lib");
  const assigns = srcs.filter(([, t]) => /(?:source|as)\s*[:=]\s*"generated"/.test(t)).map(([f]) => f);
  check("生成画像に値を入れているコードが無い", assigns.length === 0, assigns.join(" "));

  /**
   * ── 実案件・全15型・全ページ ─────────────────
   * **いま何件採られているか**を、そのまま数える。
   * 0件は失敗ではない（原則①）。**気づかないうちに増えることだけが問題**なので、
   * 数を固定せず「どこで採られたか」を出して、変わったら目に入るようにする。
   */
  const seen = [];
  let pageCount = 0, generatedSeen = 0, evidenceLib = 0, bad = 0;
  for (const [name, file] of FIXTURES) {
    const p = load(file);
    const a = analyze(p);
    for (const d of DIRECTIONS) {
      for (const page of ["index", ...PAGES]) {
        const base = page === "index" ? composeTop(p, a, { direction: d.id }) : composePage(page, p, a, { direction: d.id });
        const secs = composeAssets(composeVisual(base, p, a, { direction: d.id }), p, a, { direction: d.id, page });
        pageCount++;
        const libs = secs.filter((s) => s.asset.source === "library");
        secs.forEach((s, i) => {
          if (s.asset.source !== "library") return;
          /** 隣の帯に雰囲気の素材があるか。**地の素材どうしを隣り合わせにしない** */
          const near = [secs[i - 1], secs[i + 1]].some(
            (n) => n && n.asset.intent === "atmosphere" && n.asset.source === "graphic");
          seen.push({ where: `${name}/${d.id}/${page}:${s.content}`, subject: s.asset.subject,
            emphasis: s.emphasis, peak: s.visual?.peak ?? "none", near, id: s.asset.library?.id });
        });
        /** **1ページ1枚まで** */
        if (libs.length > 1) bad++;
        for (const s of secs) {
          if (s.asset.source === "generated") generatedSeen++;
          if (s.asset.source === "library" && s.asset.intent !== "atmosphere") evidenceLib++;
          /** 採ったなら、どれを採ったかが残っていること */
          if (s.asset.source === "library" && !s.asset.library?.path) bad++;
        }
      }
    }
  }
  check("生成画像は、どの型のどのページにも出ない", generatedSeen === 0, String(generatedSeen));
  check("ライブラリが証拠の帯に入ることはない", evidenceLib === 0, String(evidenceLib));
  check("1ページ1枚を超えない・採ったものは記録されている", bad === 0, String(bad));
  console.log(`      いま採られているライブラリ素材：${pageCount}ページ中 ${seen.length}件（${(seen.length / pageCount * 100).toFixed(1)}%）`);
  if (seen.length) console.log(`      ${seen.slice(0, 5).map((x) => x.where).join("  ")}`);

  /**
   * ── 必要なときだけ選ばれているか（追加検証・ご指示）──────────
   *
   * 「0件」だけでは足りない（**仕組みが壊れていても0件になる**）。
   * かといって「採られた」だけでも足りない。
   * **要求のある帯だけで採られていること**を、実データで見る。
   */
  check("実データでも、要求のある帯では採られる", seen.length > 0, `${seen.length}件`);
  /** **枚数を増やす仕組みになっていないこと。** 採用は例外であって既定ではない */
  check("採用はごく一部のページにとどまる（1割未満）", seen.length / pageCount < 0.1,
    `${(seen.length / pageCount * 100).toFixed(1)}%`);
  /** **CSSが描ける主題には行かない。** 行っていたら「graphic で満たせるのに使った」ことになる */
  check("採られた帯の主題は、すべて texture", seen.every((x) => x.subject === "texture"),
    [...new Set(seen.map((x) => x.subject))].join(","));
  /** **地の素材どうしを隣り合わせにしない**（第2段階と同じ規則） */
  check("採られた帯の隣に、雰囲気の graphic は無い", seen.every((x) => !x.near),
    seen.filter((x) => x.near).map((x) => x.where).join(" "));
  /** **控えめに置くと決めた帯には置かない** */
  check("控えめな帯には置かない", seen.every((x) => x.emphasis !== "quiet"),
    seen.filter((x) => x.emphasis === "quiet").map((x) => x.where).join(" "));

  /**
   * ── 素材が無ければ `none` になるか（追加検証③）───────────
   *
   * **登録簿から1枚抜いて、同じ構成をもう一度組む。**
   * 代わりを探しにいかないこと・空いた帯を埋めにいかないことを、
   * **実データの構成そのもので**確かめる。
   */
  {
    const p = load(FIXTURES[0][1]);
    const a = analyze(p);
    const build = (dir, page) => {
      const base = composePage(page, p, a, { direction: dir });
      return composeAssets(composeVisual(base, p, a, { direction: dir }), p, a, { direction: dir, page });
    };
    const before = build("product", "company");
    check("実データで、素材を求める帯に採られている",
      before.some((s) => s.asset.source === "library" && s.content === "history"),
      before.filter((s) => s.asset.intent === "atmosphere").map((s) => `${s.content}:${s.asset.source}`).join(" "));

    const kept = LIBRARY.splice(0, LIBRARY.length);
    let after;
    try { after = build("product", "company"); } finally { LIBRARY.push(...kept); }
    check("素材が1枚も無ければ、同じ構成が none のまま成立する",
      after.every((s) => s.asset.source !== "library")
      && after.length === before.length
      && after.every((s, i) => s.content === before[i].content && s.surface === before[i].surface
        && s.emphasis === before[i].emphasis && s.motif === before[i].motif));
    /** 戻せていること。**試験が次の試験を壊さない** */
    check("登録簿を元に戻せている", LIBRARY.length === kept.length);

    /** **挙げていない型では、要求があっても採らない** */
    check("型が挙げていなければ、要求があっても採らない",
      build("technical", "company").every((s) => s.asset.source !== "library"));

    /**
     * **graphic で満たせているページには行かない。**
     * 老舗（craft）と落ち着き（classic）は帯の地そのものが紙なので、
     * **空いた帯が必ず紙の帯の隣になり、ここまで降りてこない**（実測）。
     */
    for (const dir of ["craft", "classic"]) {
      const got = build(dir, "company");
      const lib = got.filter((s) => s.asset.source === "library");
      const paper = got.filter((s) => s.asset.intent === "atmosphere" && s.asset.source === "graphic");
      check(`${dir}：紙の地で足りているので、ライブラリに降りてこない`,
        lib.length === 0 && paper.length > 0, `library ${lib.length} / graphic ${paper.length}`);
    }
  }

  /** ── 描き方（site.css）───────────────────── */
  {
    const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ sel: m[1].trim(), body: m[2].trim() }))
      .filter((r) => r.sel.includes('data-asset-source="library"'));
    const draws = rules.filter((r) => /content:/.test(r.body));
    check("ライブラリは地の層として敷く（::before の背景）",
      draws.length > 0 && draws.every((r) => /::before/.test(r.sel) && /background-image/.test(r.body)));
    check("ライブラリは地紋のある帯に敷かない",
      draws.every((r) => r.sel.includes(":not([data-motif])")));
    check("ライブラリに動きを付けていない", rules.every((r) => !/animation|transition/.test(r.body)));
    const print = bare.slice(bare.indexOf("@media print"));
    check("印刷ではライブラリを消す", /data-asset-source="library"[\s\S]{0,120}display:\s*none/.test(print));
    /** **`<img>` にしない。** 画面でもHTMLでも、実績写真と取り違えられないため */
    /** **注記は外して読む。** 説明文の中の `<img>` を数えて赤くなったことがある（D-297） */
    const band = fs.readFileSync("site-template/src/components/Band.astro", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    check("ライブラリを <img> で出していない", !/<img/.test(band) && /--asset-image/.test(band));
  }
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
