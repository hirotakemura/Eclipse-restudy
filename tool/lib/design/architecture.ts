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
import { ARCHITECTURE } from "./playbook.ts";
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
  /**
   * **厚くするページか。**
   *
   * `thick` は「新しい内容を作る」ではない。
   * **すでにこの会社が持っている材料を、そのページにも降ろす**だけである。
   * 材料が無ければ `composePage` が何も足さないので、水増しにならない。
   */
  depth: "standard" | "thick";
  /**
   * 検索での重み（`sitemap.xml` の priority）。**`order` とは別物である**（ご指示）。
   *
   * 1つの数値に「メニューの順番」と「検索での重要度」を持たせると、
   * **片方を直したときにもう片方が黙って動く。**
   * 導線は人が読む順、こちらは検索エンジンに伝える重みで、一致しないことがある
   * （例：問い合わせページは導線の最後だが、検索では拾われてよい）。
   */
  searchWeight: number;
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

  type Draft = Omit<PageSpec, "order" | "depth" | "searchWeight">;
  const specs: Draft[] = [];
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

  /**
   * ② どの順で読ませるか。
   *
   *   勝ち筋（`ARCHITECTURE`）で役割を並べ替える
   *     → サイトの目的（`inquiry.goals`）で、1つずつ前後させる
   *     → 入口は先頭、問い合わせは末尾に戻す
   */
  const arch = ARCHITECTURE[a.primaryStrength];
  const why: string[] = [arch.why];
  let roleOrder = [...(arch.roles ?? DEFAULT_ROLE_ORDER)];

  /**
   * **サイトの目的を、読ませる順に効かせる**（ご指示）。
   *
   * これまで `inquiry.goals` は、採用ページと代表挨拶を作るかどうかにしか使っていなかった。
   * しかし**「集客」の会社と「選別」の会社では、同じ情報でも読ませる順が違う。**
   * 集客は「こんな仕事をしています」で引き、選別は「ここまでが受けられます」で絞る。
   *
   * **一段ずつしか動かさない。** 目的で先頭まで持ち上げると、勝ち筋の判断が消える。
   * 順番は目的の書かれ方（データの順）ではなく**この表の順**で当てる——
   * 同じ会社から必ず同じ骨格が出るようにするため。
   */
  interface GoalEffect { role: PageRole; first: PageId[]; thicken: PageId[]; note: string }
  const GOAL_EFFECT: [string, GoalEffect][] = [
    ["集客", { role: "proof", first: ["cases"], thicken: ["cases"],
      note: "問い合わせの数を増やしたいので、受けた仕事そのものを先に・厚く見せる" }],
    ["選別", { role: "capacity", first: ["capability"], thicken: ["capability"],
      note: "割に合う仕事だけを呼びたいので、受けられる条件を先に・厚く見せる" }],
    ["信用構築", { role: "trust", first: ["company"], thicken: [],
      note: "会社を調べられたときに効かせたいので、会社そのものを前に出す" }],
    ["採用", { role: "hiring", first: ["recruit"], thicken: [],
      note: "求職者に届けたいので、採用情報を前に出す" }],
  ];

  /**
   * **効かせるのは1つだけ。**
   *
   * 最初は目的の数だけ順に前後させていたが、実測で**勝ち筋の判断が消えた。**
   * 難加工の会社（B）は「事例を先に読ませる」はずが、
   * 選別・信用構築・採用の3つを順に当てた結果
   * **「対応可能範囲 → 会社概要 → 加工事例」**になり、事例が4番目まで落ちていた。
   * 目的で全部動かすなら、勝ち筋の表は要らなくなる。
   *
   * **どれを当てるかは、目的の書かれ方（データの順）ではなくこの表の順で決める**——
   * 同じ会社から必ず同じ骨格が出るようにするため。
   */
  const goalFirst: PageId[] = [];
  const goalThick: PageId[] = [];
  const goal = GOAL_EFFECT.find(([g]) => goals.has(g));
  if (goal) {
    const [, e] = goal;
    /**
     * **先頭は勝ち筋のもの。** 目的が動かせるのは2番目からである。
     * ここを1番目まで許すと、目的が勝ち筋を上書きしてしまう（上の実測）。
     */
    const i = roleOrder.indexOf(e.role);
    if (i > 2) { roleOrder.splice(i, 1); roleOrder.splice(2, 0, e.role); }
    /**
     * **役割の順が動かなくても、目的は効く。**
     * 同じ役割の中で先に出すページと、厚くするページが変わる。
     * 集客の会社は「こんな仕事をしています」、選別の会社は「ここまでが受けられます」——
     * **同じ情報でも、読ませる順が違う。**
     */
    goalFirst.push(...e.first);
    goalThick.push(...e.thicken);
    why.push(e.note);
  }

  /**
   * **来てほしくない問い合わせがある会社**（`inquiry.wantLessOf`）。
   *
   * ここを「その仕事の話を消す」に使わない（ご指示）。**情報を減らす方向は取らない。**
   * 取るのは逆で、**受けられる条件を先に・厚く読ませる**。
   * 読んだ人が問い合わせる前に自分で判断できれば、断る手間も、
   * 断られる側の落胆も起きない。**選別は、書かないことではなく、書くことで起きる。**
   */
  const avoiding = String(p.inquiry?.wantLessOf ?? "").trim();
  if (avoiding) {
    goalFirst.push(isGeneral ? "services" : "capability");
    goalThick.push(isGeneral ? "services" : "capability");
    why.push("来てほしくない問い合わせがあるので、受けられる条件を前に出して、問い合わせる前に判断できるようにする");
  }

  /** 入口は先頭、問い合わせは末尾。**どの会社でも動かさない** */
  roleOrder = ["entry", ...roleOrder.filter((r) => r !== "entry" && r !== "action"), "action"];

  /**
   * ③ 同じ役割の中の並び。
   * **もっと受けたい仕事がある会社**（`inquiry.wantMoreOf`）は、事例を先に出す。
   */
  const seeking = String(p.inquiry?.wantMoreOf ?? "").trim();
  const first = [...(arch.first ?? [])];
  if (seeking) { first.push("cases"); why.push("もっと受けたい仕事があるので、実際に受けた仕事を先に見せる"); }
  /** **勝ち筋の指定を先に置く。** 目的は、勝ち筋が決めていないところだけを決める */
  for (const id of goalFirst) if (!first.includes(id)) first.push(id);

  const rank = (s: Omit<PageSpec, "order" | "depth" | "searchWeight">): [number, number, number] => {
    const r = roleOrder.indexOf(s.role);
    /**
     * **事例の個別ページは、一覧と同じ位置に置く。**
     * 別々に並べていたため、一覧を前に出した会社で
     * **一覧 → 強み・技術 → 1件目 → 2件目** と、間に別のページが挟まっていた。
     */
    const key = s.id === "case" ? "cases" : s.id;
    const f = first.indexOf(key);
    const w = WITHIN_ROLE.indexOf(key);
    /** 先に出すページは、役割の中で負の位置に置く（件数順は最後に効かせる） */
    return [r < 0 ? 99 : r, f >= 0 ? f - first.length : (w < 0 ? 99 : w), s.caseNo ?? 0];
  };
  const sorted = [...specs].sort((x, y) => {
    const u = rank(x), v = rank(y);
    return u[0] - v[0] || u[1] - v[1] || u[2] - v[2];
  });

  /**
   * ④ どのページを厚くするか。
   * 勝ち筋の表に加えて、**来てほしくない問い合わせがある会社は対応可能範囲を厚く**する。
   */
  /**
   * **厚くするのは2ページまで。** 勝ち筋の1ページを先に入れ、目的で1ページ足す。
   * 3ページ4ページと厚くすると、**厚みが厚みでなくなる**（装飾の数と同じ理屈・原則⑤）。
   */
  const thick = new Set<PageId>();
  for (const id of [...(arch.thicken ?? []), ...goalThick]) {
    if (thick.size >= 2) break;
    thick.add(id);
  }

  /**
   * ⑤ 検索での重み。**導線の順とは別に決める**（ご指示）。
   *
   * 役割で決め、厚くしたページだけ一段上げる。
   * 入口は 1.0、問い合わせは導線の最後でも検索では拾われてよいので 0.7 に置く。
   */
  const BASE_WEIGHT: Record<PageRole, number> = {
    entry: 1.0, capacity: 0.9, proof: 0.8, action: 0.7, trust: 0.6, people: 0.5, hiring: 0.5,
  };

  return {
    pages: sorted.map((s, i) => {
      const depth = thick.has(s.id) ? "thick" as const : "standard" as const;
      const w = (BASE_WEIGHT[s.role] ?? 0.5) + (depth === "thick" ? 0.1 : 0);
      /** 事例の個別ページは一覧より一段下げる。**同じ主題のページを同じ重みにしない** */
      const cut = s.id === "case" ? 0.2 : 0;
      return {
        ...s,
        order: i + 1,
        depth,
        searchWeight: Math.round(Math.min(1, w - cut) * 10) / 10,
      };
    }),
    formSet,
    why: why.join("／"),
  };
}
