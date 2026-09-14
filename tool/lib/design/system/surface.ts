/**
 * KOBO — 面（帯の地）
 *
 * **直す前は、本文の帯がすべて白だった。**
 * トップページの帯7つのうち背景があるのは2つ（誘導帯と脚）だけで、
 * 配色を変えても「白地に文字」が続く見え方になっていた（docs/22）。
 *
 * **暗い面を解禁した**（D-230／D-199を撤回）。Industrial系の参考例が暗い面を前提にしており、
 * 明るい面だけでは届かないと判断した。ただし**新しい色は1つも足していない。**
 * 暗い地は `--ink`（本文の色）をそのまま地にする。白文字で 15.9〜18.4:1 取れる。
 *
 * **`--accent` を暗い地の上の文字に使ってはいけない**（1.1〜2.9:1・読めない）。
 * 暗い面の上では、文字も罫も白系に倒す。CSSはアクセント地と同じ組を使い回している。
 *
 * 地紋・方眼はCSSで描く。**画像を足して表示を遅くしない**（ご指示§18）。
 */

export type SurfaceId = "plain" | "soft" | "accent" | "grid" | "rule" | "paper" | "dark";

export interface Surface {
  id: SurfaceId;
  label: string;
  note: string;
  /** 文字が乗る地の色。コントラスト検査はこの色に対して行う */
  on: "bg" | "bgSoft" | "accent" | "ink";
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
  // **1ページに1回まで。** 二度使うと、締める力が消えて「暗いサイト」になる
  { id: "dark", label: "暗い地", note: "白抜き。設備・量産の会社で締まる。1ページに1回まで", on: "ink", worksWithoutPhotos: true },
];

export const getSurface = (id: string | undefined): Surface =>
  SURFACES.find((s) => s.id === id) ?? SURFACES[0]!;
