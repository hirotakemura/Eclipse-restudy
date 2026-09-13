/**
 * KOBO — サイトの見た目（テーマ）
 *
 * **テンプレートは1つしか持たない**（D-096）。コードを分けずに見た目を変えるため、
 * 配色・書体・雰囲気・レイアウトを**案件データとして持つ。**
 *
 * ここが単一の正。KOBOの選択画面も、Astroテンプレートの出力も、このファイルから作る。
 * 片方だけ増やすと、選べるのに反映されない選択肢ができる。
 */

export interface Palette {
  id: string;
  label: string;
  /** どういう会社に向くか。取材のその場で選ぶので、判断材料を書いておく */
  note: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  ink: string;
  inkSoft: string;
  bg: string;
  bgSoft: string;
  line: string;
}

export const PALETTES: Palette[] = [
  {
    id: "ai", label: "藍", note: "製造業の既定。堅い・実直。青は業種を問わず外さない",
    accent: "#10456f", accentDark: "#0b3252", accentSoft: "#e8eff5",
    ink: "#17202a", inkSoft: "#5b6673", bg: "#ffffff", bgSoft: "#f4f6f8", line: "#d9dee4",
  },
  {
    id: "hagane", label: "鋼", note: "金属加工・機械。無彩色に近く、設備写真が映える",
    accent: "#3d4852", accentDark: "#272f36", accentSoft: "#eceef0",
    ink: "#1c1f22", inkSoft: "#5d646b", bg: "#ffffff", bgSoft: "#f3f4f5", line: "#dcdee0",
  },
  {
    id: "fukamidori", label: "深緑", note: "食品・環境・農業まわり。清潔さと落ち着き",
    accent: "#1f6f4a", accentDark: "#17573a", accentSoft: "#e6f1ea",
    ink: "#1b241f", inkSoft: "#586460", bg: "#ffffff", bgSoft: "#f3f7f4", line: "#d8e0da",
  },
  {
    id: "enji", label: "臙脂", note: "老舗・職人仕事。和の色。創業が古い会社に効く",
    accent: "#8d2f36", accentDark: "#6d2329", accentSoft: "#f6eaea",
    ink: "#231a1a", inkSoft: "#6b5b5b", bg: "#fffdfc", bgSoft: "#f8f4f2", line: "#e3d9d6",
  },
  {
    id: "sumi", label: "墨", note: "設計・デザイン寄り。写真が少なくても締まる",
    accent: "#1d1d1d", accentDark: "#000000", accentSoft: "#ededed",
    ink: "#141414", inkSoft: "#5e5e5e", bg: "#ffffff", bgSoft: "#f4f4f4", line: "#dcdcdc",
  },
  {
    id: "kohaku", label: "琥珀", note: "生活サービス・住宅まわり。硬すぎず、親しみが要るとき",
    accent: "#b06a10", accentDark: "#8a520a", accentSoft: "#fbefdd",
    ink: "#241d14", inkSoft: "#6a6055", bg: "#fffdfa", bgSoft: "#f8f4ee", line: "#e6ddd0",
  },
];

export interface FontSet {
  id: string;
  label: string;
  note: string;
  body: string;
  heading: string;
  /** Google Fonts を使う場合の <link> のURL。使わないなら null */
  webfont: string | null;
}

/**
 * **既定はシステムフォント。** 追加の読み込みが無いので速く、外部への依存も増えない。
 * Webフォントを選ぶと表示が少し遅くなり、Google への依存が1つ増える。**その代償は画面に書く。**
 */
export const FONTS: FontSet[] = [
  {
    id: "gothic", label: "ゴシック体", note: "既定。読みやすく、業種を問わない",
    body: 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
    heading: 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
    webfont: null,
  },
  {
    id: "mincho", label: "明朝体", note: "老舗・信頼。創業が古い会社、代表挨拶が主役の会社に",
    body: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif',
    heading: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif',
    webfont: null,
  },
  {
    id: "mixed", label: "見出しだけ明朝", note: "本文は読みやすく、見出しで格を出す。迷ったらこれ",
    body: 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
    heading: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif',
    webfont: null,
  },
  {
    id: "maru", label: "丸ゴシック", note: "やわらかい。生活サービス・個人のお客様が多い会社に",
    body: '"Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif',
    heading: '"Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif',
    webfont: null,
  },
  {
    id: "noto", label: "Noto Sans JP（Webフォント）", note: "★どの端末でも同じ見た目になる。ただし表示が少し遅くなり、Googleへの依存が1つ増える",
    body: '"Noto Sans JP", system-ui, sans-serif',
    heading: '"Noto Sans JP", system-ui, sans-serif',
    webfont: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap",
  },
];

export interface Mood {
  id: string;
  label: string;
  note: string;
  radius: string;
  leading: string;
  /** 見出しの字間 */
  tracking: string;
  /** 罫線の強さ */
  lineWidth: string;
  /** 章と章のあいだ */
  section: string;
}

export const MOODS: Mood[] = [
  { id: "katai", label: "かたい", note: "角ばる・線が太い。図面や仕様書に近い印象", radius: "0px", leading: "1.75", tracking: "0.01em", lineWidth: "2px", section: "44px" },
  { id: "futsu", label: "標準", note: "既定。かたすぎず、やわらかすぎず", radius: "8px", leading: "1.85", tracking: "0.01em", lineWidth: "1px", section: "52px" },
  { id: "yawaraka", label: "やわらかい", note: "角丸・線が薄い・行間広め。個人のお客様向けに", radius: "16px", leading: "2.0", tracking: "0.02em", lineWidth: "1px", section: "64px" },
];

export interface Choice {
  id: string;
  label: string;
  note: string;
}

/**
 * メニューの置き方。
 *
 * **旧 `layout` 軸は、メニューの置き方とファーストビューを1つに混ぜていた。**
 * そのため「左メニュー、かつ写真を大きく」が選べなかった。別の軸に分ける（D-141）。
 */
export const NAVS: Choice[] = [
  { id: "standard", label: "上に横並び", note: "いちばん無難。ページ数が多くなければこれ" },
  { id: "sidebar", label: "左メニュー", note: "ページ数が多い会社向け。技術資料のように読ませる（スマホでは上に出る）" },
];

export interface HeroStyle extends Choice {
  /** この型を選ぶのに要るデータ。無いときは選ばせない */
  needs?: "photo" | "spec";
}

/**
 * ファーストビュー（最初の画面）の型。
 *
 * **`spec` は、写真が揃わない会社のための型。**
 * 調達担当者が見ているのは「材質×加工法×条件」であって、綺麗な写真ではない（docs/06）。
 * 写真が1枚も無くても、対応範囲を最初の画面に置けば判断してもらえる。
 */
export const HEROES: HeroStyle[] = [
  { id: "headline", label: "見出しを先に", note: "既定。写真が無くても成立する" },
  { id: "photo", label: "写真を大きく", note: "外観や現場の写真が良いときに。写真が無いと間延びする", needs: "photo" },
  { id: "spec", label: "対応範囲を先に", note: "材質・加工法・ロット・納期を最初の画面に置く。写真が無い会社ほど効く", needs: "spec" },
];

/** 章と章の区切り方 */
export const SECTIONS: Choice[] = [
  { id: "line", label: "罫線", note: "既定。すっきりする" },
  { id: "alternate", label: "背景を交互に", note: "章の切れ目がはっきりする。ページが長い会社に" },
  { id: "space", label: "余白だけ", note: "静か。文章が主役のとき" },
];

/** 見出しの飾り */
export const HEADINGS: Choice[] = [
  { id: "plain", label: "飾らない", note: "既定" },
  { id: "rule", label: "左に罫", note: "工業系で見慣れた形。締まって見える" },
  { id: "underline", label: "下線", note: "やわらかい。読み物寄りのとき" },
  { id: "band", label: "背景帯", note: "強い。章が多いページで迷子になりにくい" },
];

/** 表の罫線。対応可能範囲・設備一覧は表が主役になる */
export const TABLES: Choice[] = [
  { id: "all", label: "全部に罫線", note: "既定。仕様書に近い" },
  { id: "horizontal", label: "横罫だけ", note: "軽く見える。項目が少ない表に" },
  { id: "stripe", label: "行を縞に", note: "行数が多い表で目が迷わない。設備一覧が長い会社に" },
];

export interface Theme {
  palette: string;
  font: string;
  mood: string;
  nav: string;
  hero: string;
  sections: string;
  headings: string;
  tables: string;
}

export const DEFAULT_THEME: Theme = {
  palette: "ai", font: "gothic", mood: "futsu",
  nav: "standard", hero: "headline", sections: "line", headings: "plain", tables: "all",
};

/**
 * 旧 `layout` 軸（standard / sidebar / wide）を、新しい2軸に読み替える。
 *
 * **すでに保存されている案件を壊さない。** 一度でも取材に使ったデータは作り直せない。
 */
function migrateLayout(raw: any): Partial<Theme> {
  if (!raw || typeof raw.layout !== "string") return {};
  if (raw.layout === "sidebar") return { nav: "sidebar", hero: "headline" };
  if (raw.layout === "wide") return { nav: "standard", hero: "photo" };
  return { nav: "standard", hero: "headline" };
}

/**
 * 型（プリセット）。
 *
 * **4軸を1つずつ選ぶのは、90分の取材では重い。**
 * 業種に合う組み合わせを先に用意しておき、押せば4つとも決まるようにする。
 * そこから1軸だけ直す、という使い方を想定している。
 */
export interface Preset {
  id: string;
  label: string;
  note: string;
  theme: Theme;
}

export const PRESETS: Preset[] = [
  {
    id: "hyojun", label: "標準", note: "迷ったらこれ。業種を問わず外さない",
    theme: { palette: "ai", font: "gothic", mood: "futsu", nav: "standard", hero: "headline", sections: "line", headings: "plain", tables: "all" },
  },
  {
    id: "seimitsu", label: "精密加工", note: "金属加工・機械部品。ページ数が多く、設備や仕様を読ませる会社",
    theme: { palette: "hagane", font: "mixed", mood: "katai", nav: "sidebar", hero: "spec", sections: "line", headings: "rule", tables: "stripe" },
  },
  {
    id: "shinise", label: "老舗・職人", note: "創業が古い会社。代表挨拶や沿革が効くとき",
    theme: { palette: "enji", font: "mincho", mood: "futsu", nav: "standard", hero: "headline", sections: "space", headings: "underline", tables: "horizontal" },
  },
  {
    id: "seiketsu", label: "食品・環境", note: "清潔さが問われる業種。工場の写真が主役になる",
    theme: { palette: "fukamidori", font: "gothic", mood: "futsu", nav: "standard", hero: "photo", sections: "alternate", headings: "band", tables: "all" },
  },
  {
    id: "seikatsu", label: "生活サービス", note: "個人のお客様が多い会社。住宅・設備・店舗",
    theme: { palette: "kohaku", font: "maru", mood: "yawaraka", nav: "standard", hero: "photo", sections: "alternate", headings: "underline", tables: "horizontal" },
  },
  {
    id: "sekkei", label: "設計・技術", note: "写真が少なくても締まる。図面や技術資料が中心の会社",
    theme: { palette: "sumi", font: "mixed", mood: "katai", nav: "sidebar", hero: "spec", sections: "line", headings: "rule", tables: "stripe" },
  },
];

/** いま選ばれている組み合わせが、どの型と一致するか。一致しなければ null */
export function matchPreset(theme: Partial<Theme> | undefined): string | null {
  const t = { ...DEFAULT_THEME, ...migrateLayout(theme), ...(theme ?? {}) };
  return (
    PRESETS.find((p) => (Object.keys(p.theme) as (keyof Theme)[]).every((k) => p.theme[k] === t[k]))?.id ?? null
  );
}

export function resolveTheme(theme: Partial<Theme> | undefined) {
  const t = { ...DEFAULT_THEME, ...migrateLayout(theme), ...(theme ?? {}) };
  // 知らないIDが入っていても落とさない。既定に戻す
  const pick = <T extends { id: string }>(list: T[], id: string, fallback: T): T =>
    list.find((x) => x.id === id) ?? fallback;
  return {
    id: t,
    palette: pick(PALETTES, t.palette, PALETTES[0]!),
    font: pick(FONTS, t.font, FONTS[0]!),
    mood: pick(MOODS, t.mood, MOODS[1]!),
    nav: pick(NAVS, t.nav, NAVS[0]!),
    hero: pick(HEROES, t.hero, HEROES[0]!),
    sections: pick(SECTIONS, t.sections, SECTIONS[0]!),
    headings: pick(HEADINGS, t.headings, HEADINGS[0]!),
    tables: pick(TABLES, t.tables, TABLES[0]!),
  };
}

/** テンプレートの :root に流し込むCSS変数 */
export function themeVars(theme: Partial<Theme> | undefined): string {
  const { palette: p, font: f, mood: m } = resolveTheme(theme);
  return [
    `--accent:${p.accent}`, `--accent-dark:${p.accentDark}`, `--accent-soft:${p.accentSoft}`,
    `--ink:${p.ink}`, `--ink-soft:${p.inkSoft}`, `--bg:${p.bg}`, `--bg-soft:${p.bgSoft}`, `--line:${p.line}`,
    `--font-body:${f.body}`, `--font-head:${f.heading}`,
    `--radius:${m.radius}`, `--leading:${m.leading}`, `--tracking:${m.tracking}`,
    `--line-width:${m.lineWidth}`, `--section:${m.section}`,
  ].join(";");
}
