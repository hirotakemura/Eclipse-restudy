/**
 * KOBO — ページの構成（Section Composition）
 *
 * **ページの骨格を、コードではなくデータで持つ。**
 *
 * これまでは `.astro` が構造を固定していたため、全13ページ中12ページが
 * 「`.section` 1つ・幅1040px」の同じ形だった（docs/21）。
 * 配色や書体を変えても同じ顔に見えるのは、**装飾しか変わっていなかった**から。
 *
 * ここが返すのは「セクションの配列」で、Astro 側はそれを描くだけにする。
 * **テンプレートは増やさない**（D-096）。増えるのはセクションの種類であって、
 * 会社ごとのテンプレートではない。
 *
 * 【絶対の制約】
 * **ここは文章も数値も作らない。** 返すのは「どのデータを、どの幅で、どの強さで出すか」だけ。
 * 値は必ず案件データから取る。作った時点で、verify.ts を通らない捏造になる。
 */

import type { Project } from "../schema.ts";
import type { Analysis, ShowBy } from "./analysis.ts";

/** セクションの幅。**全部同じ幅にしない**のが今回の主眼 */
export type Width =
  | "narrow" // 散文。1行が長くなりすぎないように
  | "normal" // 既定
  | "wide" // 表・カード・設備
  | "full"; // 写真・大きな数字。画面いっぱい

/** 強さ。**重要情報と補助情報を同じ大きさで出さない** */
export type Emphasis = "lead" | "normal" | "quiet";

export interface Section {
  kind:
    | "hero"
    | "figures" // 判断に使う数字を大きく
    | "declined" // 他社様が断った案件（引用として大きく）
    | "technique" // 工程の工夫
    | "materials" // 対応材質（分類として）
    | "equipment" // 設備（メーカー・型番つき）
    | "cases" // 加工事例
    | "gallery" // 写真
    | "timeline" // 沿革
    | "people" // 代表
    | "prose"; // 生成した散文
  width: Width;
  emphasis: Emphasis;
  heading?: string;
  /** `prose` のとき、どの原稿を流すか */
  slug?: string;
  /** なぜこの順・この形なのか。**社長に説明できるようにする**（画面には出さない） */
  why?: string;
}

/** 見せ方ごとの、既定の出し方 */
const BY_STRAND: Record<ShowBy, Omit<Section, "why"> | null> = {
  declined: { kind: "declined", width: "narrow", emphasis: "lead", heading: "他社様で難しいと言われた案件" },
  technique: { kind: "technique", width: "narrow", emphasis: "normal", heading: "どうやって受けているか" },
  numbers: { kind: "figures", width: "full", emphasis: "lead" },
  materials: { kind: "materials", width: "wide", emphasis: "normal", heading: "対応できる材質" },
  equipment: { kind: "equipment", width: "wide", emphasis: "normal", heading: "主な設備" },
  photos: { kind: "gallery", width: "full", emphasis: "normal", heading: "工場・設備" },
  people: { kind: "people", width: "narrow", emphasis: "quiet", heading: "代表より" },
  history: { kind: "timeline", width: "narrow", emphasis: "quiet", heading: "沿革" },
};

/**
 * トップページの構成を決める。
 *
 * 並べ方の考え方：
 *   1. **最初の画面**（型で決まる。ここは触らない）
 *   2. **この会社を一言で言うもの**＝見立ての1位
 *   3. **加工事例**。最も問い合わせに繋がるので、上に置く（docs/06 ブロック4）
 *   4. 見立ての2位以降
 *   5. 補助情報（沿革・代表）は最後で、弱く
 *
 * **上限を設ける。** 全部載せると、結局どれも読まれない。
 */
export function composeTop(
  project: Project,
  a: Analysis,
  opts: { maxStrands?: number; hero?: string; hasProse?: boolean } = {},
): Section[] {
  const { maxStrands = 4, hero = "headline", hasProse = false } = opts;
  const p = project as any;
  const has = {
    cases: (p.cases ?? []).length > 0,
    prose: hasProse,
  };

  /**
   * **最初の画面と同じものを、すぐ下でもう一度出さない。**
   * 「対応範囲を先に」の型は、ロット・納期・精度を最初の画面に並べる。
   * その下に同じ数字の帯を置くと、同じ情報が1画面に二度出る（D-175で直したのと同じ間違い）。
   */
  const coveredByHero: Section["kind"][] = hero === "spec" ? ["figures"] : [];

  const out: Section[] = [{ kind: "hero", width: "normal", emphasis: "lead", why: "型で選ばれた最初の画面" }];

  // 見立ての上位。材料の無いものは analyze() の時点で落ちている
  const picked = a.strands
    .filter((s) => BY_STRAND[s.id] && !coveredByHero.includes(BY_STRAND[s.id]!.kind))
    .slice(0, maxStrands);

  const first = picked[0];
  if (first) out.push({ ...BY_STRAND[first.id]!, why: first.why });

  /**
   * 生成した散文は、**1位の直後**に置く。
   * 会社を一言で言う材料（他社が断った案件など）を見たあとに読むほうが入る。
   */
  if (has.prose) {
    out.push({ kind: "prose", width: "narrow", emphasis: "normal", slug: "index", why: "生成した紹介文" });
  }

  // 事例は上に。**最も問い合わせに繋がる**
  if (has.cases) {
    out.push({ kind: "cases", width: "wide", emphasis: "normal", heading: "加工事例", why: "最も問い合わせに繋がる" });
  }

  for (const s of picked.slice(1)) out.push({ ...BY_STRAND[s.id]!, why: s.why });

  return dedupe(out);
}

/**
 * 同じ種類のセクションを2つ出さない。
 * 見立ての都合で重なることがあるので、**最初のものを残す**。
 */
function dedupe(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections.filter((s) => {
    if (seen.has(s.kind)) return false;
    seen.add(s.kind);
    return true;
  });
}

/** 説明用。**なぜこの構成になったかを、社長に言えるようにしておく** */
export function explain(sections: Section[]): string {
  return sections
    .map((s, i) => `${i + 1}. ${s.heading ?? s.kind}　[${s.width}/${s.emphasis}]　${s.why ?? ""}`)
    .join("\n");
}
