/**
 * KOBO — 規則版の Design Brief
 *
 * **ここは新しい判断をしない。**
 * いま `playbook.ts` と `sections.ts` が暗黙に決めているものを、
 * **Brief という一枚の形にして見えるようにするだけ**である。
 *
 * そうする理由は2つ。
 *   ① AI版と**同じ土俵で並べて比べられる**ようにするため（ご指示）
 *   ② AIに「たたき台」として渡すため。白紙から考えさせない
 *
 * **この Brief を `composeTop` に渡しても、出力は変わらない。**
 * 変わったら、それは規則版の判断と食い違っているということなので、試験で落とす。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import type { ContentId, PresentationId } from "./system/index.ts";
import { hasMaterial, usablePresentations } from "./system/index.ts";
import { getDirection } from "./direction.ts";
import { materialsOf } from "./materials.ts";
import { composeTop, composePage, pickMotif, resolveHero, type Section } from "./sections.ts";
import { type BriefBlock, type DesignBrief, type StoredBrief } from "./brief.ts";

export interface BriefContext {
  hero: string;
  direction: string;
  hasProse: boolean;
}

/**
 * このページ群に出てくる帯を、最初に出てきた順で全部たどる。
 *
 * **トップだけを見ない。** 対応可能範囲・強み・設備のページにしか出ない内容
 * （仕様表・保有設備一覧・お客様の言葉）があり、そこを Brief から外すと、
 * **AIが「その内容は無いもの」として順位をつけてしまう。**
 */
function allSections(project: Project, a: Analysis, ctx: BriefContext): Section[] {
  const { hero, direction, hasProse } = ctx;
  return [
    ...composeTop(project, a, { hero, direction, hasProse }),
    ...composePage("strengths", project, a, { direction, hasProse }),
    ...composePage("capability", project, a, { direction, hasProse }),
    ...composePage("equipment", project, a, { direction, hasProse }),
  ];
}

/** 規則版がいま出している判断を、そのまま Brief にする */
export function ruleBrief(project: Project, a: Analysis, ctx: BriefContext): DesignBrief {
  const d = getDirection(ctx.direction);
  const blocks: BriefBlock[] = [];
  const seen = new Set<ContentId>();
  for (const s of allSections(project, a, ctx)) {
    if (s.kind === "hero" || s.content === "draft" || seen.has(s.content)) continue;
    /**
     * **材料の無い内容は Brief に載せない。**
     *
     * 写真を1枚も預かっていない案件でも、設備ページには写真の帯が出る（中身は空になる）。
     * これを Brief に書くと、**規則版の Brief が自分の4段検査に落ちる**ことになり、
     * 「AIが悪いのか、こちらが悪いのか」が分からなくなる。
     * 材料が無いものは Brief から外し、**規則版にそのまま任せる**（帯は消さない・D-204）。
     */
    const m = materialsOf(project, s.content, a.hasRealPhotos);
    if (!hasMaterial(s.presentation, m)) continue;
    seen.add(s.content);
    blocks.push({ content: s.content, presentation: s.presentation, emphasis: s.emphasis });
  }
  return {
    primaryStrength: a.primaryStrength,
    secondaryStrength: a.secondaryStrength,
    hero: { form: resolveHero(ctx.hero, a, ctx.direction) as any, media: a.hasRealPhotos ? "full" : "none" },
    blocks,
    motif: pickMotif(d.motifs, a),
    motionLevel: d.motion,
    why: `規則版：${a.primaryWhy}`,
    /**
     * **印はここでは付けない。** ここが見ているのは未確認を落としたあとのデータで、
     * 照合する側（build-site）が見るのは生の案件データなので、付けるとずれる。
     * 保存するとき（`brief.mjs` の `writeBrief`）に、生データから取った印を入れる。
     */
  };
}

/** 保存する形にする。**来歴は本体と分ける**（出所を偽らせない） */
export const stored = (
  brief: DesignBrief,
  source: StoredBrief["source"],
  agreedWithRules: boolean,
  problems: StoredBrief["problems"] = [],
): StoredBrief => ({
  ...brief, source, agreedWithRules, problems, generatedAt: new Date().toISOString(),
});

/**
 * AIに渡す「選べるもの」の一覧。
 *
 * **可否表と材料を先に通した結果だけを見せる**（D-208）。
 * 選べないものを見せて「選ぶな」と書くより、**最初から見せないほうが確実**である。
 */
export function candidatesFor(
  project: Project, a: Analysis, contents: ContentId[],
): { content: ContentId; usable: PresentationId[] }[] {
  return contents.map((content) => ({
    content,
    usable: usablePresentations(content, materialsOf(project, content, a.hasRealPhotos)),
  }));
}

/** 2つの Brief が同じ判断かどうか（順序も見る） */
export function sameDecision(x: DesignBrief, y: DesignBrief): boolean {
  const key = (b: DesignBrief) =>
    [b.primaryStrength, b.secondaryStrength,
      ...b.blocks.map((v) => `${v.content}:${v.presentation}:${v.emphasis}`)].join("|");
  return key(x) === key(y);
}
