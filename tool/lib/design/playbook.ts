/**
 * KOBO — 最大の強みごとの、見せ方の手順書（規則版）
 *
 * **ここでは生成AIを使わない**（ご指示）。
 * 「賢いAI」より「予測可能なルール」を優先する。
 * AIを入れる前に、**AIが無くても会社ごとの差が作れることを証明する**のが目的。
 *
 * 【絶対に守ること】
 * 対応表に書いてあっても、**可否表と材料の条件を必ず通す**（D-206）。
 * 例：`precision` でも、具体的な精度の値が無ければ `largeNumber` を強制しない。
 */

import type { Analysis, PrimaryStrength } from "./analysis.ts";
import type { ContentId, PresentationId, Materials } from "./system/index.ts";
import { canPresent, hasMaterial, COMPATIBLE } from "./system/index.ts";

export interface Play {
  /** 主役にする内容 */
  lead: ContentId;
  /** 主役の表現。**前から順に、通ったものを使う** */
  leadPresentations: PresentationId[];
  /** ほかの内容の表現の好み。書いていないものは既定 */
  prefer: Partial<Record<ContentId, PresentationId[]>>;
}

export const PLAYBOOK: Record<PrimaryStrength, Play> = {
  precision: {
    lead: "conditions", leadPresentations: ["largeNumber", "spec"],
    /**
     * **`technique` の指定が無く、既定（散文）に落ちていた**（D-251）。
     * 精度で選ばれる会社の「どうやって受けているか」は、**手順そのもの**である
     * （治具・段取り・検査の順序）。散文で流すより工程で見せるほうが、
     * 精度の裏づけとして読める。設備は型番が物証なので仕様表のまま。
     */
    prefer: {
      cases: ["spec", "cardGrid"], equipment: ["spec"],
      technique: ["process", "longform"],
    },
  },
  difficulty: {
    lead: "cases", leadPresentations: ["process", "quote"],
    prefer: { declined: ["quote"], technique: ["process", "longform"], conditions: ["spec"] },
  },
  speed: {
    lead: "conditions", leadPresentations: ["comparison", "largeNumber"],
    prefer: { cases: ["process"], technique: ["process"], equipment: ["cardGrid"] },
  },
  range: {
    lead: "materials", leadPresentations: ["chips", "spec"],
    prefer: { conditions: ["spec"], equipment: ["spec"] },
  },
  engineering: {
    lead: "technique", leadPresentations: ["process", "longform"],
    prefer: { cases: ["process"], declined: ["longform"], conditions: ["spec"] },
  },
  equipment: {
    lead: "equipment", leadPresentations: ["spec", "cardGrid"],
    prefer: { conditions: ["spec"], cases: ["cardGrid"] },
  },
  craft: {
    lead: "technique", leadPresentations: ["longform", "quote"],
    prefer: { praise: ["quote"], declined: ["longform"], history: ["timeline"] },
  },
  history: {
    lead: "history", leadPresentations: ["timeline", "longform"],
    prefer: { executive: ["quote"], technique: ["longform"], praise: ["quote"] },
  },
  /**
   * **根拠のある強みが無いとき。**
   * 特徴的な表現を割り当てず、安全な既定に任せる（D-205）。
   */
  unknown: { lead: "conditions", leadPresentations: [], prefer: {} },
};

/**
 * この内容を、どの表現で見せるか。
 *
 * 手順（D-206）：
 *   1. 手順書の好み → 2. 内容ごとの既定 の順に候補を並べる
 *   3. 可否表を通す　4. 材料があるか見る
 *   5. どれも通らなければ、可否表の先頭で材料のあるものへ落とす
 */
export function choosePresentation(
  content: ContentId,
  a: Analysis,
  materials: Materials,
  opts: { isLead?: boolean; avoid?: PresentationId[] } = {},
): { presentation: PresentationId; why: string } {
  const play = PLAYBOOK[a.primaryStrength];
  const avoid = new Set(opts.avoid ?? []);
  const wanted = (opts.isLead && play.lead === content
    ? play.leadPresentations
    : (play.prefer[content] ?? [])).filter((p) => !avoid.has(p));

  for (const p of wanted) {
    if (canPresent(content, p) && hasMaterial(p, materials)) {
      return { presentation: p, why: `${LABEL[a.primaryStrength]}が強みなので` };
    }
  }
  // 手順書が効かない。**材料のある既定へ落とす。強制しない**
  const fallback = (COMPATIBLE[content] ?? []).find((p) => !avoid.has(p) && hasMaterial(p, materials));
  if (fallback) {
    const why = wanted.length
      ? `${LABEL[a.primaryStrength]}向けの見せ方は材料が足りないので、既定に落としました`
      : "既定の見せ方";
    return { presentation: fallback, why };
  }
  return { presentation: (COMPATIBLE[content] ?? ["prose"])[0]!, why: "材料が足りないため既定" };
}

export const LABEL: Record<PrimaryStrength, string> = {
  precision: "精度", difficulty: "難加工", speed: "短納期・対応力", range: "対応範囲",
  engineering: "設計対応", equipment: "設備", craft: "職人性", history: "歴史",
  unknown: "（強みの根拠なし）",
};
