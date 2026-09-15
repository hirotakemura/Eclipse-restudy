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
import type { PresentationId } from "./presentation.ts";

export type PeakId = "none" | "number" | "statement" | "process" | "spec" | "image";

export interface Peak {
  id: PeakId;
  label: string;
  note: string;
  /** この山に使える内容。空なら問わない */
  contents: ContentId[];
  /**
   * **この山が実際に大きくするもの**（D-278）。
   *
   * 判定に使う値と、実際に描くものを揃える（D-251の教訓）。
   * 最初はここが無く、**仕様表の帯に「値を大きく」の山を当てていた。**
   * 「値を大きく」が大きくするのは `.figures dd` や `.bignumber-value` なので、
   * 表の帯に当てても**何も起きない。余白だけが広がった帯**になる。
   * 空なら表現を問わない。
   */
  presentations: PresentationId[];
  /** 実写の写真が要るか。**4つは要らない**（写真0枚でも山が作れる） */
  needsPhoto: boolean;
  /** この山に載せる文字の役割 */
  role: "display" | "numeric" | "statement" | "sectionTitle";
}

export const PEAKS: Peak[] = [
  { id: "none", label: "山を作らない", note: "既定。いまの見え方と同じ", contents: [], presentations: [], needsPhoto: false, role: "sectionTitle" },
  /**
   * **値ひとつを、画面いっぱいに。**
   * `±0.005mm` のように短く言い切れる値だけ。長い文字列は `fit()` が一段落とす。
   */
  { id: "number", label: "値を大きく", note: "短く言い切れる値ひとつを、画面いっぱいに。精度・納期で選ばれる会社に",
    contents: ["conditions"], presentations: ["largeNumber", "comparison"], needsPhoto: false, role: "numeric" },
  /**
   * **写真が1枚も無い案件の、主力。**
   * 「他社から『ビビって割れる』と断られた案件を複数回受注している」のような一文を大きく置く。
   */
  { id: "statement", label: "一言を大きく", note: "会社を一言で言う文を大きく。**写真0枚でもここで山が作れる**",
    // **採用の「何をする仕事か」もここ**（D-302）。求職者がいちばん先に読む
    contents: ["declined", "praise", "executive", "technique", "recruit"], presentations: ["quote", "prose", "longform"], needsPhoto: false, role: "statement" },
  /**
   * **山は「見出しを大きくする仕組み」ではない**（D-320）。
   * **その帯で最も重要な視覚対象を主役にする仕組み**である。
   *
   * 工程の山は、番号・工程見出し・工程本文という**中身の側が既に大きくなっている**
   * （`site.css` の `[data-peak="process"]`）。そこへ帯の見出しまで最大にしていたため、
   * **「ご相談から結果まで」という汎用の語が、工程そのものより強くなっていた**（実測・約110px対20px）。
   * 見出しは据え置き、主役は工程に返す。
   */
  { id: "process", label: "工程を大きく", note: "課題→工程→結果を、カードではなく縦の流れとして見せる",
    contents: ["cases", "technique"], presentations: ["process"], needsPhoto: false, role: "sectionTitle" },
  /**
   * **見出しが大きくならなければ、山にならない**（D-284）。
   * 最初は `sectionTitle`（ほかの帯と同じ）にしていたため、**見た目が山に立たなかった。**
   * 見た目の検査で「文字の段が2段しかない」と出て気づいた。
   * 値の山（`number`）は値のほうを大きくするので見出しは据え置きでよいが、
   * **表の山は、表そのものを大きくはできない。** 見出しが強さを引き受ける。
   */
  { id: "spec", label: "条件を壁に", note: "条件表・料金表を、表ではなく画面を占める構成物として見せる",
    // **汎用の料金表もここ**（D-283）。料金が全件そろっている会社では、それが山になる
    // **事例の条件表もここ**（D-302）。調達担当者の目が最初に止まるのは、材質・数量・納期である
    // **会社概要と募集要項もここ**（D-302）。どちらも「突き合わせて読む表」がページの主題である
    contents: ["conditions", "equipment", "materials", "offerings", "cases", "profile", "recruit"], presentations: ["spec", "cardGrid", "chips"], needsPhoto: false, role: "statement" },
  /**
   * **名前どおり、写真そのものを主役にする**（D-320）。
   *
   * 直す前は、写真を1ミリも大きくせずに**帯の見出しだけを最大**にしていた。
   * 「写真を全幅」という名前と実装が食い違っていた（D-278① と同じ形）。
   * 実測：設備一覧で「工場・設備」が約110px、その下の写真は通常のギャラリー寸法。
   * 大きくするのは写真であって、見出しではない。
   */
  { id: "image", label: "写真を全幅", note: "写真を画面いっぱいに。**実写があるときだけ**",
    contents: ["photos", "cases", "equipment"], presentations: ["fullWidth", "cardGrid"], needsPhoto: true, role: "sectionTitle" },
];

export const getPeak = (id: string | undefined): Peak =>
  PEAKS.find((p) => p.id === id) ?? PEAKS[0]!;

/**
 * その帯に、この山を当ててよいか。
 * **内容だけでなく、実際に描かれる表現も見る**（D-278）。見ないと、
 * 「値を大きく」の山を仕様表の帯に当てて、**余白だけ広い帯**ができる。
 */
export const canPeak = (
  peak: Peak, content: ContentId, hasRealPhotos: boolean, presentation?: PresentationId,
): boolean =>
  peak.id !== "none"
  && (!peak.needsPhoto || hasRealPhotos)
  && (peak.contents.length === 0 || peak.contents.includes(content))
  && (peak.presentations.length === 0 || !presentation || peak.presentations.includes(presentation));
