/**
 * KOBO — 帯の余白
 *
 * **疎と密を交互に置く**（ご指示§7）。
 *
 * 【なぜ要るか・実測】
 * 書き出した画面を測ると、**帯の上余白は全帯で同一**だった。
 *
 *   1440px … 88px（`emphasis="quiet"` の帯だけ 52.8px）
 *   390px  … 40px（**全帯**）
 *
 * `--section` は「雰囲気」（かたい/標準/やわらかい）で決まる**案件ごとの1つの値**で、
 * 帯ごとには変わらない。つまり **「ここで息を置く」が、いまの仕組みでは書けない。**
 *
 * 余白の変化はビジュアルのリズムそのものなので、ここが一定だと、
 * **中身をどれだけ変えても単調に見える。**
 *
 * 【スマホでは、振れ幅を標準へ寄せる】
 * `vast` をそのまま当てると、1440pxで 88×2.4 = 211px になる。
 * これはPCでは「間」だが、**スマホでは画面の4分の1が空になる。**
 *
 * かといって `tight` をさらに詰めるのも違う。スマホの `--section` は 40px で、
 * 0.6倍なら 24px。ここをさらに詰めると**帯どうしがくっついて見える。**
 *
 * つまり絞るのではなく、**上にも下にも、振れ幅を標準（1.0）へ寄せる**が正しい。
 * 小さい画面では、余白は**差が分かる程度**でよい。
 *
 * 【倍率を下げた・実案件で測って】（D-299）
 * 最初は loose 1.5 ／ vast 2.4 にしていた。**実案件（松原精機）で測って下げた。**
 *
 *   山の帯　　余白 合計422px ／ 中身 417px　←　**余白のほうが大きい**
 *   帯と帯の間　最大 343px（vast の下 211 ＋ 次の帯の上 132）
 *   PCで「余白＞中身」の帯が 8本
 *
 * 倍率は帯1本ごとに掛かるが、**読む人が見るのは隣り合う2本の合計**である。
 * そこを見ていなかった。1.5倍のつもりが、画面では 264px の空白になっていた。
 *
 * これは D-239 で一度出した結論（「余白は中身に見合う分だけ取る。
 * 我々の帯は中身が薄いので、上げすぎると間延びする」）を、
 * **Phase 4 が測らずに踏み直したもの**である。だから戻す。
 *
 *   tight 0.6 ／ normal 1.0 ／ loose 1.2 ／ vast 1.6
 *
 * 4段の差は残る（88pxなら 53 / 88 / 106 / 141）。**リズムは消していない。**
 * `normal` は D-239 が画面を見て決めた値なので、**動かさない。**
 */

export type DensityId = "tight" | "normal" | "loose" | "vast";

export interface Density {
  id: DensityId;
  label: string;
  note: string;
  /** `--section` に掛ける倍率（PC） */
  scale: number;
  /** スマホ（<=720px）での倍率。**標準（1.0）へ寄せる。詰めるほうも緩める** */
  mobileScale: number;
}

export const DENSITIES: Density[] = [
  { id: "tight",  label: "詰める", note: "補助の帯。前の帯に続けて読ませる", scale: 0.6, mobileScale: 0.7 },
  { id: "normal", label: "標準",   note: "既定。いまの見え方と同じ",       scale: 1.0, mobileScale: 1.0 },
  { id: "loose",  label: "ゆるめる", note: "読ませる帯。文章が主役のとき",   scale: 1.2, mobileScale: 1.15 },
  /**
   * **余白そのものを見せる。** 山の前後に置く。
   * 1ページに1〜2回まで。連続して使うと、ただ長いページになる。
   */
  { id: "vast",   label: "大きく空ける", note: "山の前後。**1ページに1〜2回まで**", scale: 1.6, mobileScale: 1.4 },
];

export const getDensity = (id: string | undefined): Density =>
  DENSITIES.find((d) => d.id === id) ?? DENSITIES[1]!;

/** その帯の上下余白（px）。`--section` の実寸を渡す */
export const paddingOf = (d: Density, section: number, mobile = false): number =>
  Math.round(section * (mobile ? d.mobileScale : d.scale));
