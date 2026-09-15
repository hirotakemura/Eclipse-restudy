/**
 * KOBO — 文字の役割
 *
 * **文字を「本文表示」としてだけ扱わない**（ご指示§9）。
 *
 * 【なぜ要るか・実測】
 * いまの見出しは `h1 / h2 / h3 / .lead` の4つしかなく、書き出した画面で測ると
 * 文字の大きさは **1440pxで 55 / 35 / 27 / 21 / 19 / 17 の3段**しか効いていない。
 * **55（最初の画面）の次が 35 で、その間が無い。**
 * 最初の画面を降りた瞬間、ページは「27pxの見出し＋17pxの本文」だけで最後まで進む。
 *
 * **スマホではもっと悪い。390pxで 27 / 24 / 21 / 20 / 16。**
 * 最初の画面（27px）と見出し（24px）の差が**3px**で、階層がほぼ消えている。
 * `clamp()` の下限を「直す前のスマホの値」に合わせたため（D-239）、
 * **小さい画面では何も変わらないようにしてしまった。**
 *
 * ここで直すのは、**段の数**である。装飾ではない。
 * 写真が1枚も無い案件でも、**文字だけで画面の山を作れる**ようにするのが目的
 * （ご指示§10：写真0枚でも高品質にする）。
 *
 * 【`maxChars` が要る理由】
 * 大きく組んでよいかは、**文字数で決まる。**
 * 「案件により相談」を大きな数字として出していた事故（D-251）と同じ構図で、
 * **長い文字列を巨大に組むと、ただ読みにくいだけになる。**
 * 語彙の側に上限を持たせ、材料が越えていたら一段下の役割に落とす。
 *
 * 【この段階では画面を変えない】
 * ここは語彙の定義だけで、CSSにも `Band.astro` にも接続していない（Phase 2）。
 * 接続は Phase 4（`composeVisual()`）で行う。
 */

export type TypeRoleId =
  | "display"      // 画面の山。1ページに1つまで
  | "heroTitle"    // 最初の画面の見出し
  | "statement"    // 会社の一言。写真が無い案件の山になる
  | "numeric"      // 判断に使う値（±0.005mm・標準7日）
  | "sectionTitle" // 帯の見出し
  | "quote"        // 人の言葉
  | "lead"         // 導入の一文
  | "body"         // 本文
  | "technical"    // 型番・規格。**読み違えられない**ことが第一
  | "caption"      // 写真の説明
  | "label";       // 項目名（対応精度／最短納期）

export interface TypeRole {
  id: TypeRoleId;
  label: string;
  note: string;
  /**
   * `clamp(min, vw, max)` をそのまま作れる形で持つ（px と vw）。
   * **`min` は小さい画面での実寸**であり、ここが階層の下限を決める。
   */
  min: number;
  vw: number;
  max: number;
  weight: number;
  leading: number;
  tracking: string;
  /** 見出しの書体（`--font-head`）を使うか */
  head: boolean;
  /**
   * この役割で組んでよい文字数の上限。**0 は制限なし。**
   * 越えたら一段下の役割に落とす（`stepDown`）。
   */
  maxChars: number;
}

/**
 * **段は上から下へ、必ず小さくなる。**（試験で毎回確かめる）
 * 小さい画面（390px）でも順序が崩れないよう、`min` も単調に減らしてある。
 */
export const TYPE_ROLES: TypeRole[] = [
  { id: "display",      label: "画面の山",   note: "1ページに1つまで。短い語だけ。写真が無くてもここで山が作れる",
    min: 40, vw: 8.0, max: 104, weight: 700, leading: 1.12, tracking: "-.01em", head: true,  maxChars: 24 },
  { id: "heroTitle",    label: "最初の見出し", note: "最初の画面の見出し。会社名か、引き受けている仕事の一言",
    min: 30, vw: 5.0, max: 64,  weight: 700, leading: 1.25, tracking: ".005em", head: true,  maxChars: 40 },
  { id: "numeric",      label: "値",         note: "判断に使う値。**本文に埋めない**（ご指示§5）。短く言い切れるものだけ",
    min: 28, vw: 4.4, max: 56,  weight: 700, leading: 1.15, tracking: "0",      head: true,  maxChars: 14 },
  { id: "statement",    label: "一言",       note: "会社を一言で言う文。**写真0枚の案件では、これが山になる**",
    min: 24, vw: 3.4, max: 44,  weight: 700, leading: 1.45, tracking: ".01em",  head: true,  maxChars: 60 },
  /**
   * **実測：帯の見出し 28px ÷ 本文 17px ＝ 1.65倍、横置きの帯では 1.18倍**だった（第7段階）。
   * 11の役割を持っているのに、**画面に出ていた段は実質3つ**で、
   * 「見出し → 本文」がほとんど同じ大きさに見えていた。段を1つ上げる。
   *
   * 【スマホは上げられなかった】★
   * **`min` はスマホでの実寸である**（390pxでは `vw` が効かず `min` に張り付く）。
   * PCが 1.65 → 1.94 になったのに対し、スマホは **1.31 → 1.38 にしか動かない。**
   * そこで `min` を 24 に上げたら、**試験が落ちた**——
   * スマホの段は `display 40 / heroTitle 30 / numeric 28 / statement 24` と詰まっていて、
   * **24 にすると「山（statement）」と「章の見出し」が同じ大きさになる。**
   * 山を上げて逃げる道は取らない（「全部大きくする」になる）。
   * **スマホの段には、いま空きが無い。** ここは別に手当てが要る宿題として残す。
   */
  { id: "sectionTitle", label: "帯の見出し",  note: "帯の見出し。いまの h2 にあたる",
    min: 22, vw: 2.6, max: 38,  weight: 700, leading: 1.4,  tracking: ".01em",  head: true,  maxChars: 0 },
  { id: "quote",        label: "引用",       note: "人の言葉。本文より大きく、見出しより小さく",
    min: 19, vw: 1.9, max: 26,  weight: 600, leading: 1.75, tracking: ".01em",  head: false, maxChars: 0 },
  /**
   * **実測：導入が 17〜19px で、本文（17px）と見分けがつかなかった**（第7段階）。
   * しかも色が `--ink-soft`（6.0:1）で、**ページでいちばん薄い文字**だった。
   * 導入はページの2文目で、**本文より重い。** 大きさで段を作り、色は本文へ戻す。
   */
  { id: "lead",         label: "導入",       note: "帯の頭に置く一文。本文よりはっきり大きい",
    min: 18, vw: 1.7, max: 25,  weight: 400, leading: 1.75, tracking: ".01em",  head: false, maxChars: 0 },
  { id: "body",         label: "本文",       note: "既定。案件ごとの文字サイズ（17/18/20px）がそのまま効く",
    min: 16, vw: 1.2, max: 17,  weight: 400, leading: 1.85, tracking: ".01em",  head: false, maxChars: 0 },
  /**
   * **型番は読み違えられてはいけない。**
   * 「S700X1」の 0 と O、1 と l が見分けられる必要がある。
   * 本文と同じ書体で小さく組むと、現場で照合するときに間違える。
   */
  { id: "technical",    label: "型番・規格",  note: "型番・規格。**読み違えられないこと**が第一。字面を詰めない",
    min: 15, vw: 1.1, max: 16,  weight: 600, leading: 1.6,  tracking: ".04em",  head: false, maxChars: 0 },
  { id: "caption",      label: "説明",       note: "写真・表の説明",
    min: 14, vw: 1.0, max: 15,  weight: 400, leading: 1.7,  tracking: ".01em",  head: false, maxChars: 0 },
  { id: "label",        label: "項目名",      note: "値の上に置く項目名。**字間を空けて、値と役割を分ける**",
    min: 12, vw: 0.9, max: 14,  weight: 600, leading: 1.5,  tracking: ".1em",   head: false, maxChars: 0 },
];

export const getTypeRole = (id: string | undefined): TypeRole =>
  TYPE_ROLES.find((t) => t.id === id) ?? TYPE_ROLES.find((t) => t.id === "body")!;

/** その幅での実寸（px）。試験と検証で使う。CSSは `clamp()` に任せる */
export const sizeAt = (role: TypeRole, viewport: number): number =>
  Math.round(Math.min(Math.max(role.min, (role.vw * viewport) / 100), role.max));

/** `clamp()` の文字列。CSS変数に流し込む形（Phase 4 で使う） */
export const clampOf = (role: TypeRole): string =>
  `clamp(${role.min}px, ${role.vw}vw, ${role.max}px)`;

/**
 * **文字数が上限を越えたら、一段下の役割に落とす。**
 *
 * 「案件により相談」を大きな数字として出していた事故（D-251）と同じ形で、
 * **長い文字列を巨大に組むと、読みにくいだけで何も言っていない画面になる。**
 * 判定に使う値と、実際に描くものを揃える（D-251の教訓）。
 */
export function fit(id: TypeRoleId, text: string): TypeRole {
  let i = TYPE_ROLES.findIndex((t) => t.id === id);
  if (i < 0) return getTypeRole("body");
  const len = (text ?? "").trim().length;
  while (TYPE_ROLES[i]!.maxChars > 0 && len > TYPE_ROLES[i]!.maxChars && i < TYPE_ROLES.length - 1) i++;
  return TYPE_ROLES[i]!;
}
