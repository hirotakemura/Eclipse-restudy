/**
 * KOBO — サイトの見た目（テーマ）
 *
 * **テンプレートは1つしか持たない**（D-096）。コードを分けずに見た目を変えるため、
 * 配色・書体・雰囲気・レイアウトを**案件データとして持つ。**
 *
 * ここが単一の正。KOBOの選択画面も、Astroテンプレートの出力も、このファイルから作る。
 * 片方だけ増やすと、選べるのに反映されない選択肢ができる。
 */

import { HEROES as HERO_LIST } from "./design/system/hero.ts";
import { DIRECTIONS, migrateDirection } from "./design/direction.ts";

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
  /** 枠線。装飾なので薄くてよい */
  line: string;
  /**
   * 表の罫線。**`line` より濃い。**
   *
   * 「写真が無くても、文字と表だけで読める」と謳っている以上、
   * その表の罫線が見えないのは通らない。対応材質・設備一覧は調達担当者が最も見る部分で、
   * ここだけは背景に対して 3:1 を確保する（`contrast.test.mjs` で検査）。
   *
   * **基準にするのは薄い背景（`bgSoft`）のほう**（D-191）。
   * 既定の表では**行見出しの列が薄い背景**になっており、その罫線は薄地に接している。
   * スマホで表を縦積みにしたときも同じ。
   * 白地だけで測っていたので、**そこでは 2.8:1 まで落ちていた。**
   */
  tableLine: string;
}

export const PALETTES: Palette[] = [
  {
    id: "ai", label: "藍", note: "製造業の既定。堅い・実直。青は業種を問わず外さない",
    accent: "#10456f", accentDark: "#0b3252", accentSoft: "#e8eff5",
    ink: "#17202a", inkSoft: "#5b6673", bg: "#ffffff", bgSoft: "#f4f6f8", line: "#d9dee4", tableLine: "#898c90",
  },
  {
    id: "hagane", label: "鋼", note: "金属加工・機械。無彩色に近く、設備写真が映える",
    accent: "#3d4852", accentDark: "#272f36", accentSoft: "#eceef0",
    ink: "#1c1f22", inkSoft: "#5d646b", bg: "#ffffff", bgSoft: "#f3f4f5", line: "#dcdee0", tableLine: "#8a8b8c",
  },
  {
    id: "fukamidori", label: "深緑", note: "食品・環境・農業まわり。清潔さと落ち着き",
    accent: "#1f6f4a", accentDark: "#17573a", accentSoft: "#e6f1ea",
    ink: "#1b241f", inkSoft: "#586460", bg: "#ffffff", bgSoft: "#f3f7f4", line: "#d8e0da", tableLine: "#898e8a",
  },
  {
    id: "enji", label: "臙脂", note: "老舗・職人仕事。和の色。創業が古い会社に効く",
    accent: "#8d2f36", accentDark: "#6d2329", accentSoft: "#f6eaea",
    ink: "#231a1a", inkSoft: "#6b5b5b", bg: "#fffdfc", bgSoft: "#f8f4f2", line: "#e3d9d6", tableLine: "#918b89",
  },
  {
    id: "sumi", label: "墨", note: "設計・デザイン寄り。写真が少なくても締まる",
    accent: "#1d1d1d", accentDark: "#000000", accentSoft: "#ededed",
    ink: "#141414", inkSoft: "#5e5e5e", bg: "#ffffff", bgSoft: "#f4f4f4", line: "#dcdcdc", tableLine: "#8b8b8b",
  },
  {
    id: "kohaku", label: "琥珀",
    // 【2026-09-13 修正】#b06a10 はリンク・ボタンでWCAG AA（4.5:1）を落としていた
    note: "生活サービス・住宅まわり。硬すぎず、親しみが要るとき。※黄〜橙は加齢で見分けづらくなる色",
    accent: "#94580c", accentDark: "#7a4809", accentSoft: "#fbefdd",
    ink: "#241d14", inkSoft: "#6a6055", bg: "#fffdfa", bgSoft: "#f8f4ee", line: "#e6ddd0", tableLine: "#908a83",
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
    id: "maru", label: "丸ゴシック",
    // **選べるのに反映されない選択肢を作らない**（D-138）。出ない環境があるなら、そう書く
    note: "やわらかい。ただし丸ゴシックで出るのは iPhone・Mac のみで、Windows・Androidでは普通のゴシック体になります",
    body: '"Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif',
    heading: '"Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif',
    webfont: null,
  },
  {
    id: "noto", label: "Noto Sans JP（Webフォント）",
    // 実測（2026-09-13）：製造業サイトの典型的な本文で 26ファイル・約497KB
    note: "★どの端末でも同じ見た目になる。ただし約500KB・26ファイルを追加で読み込むため表示が遅くなり、Googleへの依存が1つ増える",
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
  /**
   * 帯の縦余白（`--section`）を一段上げた（D-239）。44/52/64 → 60/72/88。
   * **章が変わったことが、線ではなく余白で分かる**ようにするため。
   *
   * 一度 72/88/108 まで上げたが、**画面を見て戻した。**
   * 我々の帯は中身が薄い（札4つ、数字3つ）ので、余白だけが増えて間延びした。
   * 工業系の参考サイトが100px前後を取れるのは、**帯の中身が大きいから**である。
   * 余白は中身に見合う分だけ取る。
   * スマホでは別に詰めている（site.css の `@media (width<=720px)`）。
   */
  { id: "katai", label: "かたい", note: "角ばる・線が太い。図面や仕様書に近い印象", radius: "0px", leading: "1.75", tracking: "0.01em", lineWidth: "2px", section: "60px" },
  { id: "futsu", label: "標準", note: "既定。かたすぎず、やわらかすぎず", radius: "8px", leading: "1.85", tracking: "0.01em", lineWidth: "1px", section: "72px" },
  { id: "yawaraka", label: "やわらかい", note: "角丸・線が薄い・行間広め。個人のお客様向けに", radius: "16px", leading: "2.0", tracking: "0.02em", lineWidth: "1px", section: "88px" },
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

/**
 * ファーストビュー（最初の画面）の型。
 *
 * **定義は `lib/design/system/hero.ts` が正。ここでは読み込むだけ**（D-201）。
 * 直す前は3つしか無く、写真ゼロの会社では実質2択だった。
 */
export { HEROES, type HeroStyle, type HeroId } from "./design/system/hero.ts";

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

/**
 * 本文の文字サイズ。
 *
 * **読み手は60代前後の社長と調達担当者**（docs/06）。若い人向けのサイトではない。
 *
 * 何pxが正しいかの一次根拠（JIS S 0032）は未入手で、**推測で既定を決めない。**
 * 代わりに、**第2回取材で実物を並べて、社長ご本人の端末・ご本人の目で選んでいただく**
 * （取材が2回になったので、その場がある・D-147）。
 * 3段階に留めるのは時間の都合ではなく、17→18→20は並べれば違いが分かるが、
 * 17.5pxを挟むと**見せても選べない**から。
 */
export const TEXT_SIZES: Choice[] = [
  { id: "normal", label: "標準（17px）", note: "既定。PCでの一般的な本文" },
  { id: "large", label: "大きめ（18px）", note: "紙の資料に慣れた方に。迷ったらこちら" },
  { id: "xlarge", label: "かなり大きい（20px）", note: "お客様が高齢の方中心のとき" },
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
  textSize: string;
  nav: string;
  hero: string;
  sections: string;
  headings: string;
  tables: string;
  /**
   * 選ばれた**型（方向性）**。
   *
   * 段階1までは保存していなかった。9軸の値だけを持ち、
   * 「どの型を押したか」は `matchPreset()` で逆算していたので、
   * **1軸でも直すと「型を選んだ」という事実が消えていた**（docs/21 第3章）。
   *
   * 型は9軸の組み合わせの別名ではなく、**この会社をどう見せるかの方向性**である。
   * 配色を変えても方向性は変わらないので、別に持つ（D-187）。
   */
  direction?: string;
}

export const DEFAULT_THEME: Theme = {
  palette: "ai", font: "gothic", mood: "futsu", textSize: "normal",
  nav: "standard", hero: "headline", sections: "line", headings: "plain", tables: "all",
  direction: "hyojun",
};

/**
 * 本文の文字サイズと、それに応じた1行の長さ。
 *
 * **1行が58.8文字あった**（本文幅1000px ÷ 17px）。長すぎると、行の折り返しで
 * 次の行の頭を見失う。60代の読み手ではとくに起きる。
 * 1行の長さは em で持つので、**文字を大きくしたら行も長くなる、を避けられる。**
 */
const TEXT_SIZE_VALUES: Record<string, { size: string; measure: string }> = {
  normal: { size: "17px", measure: "40em" },
  large: { size: "18px", measure: "38em" },
  xlarge: { size: "20px", measure: "34em" },
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
 * **型が選んだ最初の画面を、既定値で上書きしない**（D-275）。
 *
 * 実測で見つけた。汎用の6つの型は `heroes` の先頭に `type`（余白と文字だけ）や
 * `photo` を置いているのに、**7つの型すべてで `headline` が出ていた。**
 *
 * 原因は `resolveTheme` が `DEFAULT_THEME`（`hero: "headline"`）を先に敷いて、
 * **型を一度も見ないこと。** 型の好みが効くのは、お客様が型のボタンを押して
 * 9軸がまとめて書き込まれたときだけで、**型だけ指定した案件では効かなかった。**
 *
 * 「型を選んでも同じページになる」の、いちばん小さな実例である。
 * **お客様が明示的に選んだ `hero` は、いままでどおり最優先で尊重する。**
 */
function heroFromDirection(raw: any): Partial<Theme> {
  if (!raw || typeof raw.hero === "string") return {};       // 選ばれていれば触らない
  if (typeof raw.direction !== "string") return {};          // 型が無ければ触らない
  const d = DIRECTIONS.find((x) => x.id === raw.direction);
  if (!d) return {};
  // **写真ゼロでも成立するものを選ぶ。** 写真が要る型は、材料が揃ってから
  const hero = d.heroes.find((h) => HERO_LIST.find((x) => x.id === h)?.worksWithoutPhotos) ?? d.heroes[0];
  return hero ? { hero } : {};
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

/**
 * 型（プリセット）。
 *
 * **`lib/design/direction.ts` から作る。ここで書き写さない**（D-201）。
 * 別々に持つと必ず食い違う（D-197で学んだとおり）。
 *
 * 押せば9軸がまとめて決まる。そこから1軸だけ直す、という使い方を想定している。
 */
export const PRESETS: Preset[] = DIRECTIONS.map((d) => ({
  id: d.id,
  label: d.label,
  note: d.note,
  theme: {
    ...d.axes,
    // 写真ゼロでも成立するものを既定にする。写真が要る型は、材料が揃ってから選ぶ
    hero: d.heroes.find((h) => HERO_LIST.find((x) => x.id === h)?.worksWithoutPhotos) ?? d.heroes[0] ?? "headline",
    direction: d.id,
  } as Theme,
}));

/** そのプランで選べる型だけ。**製造業の型を汎用の商談で見せない**（D-198） */
export const presetsFor = (plan: "manufacturing" | "general" | undefined): Preset[] =>
  PRESETS.filter((p) => (DIRECTIONS.find((d) => d.id === p.id)?.plan ?? "manufacturing") === (plan ?? "manufacturing"));

/**
 * どの型が選ばれているか。
 *
 * **保存された `direction` を正とする。** 配色や書体を1つ直しても、
 * 「精密加工の型を選んだ」という事実は消えない。
 * 古いデータには `direction` が無いので、そのときだけ9軸から逆算する。
 */
export function matchPreset(
  theme: Partial<Theme> | undefined,
  plan: "manufacturing" | "general" = "manufacturing",
): string | null {
  const t = { ...migrateLayout(theme), ...(theme ?? {}) };
  if (t.direction) {
    // 古いID（seimitsu など）は新しいIDに読み替える（D-201）。取材済みの案件を壊さない
    const migrated = migrateDirection(t.direction, plan);
    if (PRESETS.some((p) => p.id === migrated)) return migrated;
  }
  /**
   * 型の保存を始める前のデータには、配色・書体・雰囲気しか無い。
   * **9軸すべてで照合すると、既定値との差で必ず外れる**（中原設備がそうだった）。
   * 古いデータが実際に持っている3つだけで照合する。
   * 3つの組み合わせは型ごとに重ならないようにしてある。
   */
  const full = { ...DEFAULT_THEME, ...t };
  return (
    presetsFor(plan).find((p) =>
      (["palette", "font", "mood"] as const).every((k) => p.theme[k] === full[k]),
    )?.id ?? null
  );
}

export function resolveTheme(
  theme: Partial<Theme> | undefined,
  plan: "manufacturing" | "general" = "manufacturing",
) {
  const t = { ...DEFAULT_THEME, ...migrateLayout(theme), ...heroFromDirection(theme), ...(theme ?? {}) };
  // 知らないIDが入っていても落とさない。既定に戻す
  const pick = <T extends { id: string }>(list: T[], id: string, fallback: T): T =>
    list.find((x) => x.id === id) ?? fallback;
  return {
    id: t,
    palette: pick(PALETTES, t.palette, PALETTES[0]!),
    font: pick(FONTS, t.font, FONTS[0]!),
    mood: pick(MOODS, t.mood, MOODS[1]!),
    textSize: pick(TEXT_SIZES, t.textSize, TEXT_SIZES[0]!),
    nav: pick(NAVS, t.nav, NAVS[0]!),
    hero: pick(HERO_LIST, t.hero, HERO_LIST[0]!),
    sections: pick(SECTIONS, t.sections, SECTIONS[0]!),
    headings: pick(HEADINGS, t.headings, HEADINGS[0]!),
    tables: pick(TABLES, t.tables, TABLES[0]!),
    /** 型（方向性）。古いデータでは9軸から逆算する */
    direction: migrateDirection(matchPreset(theme, plan) ?? undefined, plan),
  };
}

/** テンプレートの :root に流し込むCSS変数 */
export function themeVars(theme: Partial<Theme> | undefined): string {
  const { palette: p, font: f, mood: m, textSize } = resolveTheme(theme);
  const t = TEXT_SIZE_VALUES[textSize.id] ?? TEXT_SIZE_VALUES.normal!;
  return [
    `--accent:${p.accent}`, `--accent-dark:${p.accentDark}`, `--accent-soft:${p.accentSoft}`,
    `--ink:${p.ink}`, `--ink-soft:${p.inkSoft}`, `--bg:${p.bg}`, `--bg-soft:${p.bgSoft}`,
    `--line:${p.line}`, `--table-line:${p.tableLine}`,
    `--font-body:${f.body}`, `--font-head:${f.heading}`,
    `--font-size:${t.size}`, `--measure:${t.measure}`,
    `--radius:${m.radius}`, `--leading:${m.leading}`, `--tracking:${m.tracking}`,
    `--line-width:${m.lineWidth}`, `--section:${m.section}`,
  ].join(";");
}
