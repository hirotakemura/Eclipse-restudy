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
import type { PresentationId } from "./presentation.ts";

/** 内容ごとに使ってよい表現。**先頭が既定** */
export const COMPATIBLE: Record<ContentId, PresentationId[]> = {
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
  /** 対になる2つの値が取れるか */
  hasPair: boolean;
  /** 鍵括弧つきの発言があるか */
  hasQuote: boolean;
  /** 順序のある記述があるか */
  hasSteps: boolean;
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
    case "largeNumber": return m.hasShortValue;
    case "comparison": return m.hasPair;
    case "process": return m.hasSteps;
    case "quote": return m.hasQuote;
    case "fullWidth": return m.hasRealPhotos;
  }
}

/** 使える表現を、可否表と材料の両方で絞る。**先に可否、次に材料**（D-208） */
export function usablePresentations(content: ContentId, m: Materials): PresentationId[] {
  return (COMPATIBLE[content] ?? []).filter((p) => hasMaterial(p, m));
}
