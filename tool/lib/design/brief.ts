/**
 * KOBO — Design Brief と、その検査
 *
 * **AIに「自由にデザインさせる」のではない**（D-206）。
 * 返させるのは**語彙のIDだけ**で、文章も数値も作らせない（D-200）。
 *
 * 検査は4段（D-208）。**どこで落ちても生成は止めない。規則版に落とす。**
 * 止まらないことが要件である。
 *
 *   1. 形    JSONとして読めるか。知らないキーが無いか
 *   2. 語彙   すべての値が語彙表にあるか
 *   3. 可否   content × presentation が可否表の○か
 *   4. 材料   その表現に必要なデータが実際にあるか
 *   5. 情報量 規則版より、画面に出る情報が減っていないか（D-259）
 *
 * **5段目は、AIの判断にだけ当てる。** 規則版は材料を見て選んでいるので制限しない。
 */

import {
  CONTENTS, PRESENTATIONS, SURFACES, LAYOUTS, HEROES, MOTIFS, MEDIA, MOTIONS,
  canPresent, hasMaterial, type Materials,
  type ContentId, type PresentationId, type SurfaceId, type LayoutId,
  type MotifId, type MediaId, type MotionId, type HeroId,
} from "./system/index.ts";
/**
 * 最大の強みの語彙は、**`analysis.ts` が単一の正**。
 *
 * ここに書き写していた表は、`analyze()` が一度も返さない値（`response` `coverage`
 * `design` `heritage`）を並べていた。つまり **`speed` を返しても「語彙にありません」で
 * 落ちる検査**になっていた。表を2箇所に置いた時点で、ずれるのは時間の問題だった（D-197）。
 */
import { PRIMARY_STRENGTHS, type PrimaryStrength } from "./analysis.ts";
export { PRIMARY_STRENGTHS, type PrimaryStrength };

/**
 * 強さ。**3段で固定**（ご指示）。
 * `support` は新設しない。CSS と検査もこの3つで動いている。
 */
export type Emphasis = "lead" | "normal" | "quiet";
export const EMPHASES: Emphasis[] = ["lead", "normal", "quiet"];

export interface BriefBlock {
  content: ContentId;
  presentation: PresentationId;
  emphasis: Emphasis;
  surface?: SurfaceId;
  layout?: LayoutId;
  media?: MediaId;
}

/**
 * Brief 本体。**AIが触れてよいのはこの形だけ。**
 *
 * `blocks` は**順序に意味がある**（前にあるものほど先に見せる）。
 * ご指示の `priority` はこれにあたる。名前を2つ持たない。
 */
export interface DesignBrief {
  primaryStrength: PrimaryStrength;
  /** 2番目の強み。主役を入れ替えてよいかの判断に使う */
  secondaryStrength: PrimaryStrength;
  hero: { form: HeroId; media: MediaId };
  blocks: BriefBlock[];
  motif: MotifId;
  motionLevel: MotionId;
  /** なぜこうしたか。**社長に説明できるようにする**（D-184）。検査はしない */
  why?: string;
  /** この Brief がどの案件データから作られたか（ご指示④） */
  sourceProjectHash?: string;
}

/** 最終判断の出所 */
export type BriefSource = "rules" | "ai" | "ai-fallback";

/**
 * 1つの帯について、**誰が何を決めたか**（ご指示）。
 *
 * 「AIは判断を変えたが、実際のHTMLでは何が変わったのか」を後から確かめるためのもの。
 * **`final` は描く直前の値**であって、AIが言った値ではない。
 * Brief 経由でも可否表と材料をもう一度通すので、**AIの判断がここで落ちることがある。**
 */
export interface BriefTrace {
  content: ContentId;
  heading: string;
  /** 1. 規則版の判断 */
  rules: { presentation: PresentationId; emphasis: Emphasis };
  /** 2. AI版の判断。AIを使っていなければ null */
  ai: { presentation: PresentationId; emphasis: Emphasis } | null;
  /** 3. 最終的に画面へ出たもの */
  final: { presentation: PresentationId; emphasis: Emphasis };
  /** 4. その出所 */
  source: BriefSource;
}

/**
 * 案件データに保存する形。**本体＋来歴**。
 *
 * 来歴を本体と分けるのは、**検査に通すのは本体だけ**にするため。
 * AIが `source: "rules"` と書いて出所を偽れる形にしない。
 */
export interface StoredBrief extends DesignBrief {
  source: BriefSource;
  /** 規則版とまったく同じ判断だったか。**同じでも失敗ではない**（ご指示） */
  agreedWithRules: boolean;
  /** 4段検査で落ちた内容。`ai-fallback` のときだけ中身が入る */
  problems: BriefProblem[];
  generatedAt: string;
}

export interface BriefProblem {
  /** どの段で落ちたか */
  stage: "form" | "vocabulary" | "compatibility" | "material" | "information";
  where: string;
  message: string;
}

const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
const EMPHASIS = new Set<string>(EMPHASES);

/**
 * Brief を検査する。**問題の一覧を返す。空なら合格。**
 *
 * @param materialsOf その内容の材料を返す関数。4段目で使う
 */
export function validateBrief(
  raw: unknown,
  materialsOf: (content: ContentId) => Materials,
): BriefProblem[] {
  const problems: BriefProblem[] = [];
  const bad = (stage: BriefProblem["stage"], where: string, message: string) =>
    problems.push({ stage, where, message });

  // ── 1. 形 ────────────────────────────────
  if (typeof raw !== "object" || raw === null) {
    bad("form", "全体", "JSONのオブジェクトではありません");
    return problems;
  }
  const b = raw as Record<string, unknown>;
  const KNOWN = new Set(["primaryStrength", "secondaryStrength", "hero", "blocks", "motif", "motionLevel", "why", "sourceProjectHash"]);
  for (const k of Object.keys(b)) {
    if (!KNOWN.has(k)) bad("form", k, "知らない項目です");
  }
  if (!Array.isArray(b.blocks)) {
    bad("form", "blocks", "配列ではありません");
    return problems;
  }
  if (b.blocks.length === 0) bad("form", "blocks", "空です");
  if (typeof b.hero !== "object" || b.hero === null) bad("form", "hero", "ありません");

  // ── 2. 語彙 ──────────────────────────────
  const inList = (v: unknown, set: Set<string>) => typeof v === "string" && set.has(v);
  if (!inList(b.primaryStrength, new Set(PRIMARY_STRENGTHS))) {
    bad("vocabulary", "primaryStrength", `語彙にありません：${String(b.primaryStrength)}`);
  }
  // 2番目は省略できる（無い会社がある）。書いてあれば語彙を見る
  if (b.secondaryStrength !== undefined && !inList(b.secondaryStrength, new Set(PRIMARY_STRENGTHS))) {
    bad("vocabulary", "secondaryStrength", `語彙にありません：${String(b.secondaryStrength)}`);
  }
  if (!inList(b.motif, ids(MOTIFS))) bad("vocabulary", "motif", `語彙にありません：${String(b.motif)}`);
  if (!inList(b.motionLevel, ids(MOTIONS))) bad("vocabulary", "motionLevel", `語彙にありません：${String(b.motionLevel)}`);

  const hero = (b.hero ?? {}) as Record<string, unknown>;
  if (!inList(hero.form, ids(HEROES))) bad("vocabulary", "hero.form", `語彙にありません：${String(hero.form)}`);
  if (!inList(hero.media, ids(MEDIA))) bad("vocabulary", "hero.media", `語彙にありません：${String(hero.media)}`);

  const blocks = b.blocks as Record<string, unknown>[];
  blocks.forEach((blk, i) => {
    const at = `blocks[${i}]`;
    if (!inList(blk.content, ids(CONTENTS))) bad("vocabulary", `${at}.content`, `語彙にありません：${String(blk.content)}`);
    if (!inList(blk.presentation, ids(PRESENTATIONS))) bad("vocabulary", `${at}.presentation`, `語彙にありません：${String(blk.presentation)}`);
    if (!inList(blk.emphasis, EMPHASIS)) bad("vocabulary", `${at}.emphasis`, `語彙にありません：${String(blk.emphasis)}`);
    if (blk.surface !== undefined && !inList(blk.surface, ids(SURFACES))) bad("vocabulary", `${at}.surface`, `語彙にありません：${String(blk.surface)}`);
    if (blk.layout !== undefined && !inList(blk.layout, ids(LAYOUTS))) bad("vocabulary", `${at}.layout`, `語彙にありません：${String(blk.layout)}`);
    if (blk.media !== undefined && !inList(blk.media, ids(MEDIA))) bad("vocabulary", `${at}.media`, `語彙にありません：${String(blk.media)}`);
  });

  // 語彙で落ちているものは、可否も材料も見ない（意味のない指摘を重ねない）
  if (problems.some((p) => p.stage === "vocabulary")) return problems;

  // ── 3. 可否 ──────────────────────────────
  blocks.forEach((blk, i) => {
    const c = blk.content as ContentId, p = blk.presentation as PresentationId;
    if (!canPresent(c, p)) {
      bad("compatibility", `blocks[${i}]`, `「${c}」を「${p}」では見せられません（可否表）`);
    }
  });
  if (problems.some((p) => p.stage === "compatibility")) return problems;

  // ── 4. 材料 ──────────────────────────────
  blocks.forEach((blk, i) => {
    const c = blk.content as ContentId, p = blk.presentation as PresentationId;
    if (!hasMaterial(p, materialsOf(c))) {
      bad("material", `blocks[${i}]`, `「${p}」に必要な材料が「${c}」にありません`);
    }
  });

  return problems;
}

/**
 * 案件データが変わったら Brief を作り直すための印（ご指示④）。
 *
 * **必ず `projectHashOf` を通すこと。** 直接呼ぶと、
 * 「保存するときは生データ、照合するときは落としたデータ」のように
 * 見る対象がずれ、**変えていないのに毎回「古い Brief です」と言われる**ようになる。
 */
export function projectHash(project: unknown): string {
  const s = JSON.stringify(project);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Brief の印を取る、唯一の入口。
 *
 * **Brief 自身は数えない。** 数えると、保存するたびに印が変わって永久に一致しない。
 * **提案（`designBriefProposal`）も数えない**（D-256）。数えると、
 * 提案を保存した瞬間に印が変わり、**「案件データが変わりました」と嘘をつく**ことになる。
 * **生の案件データを見る。** 未確認で落とす前の状態が変われば、見せ方の前提も変わる。
 */
export function projectHashOf(project: unknown): string {
  const { designBrief, designBriefProposal, ...bare } = (project ?? {}) as Record<string, unknown>;
  return projectHash(bare);
}
