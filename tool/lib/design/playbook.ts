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
import type { ContentId, PresentationId, Materials, PageId, PageRole } from "./system/index.ts";
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
   * **ここから汎用プラン**（D-273・ご指示§24）。
   *
   * 製造業の6方向を流用しない。判断の軸そのものが違う。
   * 製造業が「技術・設備・加工・数値をどう視覚化するか」なのに対し、
   * 汎用は「**少ない情報を強く、美しく見せる**」（ご指示§4）。
   * だから主役に置くものも、その見せ方も別に決める。
   */
  offering: {
    lead: "offerings", leadPresentations: ["cardGrid", "spec"],
    // **お客様の言葉は、札のほうが中身がある**（引用は1発言しか出ない・D-259）
    prefer: { cases: ["process"], praise: ["cardGrid", "quote"], technique: ["prose"], declined: ["quote"] },
  },
  /** **料金を出せる会社は、それ自体が選ばれる理由になる。** 突き合わせて読める表にする */
  price: {
    lead: "offerings", leadPresentations: ["spec", "cardGrid"],
    prefer: { cases: ["spec", "process"], declined: ["quote"], praise: ["cardGrid", "quote"] },
  },
  /** 汎用では `declined` は「選ばれている理由」を指す（`Present.astro` が出し分けている） */
  reason: {
    lead: "declined", leadPresentations: ["quote", "longform"],
    prefer: { offerings: ["cardGrid"], praise: ["cardGrid", "quote"], cases: ["process"] },
  },
  voice: {
    lead: "praise", leadPresentations: ["quote", "cardGrid"],
    prefer: { cases: ["process"], offerings: ["cardGrid"], declined: ["quote"] },
  },
  record: {
    lead: "cases", leadPresentations: ["process", "cardGrid"],
    prefer: { offerings: ["cardGrid"], praise: ["cardGrid", "quote"], declined: ["quote"] },
  },
  person: {
    lead: "executive", leadPresentations: ["quote", "longform"],
    prefer: { praise: ["cardGrid", "quote"], offerings: ["cardGrid"], history: ["timeline"] },
  },
  /**
   * **根拠のある強みが無いとき。**
   * 特徴的な表現を割り当てず、安全な既定に任せる（D-205）。
   */
  unknown: { lead: "conditions", leadPresentations: [], prefer: {} },
};

/**
 * ── 勝ち筋ごとの、サイトの骨格（第6段階）────────────────
 *
 * **上の `PLAYBOOK` と同じ思想を、ページの並びまで延ばしたものである。**
 *
 * これまで `PLAYBOOK` は「帯の中身をどう見せるか」しか決めていなかった。
 * その結果、**情報の中身は会社ごとに違うのに、サイトの骨格は全社同じ**だった
 * （実測：商品が同じなら、ページの集合も順番も1社たりとも変わらない）。
 *
 * 【ページ名ではなく役割で書く】
 * 15の勝ち筋 × 11ページの表を作ると、ページを1枚足すたびに15行を直すことになる。
 * 役割は7つしかないので、**7個の並べ替え**で済む。
 *
 * 【`entry` と `action` は動かさない】
 * 入口と問い合わせの位置が会社ごとに変わると、**使い方そのものが分からなくなる。**
 * `composeSite` が、並べ替えのあとで必ず先頭と末尾に戻す。
 *
 * 【`unknown` は空にする】
 * 根拠が無いのに並べ替えない（D-205）。既定の並びのまま出る。
 */
export interface Architecture {
  /** 役割の並べ替え。**書かなければ既定** */
  roles?: PageRole[];
  /** 同じ役割の中で、先に出すページ */
  first?: PageId[];
  /**
   * 厚くするページ。**新しい内容は作らない。**
   * すでにこの会社が持っている材料を、そのページにも降ろすだけである。
   * 材料が無ければ `composePage` が何も足さないので、**水増しにならない。**
   */
  thicken?: PageId[];
  /** なぜその並びか。**社長に説明できない構成は出さない** */
  why: string;
}

/** 証拠を先に読ませる並び。「実際に受けた仕事」で引きつける会社に使う */
const PROOF_FIRST: PageRole[] = ["entry", "proof", "capacity", "trust", "people", "hiring", "action"];
/** 人を先に読ませる並び。会う前に人柄を見られる商売に使う */
const PEOPLE_FIRST: PageRole[] = ["entry", "people", "proof", "trust", "capacity", "hiring", "action"];

export const ARCHITECTURE: Record<PrimaryStrength, Architecture> = {
  /** 受けられる条件が先。**対応可能範囲が主戦場**で、そこを厚くする */
  precision: { thicken: ["capability"], why: "精度で選ばれる会社は、受けられる条件から読ませる" },
  /** **事例が先。** 「他社が断った案件を受けた」は、事例そのものが証拠である */
  difficulty: { roles: PROOF_FIRST, first: ["cases"], thicken: ["cases"], why: "難加工で選ばれる会社は、実際に受けた仕事から読ませる" },
  /**
   * **設備を対応可能範囲より先に出す。**
   * 短納期で選ばれる会社に効くのは「何ができるか」より「どれだけ回せるか」で、
   * 台数と体制がそれを表す。
   */
  speed: { first: ["equipment"], thicken: ["equipment"], why: "短納期で選ばれる会社は、回せる体制から読ませる" },
  range: { thicken: ["capability"], why: "対応範囲で選ばれる会社は、受けられる条件を厚くする" },
  engineering: { roles: PROOF_FIRST, thicken: ["cases"], why: "設計で選ばれる会社は、受けた案件の中身から読ませる" },
  equipment: { first: ["equipment"], thicken: ["equipment"], why: "設備で選ばれる会社は、設備から読ませる" },
  /** 職人。**技術と言葉が先、会社の来歴がその次。** 対応条件は後ろでよい */
  craft: { roles: ["entry", "proof", "trust", "capacity", "people", "hiring", "action"], thicken: ["cases"], why: "職人性で選ばれる会社は、仕事そのものから読ませる" },
  history: { roles: ["entry", "trust", "proof", "capacity", "people", "hiring", "action"], why: "歴史で選ばれる会社は、会社そのものから読ませる" },

  // ── 汎用プラン ──
  offering: { first: ["services"], thicken: ["services"], why: "取り扱いが明確な会社は、何を売っているかから読ませる" },
  price: { first: ["services"], thicken: ["services"], why: "料金を出せる会社は、いくらかから読ませる" },
  reason: { roles: PROOF_FIRST, why: "選ばれている理由を言語化できている会社は、その理由から読ませる" },
  voice: { roles: PROOF_FIRST, why: "お客様の言葉がある会社は、その言葉から読ませる" },
  record: { roles: PROOF_FIRST, first: ["cases"], thicken: ["cases"], why: "実績で選ばれる会社は、実績から読ませる" },
  person: { roles: PEOPLE_FIRST, why: "人で選ばれる会社は、人から読ませる" },

  /** **根拠が無いので並べ替えない**（D-205）。既定の並びのまま */
  unknown: { why: "強みの根拠が無いので、既定の並びのまま" },
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
  // 製造業
  precision: "精度", difficulty: "難加工", speed: "短納期・対応力", range: "対応範囲",
  engineering: "設計対応", equipment: "設備", craft: "職人性",
  // 汎用（D-273）
  offering: "取り扱いの明確さ", price: "料金の分かりやすさ", reason: "選ばれている理由",
  voice: "お客様の声", record: "実績", person: "人",
  // 両方
  history: "歴史",
  unknown: "（強みの根拠なし）",
};
