/**
 * KOBO — 画面の山
 *
 * **各ページに、最も記憶に残る画面を1つ作る**（ご指示§11）。
 *
 * 【なぜ要るか・実測】
 * 書き出した画面を測ると、**どのページでも最も大きい要素は最初の画面**だった。
 * 本文に入ってから「ここが山」と言える場所が、構造として存在しない。
 *
 *   製造業トップの帯の高さ … 404 / 581 / 746 / 701 / 690 / 501
 *
 * 最大と最小で1.8倍あるが、これは**中身の量の差**であって、意図した強弱ではない。
 * 中身が増えれば勝手に大きくなり、減れば小さくなる。**こちらが決めていない。**
 *
 * 【1ページに1つ】
 * 2つ作ると、どちらも山でなくなる。白抜きの面を1ページ1回に絞ったのと同じ理屈（D-230）。
 *
 * 【材料が無ければ作らない】
 * 山は「大きく見せる」ことなので、**中身が薄いと、薄いことが大きく見える。**
 * 薄い年表を作らないのと同じ（`hasMaterial`）。ここでも材料の条件を持つ。
 *
 * 【写真が無くても山を作れること】
 * これが最重要（ご指示§10）。実案件は写真0枚から始まる。
 * `number` `statement` `process` `spec` の4つは**写真を要らない。**
 */

import type { ContentId } from "./content.ts";

export type PeakId = "none" | "number" | "statement" | "process" | "spec" | "image";

export interface Peak {
  id: PeakId;
  label: string;
  note: string;
  /** この山に使える内容。空なら問わない */
  contents: ContentId[];
  /** 実写の写真が要るか。**4つは要らない**（写真0枚でも山が作れる） */
  needsPhoto: boolean;
  /** この山に載せる文字の役割 */
  role: "display" | "numeric" | "statement" | "sectionTitle";
}

export const PEAKS: Peak[] = [
  { id: "none", label: "山を作らない", note: "既定。いまの見え方と同じ", contents: [], needsPhoto: false, role: "sectionTitle" },
  /**
   * **値ひとつを、画面いっぱいに。**
   * `±0.005mm` のように短く言い切れる値だけ。長い文字列は `fit()` が一段落とす。
   */
  { id: "number", label: "値を大きく", note: "短く言い切れる値ひとつを、画面いっぱいに。精度・納期で選ばれる会社に",
    contents: ["conditions"], needsPhoto: false, role: "numeric" },
  /**
   * **写真が1枚も無い案件の、主力。**
   * 「他社から『ビビって割れる』と断られた案件を複数回受注している」のような一文を大きく置く。
   */
  { id: "statement", label: "一言を大きく", note: "会社を一言で言う文を大きく。**写真0枚でもここで山が作れる**",
    contents: ["declined", "praise", "executive", "technique"], needsPhoto: false, role: "statement" },
  { id: "process", label: "工程を大きく", note: "課題→工程→結果を、カードではなく縦の流れとして見せる",
    contents: ["cases", "technique"], needsPhoto: false, role: "display" },
  { id: "spec", label: "条件を壁に", note: "条件表を、表ではなく画面を占める構成物として見せる",
    contents: ["conditions", "equipment", "materials"], needsPhoto: false, role: "sectionTitle" },
  { id: "image", label: "写真を全幅", note: "写真を画面いっぱいに。**実写があるときだけ**",
    contents: ["photos", "cases", "equipment"], needsPhoto: true, role: "display" },
];

export const getPeak = (id: string | undefined): Peak =>
  PEAKS.find((p) => p.id === id) ?? PEAKS[0]!;

/** その内容に、この山を当ててよいか。**写真の有無も見る** */
export const canPeak = (peak: Peak, content: ContentId, hasRealPhotos: boolean): boolean =>
  peak.id !== "none"
  && (!peak.needsPhoto || hasRealPhotos)
  && (peak.contents.length === 0 || peak.contents.includes(content));
