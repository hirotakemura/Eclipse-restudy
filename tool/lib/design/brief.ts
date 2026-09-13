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
 */

import {
  CONTENTS, PRESENTATIONS, SURFACES, LAYOUTS, HEROES, MOTIFS, MEDIA, MOTIONS,
  canPresent, hasMaterial, type Materials,
  type ContentId, type PresentationId, type SurfaceId, type LayoutId,
  type MotifId, type MediaId, type MotionId, type HeroId,
} from "./system/index.ts";

/**
 * 最大の強み。**推測で決めない**（D-205）。
 * 根拠となる聞き取りが無ければ `unknown` とし、規則版の安全な構成へ落とす。
 */
export type PrimaryStrength =
  | "precision" | "difficulty" | "response" | "coverage"
  | "design" | "equipment" | "craft" | "heritage" | "unknown";

export const PRIMARY_STRENGTHS: PrimaryStrength[] = [
  "precision", "difficulty", "response", "coverage",
  "design", "equipment", "craft", "heritage", "unknown",
];

export interface BriefBlock {
  content: ContentId;
  presentation: PresentationId;
  emphasis: "lead" | "normal" | "quiet";
  surface?: SurfaceId;
  layout?: LayoutId;
  media?: MediaId;
}

export interface DesignBrief {
  primaryStrength: PrimaryStrength;
  hero: { form: HeroId; media: MediaId };
  blocks: BriefBlock[];
  motif: MotifId;
  motionLevel: MotionId;
  /** なぜこうしたか。**社長に説明できるようにする**（D-184）。検査はしない */
  why?: string;
  /** この Brief がどの案件データから作られたか（ご指示④） */
  sourceProjectHash?: string;
}

export interface BriefProblem {
  /** どの段で落ちたか */
  stage: "form" | "vocabulary" | "compatibility" | "material";
  where: string;
  message: string;
}

const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
const EMPHASIS = new Set(["lead", "normal", "quiet"]);

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
  const KNOWN = new Set(["primaryStrength", "hero", "blocks", "motif", "motionLevel", "why", "sourceProjectHash"]);
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

/** 案件データが変わったら Brief を作り直すための印（ご指示④） */
export function projectHash(project: unknown): string {
  const s = JSON.stringify(project);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
