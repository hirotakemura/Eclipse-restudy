/**
 * KOBO — 写真の扱い
 *
 * **写真はデザインの差を作る必須要素ではない**（ご指示②）。
 * 会社固有性を「さらに強める」ものとして置く。
 * 預かっていなければ `none`。**無理に写真中心のデザインにしない。**
 */

export type MediaId = "none" | "inline" | "side" | "full" | "frame" | "mono";

export interface Media {
  id: MediaId;
  label: string;
  note: string;
}

export const MEDIA: Media[] = [
  { id: "none", label: "なし", note: "既定。写真を預かっていない段階" },
  { id: "inline", label: "本文の中に", note: "文章の流れに沿って置く" },
  { id: "side", label: "横に並べる", note: "文章の隣。split の組み方と合う" },
  { id: "full", label: "画面いっぱい", note: "外観・工場全景に。**良い写真が無いと間延びする**" },
  { id: "frame", label: "枠付き", note: "余白を取って額装のように。製品を主役にするとき" },
  { id: "mono", label: "単色", note: "写真の色味がばらついているときに揃える" },
];

export const getMedia = (id: string | undefined): Media =>
  MEDIA.find((m) => m.id === id) ?? MEDIA[0]!;
