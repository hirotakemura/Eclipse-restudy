/**
 * KOBO — 問い合わせ導線の型
 *
 * **同じボックスを全ページに置かない**（ご指示§12）。
 *
 * 【いまの状態】
 * `layouts/Base.astro` に**1種類だけ**が直接書かれている。
 * アクセント地に「見出し＋一文＋ボタン1つ」。全13ページ、どのページでも同じ。
 * 商品ごとに文面だけ変えている（製造業／汎用）。
 *
 * これは**壊れてはいない。** 電話とメールの出し方はD-060・D-175で詰めてあり、
 * 撤退設計の一部でもある（我々が止まっても、電話が載っていればお客様の商売は止まらない）。
 * **変えるのは見せ方だけで、導線そのものは動かさない。**
 *
 * 【型を持つ理由】
 * 最後の画面は、読み終えた人が**最後に見るもの**である。
 * ここが毎回同じ箱だと、ページの終わり方も毎回同じになる。
 * ページの性格（読み物・仕様・事例）に合う終わり方を選べるようにする。
 *
 * 【絶対に守ること】
 *   ・ボタンは1つ。**選ばせない**（D-175）
 *   ・メールアドレスは問い合わせページにだけ（D-175）
 *   ・電話番号は頭と脚に出ているので、ここには置かない（D-175）
 *   ・`image` 以外は**写真が無くても成立する**
 */

export type CtaId = "standard" | "statement" | "split" | "minimal" | "dark" | "image";

export interface Cta {
  id: CtaId;
  label: string;
  note: string;
  /** 文字が乗る地。コントラスト検査はこの色に対して行う（`surface.ts` と同じ考え方） */
  on: "accent" | "bg" | "bgSoft" | "ink";
  /** 実写の写真が要るか */
  needsPhoto: boolean;
  /** 見出しに使う文字の役割 */
  role: "sectionTitle" | "statement" | "display";
}

export const CTAS: Cta[] = [
  /** **既定。いまと1ピクセルも変わらない。** 型を増やしても既存の画面は動かさない */
  { id: "standard",  label: "標準",       note: "既定。アクセント地に見出し＋一文＋ボタン",
    on: "accent", needsPhoto: false, role: "sectionTitle" },
  { id: "statement", label: "一言で締める", note: "一文を大きく置いて、その下にボタン。読み物のページの終わりに",
    on: "bg", needsPhoto: false, role: "statement" },
  { id: "split",     label: "左右に分ける", note: "左に一言、右にボタン。仕様・表が続いたページの終わりに",
    on: "bgSoft", needsPhoto: false, role: "sectionTitle" },
  { id: "minimal",   label: "控えめ",     note: "罫線と一行だけ。静かな会社に。**箱にしない**",
    on: "bg", needsPhoto: false, role: "sectionTitle" },
  { id: "dark",      label: "暗い地で締める", note: "白抜き。ページの終わりをはっきり閉じる",
    on: "ink", needsPhoto: false, role: "statement" },
  { id: "image",     label: "写真の上に",  note: "写真の上に重ねる。**実写があるときだけ**",
    on: "ink", needsPhoto: true, role: "display" },
];

export const getCta = (id: string | undefined): Cta =>
  CTAS.find((c) => c.id === id) ?? CTAS[0]!;

/** その案件でこの型を使えるか */
export const canCta = (cta: Cta, hasRealPhotos: boolean): boolean => !cta.needsPhoto || hasRealPhotos;
