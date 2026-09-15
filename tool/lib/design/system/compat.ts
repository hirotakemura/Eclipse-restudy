/**
 * KOBO — 内容 × 表現の可否表と、材料の確認
 *
 * **これが安全装置である**（D-206）。
 * AIに「自由にデザインさせる」のではなく、選べるのは**この表の○だけ**。
 * さらに、○があっても**材料が無ければ選べない。**
 *
 * 順序は固定する：
 *   見立て → contentを選ぶ → presentationを選ぶ → 可否表 → 材料の確認 → 生成
 */

import type { ContentId } from "./content.ts";
import { getPresentation, type PresentationId } from "./presentation.ts";

/** 内容ごとに使ってよい表現。**先頭が既定** */
export const COMPATIBLE: Record<ContentId, PresentationId[]> = {
  /**
   * 取り扱い（名前・内容・料金）。**表にするか、カードにするか、読み物にするか**（D-272）。
   * 料金表は「突き合わせて読むもの」なので `spec` が効く。
   * 1つひとつを読ませたい会社（士業・美容・飲食）は `cardGrid` か `longform`。
   */
  offerings: ["cardGrid", "spec", "list", "longform", "prose"],
  conditions: ["largeNumber", "spec", "comparison", "list"],
  materials: ["chips", "list", "spec"],
  equipment: ["cardGrid", "spec", "largeNumber", "list"],
  cases: ["cardGrid", "process", "quote", "spec"],
  technique: ["prose", "longform", "process", "list"],
  declined: ["quote", "prose", "longform"],
  praise: ["cardGrid", "quote", "prose"],
  history: ["timeline", "prose", "list", "longform"],
  executive: ["prose", "quote", "longform"],
  photos: ["fullWidth", "cardGrid"],
  /**
   * 会社概要は**突き合わせて読む表**である。読み物にはしない（D-095）。
   * ここを散文にすると、発注前に確かめたい欄（資本金・所在地）を探せなくなる。
   */
  profile: ["spec", "list"],
  /** 募集要項は表。**条件の書いていない求人は応募されない**（D-171） */
  recruit: ["spec", "list", "prose"],
  /**
   * お問い合わせ。`list` は**ご連絡先**（電話・メール・所在地・稼働体制）、
   * `prose` は**用意いただきたいことと用紙**。
   * **電話とメールは必ず同じページに出す**（D-060）。用紙が止まっても問い合わせを絶やさない。
   */
  inquiry: ["prose", "list"],
  draft: ["prose", "longform"],
};

export const canPresent = (content: ContentId, presentation: PresentationId): boolean =>
  (COMPATIBLE[content] ?? []).includes(presentation);

/** 材料の量。`hasMaterial` に渡す */
export interface Materials {
  /** その内容が何件あるか（札やカードに**出せる**件数） */
  count: number;
  /**
   * 全件を並べたときの行数。**表はこちらで判断する。**
   *
   * 設備は「カードに出せる数（メーカー・型番の分かっているもの）」と
   * 「一覧表に出せる数（全台）」が違う。ここを1つの数で兼ねていたため、
   * **8台のうち型番が2台しか分からない案件で、保有設備一覧の表が出せない**と判定され、
   * 表が台数の数字に置き換わって**残り6台がページから消える**ようになっていた（D-204）。
   * 省略したときは `count` と同じ。
   */
  rows?: number;
  /** 文章の長さ（文字数） */
  length: number;
  /** 短く言い切れる値があるか（14文字以内・句読点なし） */
  hasShortValue: boolean;
  /**
   * **短く言い切れて、しかも数字を含む値**があるか（D-251）。
   *
   * 「案件により相談」は短く言い切れているが、**条件としては何も言っていない。**
   * 「±0.005mm」「最短翌日」との差はここで、`hasShortValue` だけでは区別できない。
   * 主役として大きく出してよいかの判断に使う。
   */
  hasStrongValue?: boolean;
  /** 対になる2つの値が取れるか */
  hasPair: boolean;
  /** 鍵括弧つきの発言があるか */
  hasQuote: boolean;
  /** 順序のある記述があるか */
  hasSteps: boolean;
  /**
   * **実際に何段の工程として描かれるか**（D-251）。
   *
   * 「順序がある」だけでは足りない。1つしかない項目を番号付きで並べても、
   * **工程にはならない**（実測：`【温度管理】…` の1項目が「①温度管理」として出ていた）。
   * 語彙表は前から「順序のある記述2つ以上」と謳っていたのに、**コードは1つでも通していた。**
   */
  steps?: number;
  /** 実写の写真があるか */
  hasRealPhotos: boolean;
}

/**
 * その表現に必要な材料があるか。
 *
 * **無いものを表現で埋めない。** 3件しかない沿革を年表にすると、
 * 薄い年表になる。薄い年表は、無いより悪い。
 */
export function hasMaterial(p: PresentationId, m: Materials): boolean {
  switch (p) {
    case "prose": return m.length > 0;
    case "longform": return m.length >= 200;
    case "list": return m.count >= 2;
    case "chips": return m.count >= 2;
    case "cardGrid": return m.count >= 2;
    // 表は**全件**で判断する。カードに出せる数ではない
    case "spec": return (m.rows ?? m.count) >= 3;
    case "timeline": return m.count >= 3;
    /**
     * **「大きな数字」は、数字であること**（D-251）。
     *
     * 短く言い切れるだけでは足りない。「案件により相談」を画面いっぱいに出しても、
     * **何も言っていない文字が大きくなるだけ**である（D-214で一度直したのと同じ間違い）。
     * `hasStrongValue` を持たない内容（設備の台数など）は、これまでどおり。
     */
    case "largeNumber": return m.hasStrongValue ?? m.hasShortValue;
    case "comparison": return m.hasPair;
    // **2段以上でなければ工程ではない**（語彙表の記載と揃える・D-251）
    case "process": return m.hasSteps && (m.steps ?? 0) >= 2;
    case "quote": return m.hasQuote;
    case "fullWidth": return m.hasRealPhotos;
  }
}

/** 使える表現を、可否表と材料の両方で絞る。**先に可否、次に材料**（D-208） */
export function usablePresentations(content: ContentId, m: Materials): PresentationId[] {
  return (COMPATIBLE[content] ?? []).filter((p) => hasMaterial(p, m));
}

/**
 * **その乗り換えで、画面に出る情報が減るか**（D-259）。
 *
 * 可否表（`canPresent`）は「見せられるか」だけを見ている。
 * **どれだけ落ちるかは、いままで誰も見ていなかった。**
 *
 * 実測（3社のAI版Brief・キャプチャで確認）：
 *   AIが変えた5箇所は、**5箇所とも情報の少ないほうへの乗り換えだった。**
 *   多いほうへ動いたものは1つも無い。
 *   ・設備 `cardGrid` → `list`　　　メーカー名（ブラザー工業・ミツトヨ）と一覧への導線が消えた
 *   ・設備 `spec` → `largeNumber`　「保有設備 7台」の1語に潰れる
 *   ・お客様の言葉 `cardGrid` → `quote`　3項目が1発言になる
 * どれも4段検査は「問題なし」で通した。**可否も材料も、確かに満たしていたからである。**
 *
 * **情報を削らせない**（D-204）は、いままで帯の取捨にしか効いていなかった。
 * 同じ帯のまま、表現の選び方で削れることに気づいていなかった。ここで塞ぐ。
 */
export const keepsLess = (from: PresentationId, to: PresentationId): boolean =>
  getPresentation(to).detail < getPresentation(from).detail;
