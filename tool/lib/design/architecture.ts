/**
 * KOBO — サイトの骨格（Company Site Plan）
 *
 *   会社の見立て（analysis.ts）　　何で選ばれている会社か
 *     ↓
 *   **この層**　　　　　　　　　　どのページを・どの順で・どれだけ厚く
 *     ↓
 *   何を・どの順で（composePage）
 *     ↓
 *   画面のリズム（composeVisual）
 *     ↓
 *   素材（composeAssets）
 *     ↓
 *   Astro
 *
 * 【なぜ要るか】
 * ここまでの5段階で、**帯の中身も、帯の順も、見せ方も、素材も会社ごとに変わる**ようになった。
 * しかし**サイトの骨格だけが全社同じ**だった——実測で、商品が同じなら
 * ページの集合も順番も1社たりとも変わらなかった。
 * 「情報の中身が会社ごとに違う」から「**サイトの構造が会社ごとに違う**」へ進める層である。
 *
 * 【新しい判断を足す層ではない】
 * 勝ち筋の表（`PLAYBOOK`）は既にある。**それがページの中にしか届いていなかった。**
 * この層がやるのは、**既にある判断をページの並びまで運ぶこと**だけである。
 *
 * 【`brief` を引数に取らない】
 * Asset層と同じ設計（D-304）。ページ構成にはURLと検索順位が乗るので、
 * **生成のたびに揺れてよい種類の判断ではない。**
 * AIが落としたページは「無い理由」を後から説明できない。
 * 引数に無ければ、AI Brief がこの先どう確定してもこの層は影響を受けない。
 *
 * 【乱数も時刻も使わない】
 * 同じ `project.json` からは必ず同じ骨格が出る。試験で2回組んで突き合わせている。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import {
  CORE, DEFAULT_ROLE_ORDER, HREF_OF, ROLE_OF, WITHIN_ROLE, isCore, labelOf,
  type PageId, type PageRole,
} from "./system/index.ts";

export type FormSet = "manufacturing" | "general";

export interface PageSpec {
  id: PageId;
  /** URL。**勝ち筋では変わらない** */
  href: string;
  /** メニューに出す言葉。商品で変わる（D-276） */
  label: string;
  /**
   * `core` は**落とせないページ**（ご指示）。
   * `included` は材料・目的・勝ち筋で入ったページ。
   */
  presence: "core" | "included";
  /**
   * **導線の順番。** メニューと内部リンクの並びがこれである。
   *
   * **検索での重みと混ぜない**（ご指示）。
   * 1つの数値に2つの意味を持たせると、片方を直したときにもう片方が黙って動く。
   */
  order: number;
  role: PageRole;
  /** メニューに出すか。事例の個別ページのように、出さないページがある */
  inNav: boolean;
  /** なぜそうなったか。**社長に説明できない構成は出さない** */
  why: string;
  /** 事例の個別ページだけ。1始まり */
  caseNo?: number;
}

export interface SitePlan {
  /** `order` の順 */
  pages: PageSpec[];
  formSet: FormSet;
  why: string;
}

/** メニューに出すページ */
export const navOf = (plan: SitePlan): PageSpec[] => plan.pages.filter((p) => p.inNav);
/** そのページを作るか */
export const hasPage = (plan: SitePlan, id: PageId): boolean => plan.pages.some((p) => p.id === id);
export const pageOf = (plan: SitePlan, id: PageId): PageSpec | undefined => plan.pages.find((p) => p.id === id);

/**
 * **この会社のサイトの骨格を決める。**
 *
 * 手順は3つだけ。
 *   ① どのページが要るか（`presence`）——**コアは無条件で入る**
 *   ② どの順で読ませるか（`order`）——役割の並べ替え
 *   ③ 同じ役割の中は、既定の並びのまま
 */
export function composeSite(project: Project, a: Analysis): SitePlan {
  const p = project as any;
  const formSet: FormSet = p.formSet === "general" ? "general" : "manufacturing";
  const isGeneral = formSet === "general";

  const goals = new Set<string>(p.inquiry?.goals ?? []);
  const cases: any[] = Array.isArray(p.cases) ? p.cases : [];
  const offerings: any[] = (p.general?.offerings ?? []).filter((o: any) => o && (o.name || o.detail));
  const hasRecruit = goals.has("採用") && Boolean(p.recruitment);
  const hasMessage = (goals.has("採用") || goals.has("信用構築")) && Boolean(p.executive?.vision);

  /**
   * ① どのページが要るか。
   *
   * **コアページを落とす経路を作らない**（ご指示）。
   * 「勝ち筋によっては会社概要を出さない」のような判断が**書けないようにしてある**——
   * 下の表にコアページの条件を書いていないのは、うっかりではなく設計である。
   */
  const want: [PageId, boolean, string][] = [
    ["index", true, "入口"],
    ["capability", !isGeneral, "対応材質・加工法・精度・ロット・納期。検索の本体"],
    ["equipment", !isGeneral, "メーカー名と型番。型番そのものが検索される"],
    ["services", isGeneral && offerings.length > 0, "取り扱いと料金"],
    ["strengths", true, "なぜこの会社が受けられるか"],
    ["cases", cases.length > 0, "実際に受けた仕事"],
    ["company", true, "実在する会社かどうかを確かめる場所"],
    ["recruit", hasRecruit, "目的に採用があり、募集要項がある"],
    ["message", hasMessage, "目的に採用か信用構築があり、代表の言葉がある"],
    ["contact", true, "連絡先"],
  ];

  const specs: Omit<PageSpec, "order">[] = [];
  for (const [id, ok, why] of want) {
    const core = isCore(id, formSet);
    if (!core && !ok) continue;
    specs.push({
      id, href: HREF_OF[id], label: labelOf(id, formSet),
      presence: core ? "core" : "included",
      role: ROLE_OF[id], inNav: true,
      why: core ? `${why}（落とさないページ）` : why,
    });
  }

  /**
   * 事例の個別ページ。**メニューには出さない**（件数ぶん増えるため）が、
   * URLは持つ。sitemap と写真の依頼はここを見る。
   */
  if (!isGeneral) {
    cases.forEach((c, i) => {
      specs.push({
        id: "case", href: `/cases/${i + 1}/`,
        label: `${labelOf("case", formSet)}：${String(c?.title ?? "").slice(0, 20)}`,
        presence: "included", role: ROLE_OF.case, inNav: false,
        why: `${i + 1}件目の事例`, caseNo: i + 1,
      });
    });
  }

  /** ② どの順で読ませるか。**いまは既定の並びだけ**（順序の変化は次の段で入れる） */
  const roleOrder = DEFAULT_ROLE_ORDER;
  const rank = (s: Omit<PageSpec, "order">): [number, number, number] => {
    const r = roleOrder.indexOf(s.role);
    const w = WITHIN_ROLE.indexOf(s.id);
    /** 事例の個別ページは、一覧のすぐ後ろに件数順で並べる */
    return [r < 0 ? 99 : r, w < 0 ? 99 : w, s.caseNo ?? 0];
  };
  const sorted = [...specs].sort((x, y) => {
    const a = rank(x), b = rank(y);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });

  return {
    pages: sorted.map((s, i) => ({ ...s, order: i + 1 })),
    formSet,
    why: "既定の並び",
  };
}
