/**
 * KOBO — ページ全体を見て、リズムと山を決める（Phase 4）
 *
 * **ここが「98万円に見えない」の直接の直し先である。**
 *
 * 【なぜ `decorate()` の中で書けないか】
 * `decorate()` は帯を1つずつ見る。だから
 * **「このページの山を1つにする」「密のあとに疎を置く」が構造上書けない。**
 * 実測でもそうなっていた（docs/30）。
 *
 *   組み方　5語彙あるのに、1ページに出るのは1種類（`d.layouts.find()` が先頭を返すだけ）
 *   余白　　全帯で同一（PC 88px／スマホ 40px）
 *   山　　　どのページでも最も大きいのは最初の画面。本文に入ると山が無い
 *
 * **列全体を見ないと決められないものを、ここで決める。**
 *
 * 【決めるのは語彙のIDだけ】
 * CSSもHTMLもここでは書かない。`Band.astro` が `data-*` に出し、`site.css` が受ける。
 * AIに書かせないのと同じ理由で、**こちらも語彙の外に出ない**（D-200）。
 *
 * 【材料が無ければ、山を作らない】
 * 山は「大きく見せる」ことなので、**中身が薄いと、薄いことが大きく見える。**
 * `canPeak`（材料と写真）と `fit()`（文字数）の両方を通す。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import type { Section } from "./sections.ts";
import { getDirection } from "./direction.ts";
import { materialsOf } from "./materials.ts";
import {
  PEAKS, canPeak, getPeak, type PeakId,
  type DensityId, type LayoutId, type TypeRoleId,
  fit, getTypeRole,
} from "./system/index.ts";

export interface Visual {
  /** この帯が画面の山か。**1ページに1つだけ `none` 以外になる** */
  peak: PeakId;
  /** 上下の余白 */
  density: DensityId;
  /** 組み方。`decorate()` が決めたものを、ページ全体の都合で上書きする */
  layout: LayoutId;
  /** 見出しの文字の役割 */
  role: TypeRoleId;
}

export type VisualSection = Section & { visual: Visual };

/**
 * 一覧として**速く読む**もの。詰めてよい。
 * 逆に散文・引用・大きな数字は**止まって読む**ので、空ける。
 *
 * **余白は飾りではなく、読む速度の指示である。**
 * 交互に変えるために変えるのではない（ご指示§7の「交互に配置する」は、
 * 意図の無い均一を禁じているのであって、機械的な交互を求めてはいない）。
 */
const SCANNED = new Set(["spec", "cardGrid", "chips", "list", "timeline", "process", "comparison"]);

/** 型の tone ごとに、どの山を先に試すか */
const PEAK_ORDER: Record<string, PeakId[]> = {
  spec: ["number", "spec", "statement", "process", "image"],
  story: ["statement", "process", "image", "spec", "number"],
  visual: ["image", "statement", "process", "spec", "number"],
};

/** その帯に置ける山を選ぶ。**無ければ `none`** */
function peakFor(sec: Section, project: Project, a: Analysis, tone: string): PeakId {
  const m = materialsOf(project, sec.content, a.hasRealPhotos);
  for (const id of PEAK_ORDER[tone] ?? PEAK_ORDER.spec!) {
    const peak = getPeak(id);
    if (!canPeak(peak, sec.content, a.hasRealPhotos, sec.presentation)) continue;
    /**
     * **薄い材料で山を作らない。** 2件しかない一覧を画面いっぱいにしても、
     * 2件しかないことが大きく見えるだけになる。
     */
    if (id === "spec" && (m.rows ?? m.count) < 3) continue;
    if (id === "process" && (m.steps ?? 0) < 2) continue;
    if (id === "number" && !m.hasStrongValue) continue;
    /** **見出しが長ければ、その役割では組めない**（D-251の再発防止） */
    if (sec.heading && fit(peak.role, sec.heading).id !== peak.role) continue;
    return id;
  }
  return "none";
}

/**
 * ページ全体の見せ方を決める。**帯の数も順番も変えない。**
 *
 * 変えるのは「どれくらいの余白で」「どの組み方で」「どの大きさの文字で」だけ。
 * **情報は1つも減らさない**（D-204）。
 */
export function composeVisual(
  sections: Section[],
  project: Project,
  a: Analysis,
  opts: { direction?: string } = {},
): VisualSection[] {
  const d = getDirection(opts.direction);
  const body = sections.filter((s) => s.kind !== "hero");

  // ── ① 山を1つ選ぶ ───────────────────────────────
  /**
   * **主役の帯から選ぶ。** どれが主役かは、もう決まっている（`emphasis: "lead"`）。
   * 主役で山が作れなければ、次に材料の厚い帯で試す。**それでも駄目なら山無し。**
   */
  let peakAt = -1;
  let peakId: PeakId = "none";
  const order = [
    ...body.map((s, i) => ({ s, i })).filter((x) => x.s.emphasis === "lead"),
    ...body.map((s, i) => ({ s, i })).filter((x) => x.s.emphasis !== "lead"),
  ];
  for (const { s, i } of order) {
    const id = peakFor(s, project, a, d.tone);
    if (id !== "none") { peakAt = i; peakId = id; break; }
  }

  // ── ② 余白 ─────────────────────────────────────
  const density: DensityId[] = body.map((s, i) => {
    if (i === peakAt) return "vast";
    if (s.emphasis === "quiet") return "tight";
    return SCANNED.has(s.presentation) ? "normal" : "loose";
  });
  /**
   * **同じ余白が3つ続いたら、3つ目をずらす。**
   * 内容から決めた結果が偶然そろうことはある。そのときだけ動かす。
   * **最初から交互にするのとは違う。** 理由のある値を優先し、単調だけを崩す。
   */
  const NEXT: Record<DensityId, DensityId> = { tight: "normal", normal: "loose", loose: "normal", vast: "loose" };
  for (let i = 2; i < density.length; i++) {
    if (density[i] === density[i - 1] && density[i - 1] === density[i - 2] && i !== peakAt) {
      density[i] = NEXT[density[i]!]!;
    }
  }

  // ── ③ 組み方 ───────────────────────────────────
  const has = (l: LayoutId) => d.layouts.includes(l);
  const layout: LayoutId[] = body.map((s, i) => {
    // 狭い帯は積むしかない（既存の理屈・`decorate()` と同じ）
    if (s.width === "narrow" && i !== peakAt) return "stack";
    if (i === peakAt) {
      /**
       * **山の組み方は、山の種類で決まる**（D-278）。
       *
       * 最初は「余白の取れる組み方」として一律 `offset` にしたが、画面を見て取り下げた。
       * `offset` は中身を12%押し出すので、**表の帯に当てると左がまるごと空く。**
       * 表が右にずれただけで、意図が読めない帯になった。
       *   値・一言　… 余白が効く（`offset` / `editorial`）
       *   表・一覧　… **幅を使い切るほうが強い**（`stack`）
       *   写真　　　… 全幅
       */
      if (peakId === "image" && has("fullbleed")) return "fullbleed";
      if (peakId === "spec") return "stack";
      if (has("editorial")) return "editorial";
      if (has("offset")) return "offset";
      return s.layout;
    }
    // 一覧は、見出しを横に置くと読みやすい
    if (SCANNED.has(s.presentation) && has("split")) return "split";
    // 読ませるものは、余白を大きく取れる組み方へ
    if (!SCANNED.has(s.presentation)) {
      if (has("editorial")) return "editorial";
      if (has("offset")) return "offset";
    }
    return s.layout;
  });
  /** **同じ組み方が3つ続いたら、3つ目を型の別の候補へ。** 余白と同じ考え方 */
  for (let i = 2; i < layout.length; i++) {
    if (layout[i] === layout[i - 1] && layout[i - 1] === layout[i - 2] && i !== peakAt) {
      const other = d.layouts.find((l) => l !== layout[i] && (l !== "fullbleed" || a.hasRealPhotos));
      if (other) layout[i] = other;
    }
  }

  // ── ④ 見出しの文字 ─────────────────────────────
  const role: TypeRoleId[] = body.map((s, i) =>
    i === peakAt ? getPeak(peakId).role : (s.emphasis === "quiet" ? "label" : "sectionTitle"));

  let b = 0;
  return sections.map((s) => {
    if (s.kind === "hero") {
      return { ...s, visual: { peak: "none", density: "normal", layout: s.layout, role: "heroTitle" } };
    }
    const i = b++;
    return { ...s, visual: { peak: i === peakAt ? peakId : "none", density: density[i]!, layout: layout[i]!, role: role[i]! } };
  });
}

/** 検証用。**山が1つだけであることを、外から数えられるようにする** */
export const peakCount = (list: VisualSection[]): number =>
  list.filter((s) => s.visual.peak !== "none").length;
