/**
 * KOBO — 面（帯の地）
 *
 * **直す前は、本文の帯がすべて白だった。**
 * トップページの帯7つのうち背景があるのは2つ（誘導帯と脚）だけで、
 * 配色を変えても「白地に文字」が続く見え方になっていた（docs/22）。
 *
 * **暗い面は作らない**（D-199）。明るい面の中で差を作る。
 * 地紋・方眼はCSSで描く。**画像を足して表示を遅くしない**（ご指示§18）。
 */

export type SurfaceId = "plain" | "soft" | "accent" | "grid" | "rule" | "paper";

export interface Surface {
  id: SurfaceId;
  label: string;
  note: string;
  /** 文字が乗る地の色。コントラスト検査はこの色に対して行う */
  on: "bg" | "bgSoft" | "accent";
  /** 写真が無くても効くか。**写真ゼロで差を作れることが条件**（ご指示②） */
  worksWithoutPhotos: boolean;
}

export const SURFACES: Surface[] = [
  { id: "plain", label: "白地", note: "既定。文章を読ませる帯に", on: "bg", worksWithoutPhotos: true },
  { id: "soft", label: "薄地", note: "章の切れ目をつくる。長いページで迷子になりにくい", on: "bgSoft", worksWithoutPhotos: true },
  { id: "accent", label: "アクセント地", note: "白抜き。1ページに1〜2回まで。使いすぎると効かない", on: "accent", worksWithoutPhotos: true },
  { id: "grid", label: "方眼", note: "白地に薄い方眼。図面・設計の会社で効く", on: "bg", worksWithoutPhotos: true },
  { id: "rule", label: "上下の太罫", note: "仕様書に近い締まり方。数値を見せる帯に", on: "bg", worksWithoutPhotos: true },
  { id: "paper", label: "紙の地", note: "薄地に細かな粒。老舗・手仕事の会社で効く", on: "bgSoft", worksWithoutPhotos: true },
];

export const getSurface = (id: string | undefined): Surface =>
  SURFACES.find((s) => s.id === id) ?? SURFACES[0]!;
