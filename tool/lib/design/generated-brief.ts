/**
 * KOBO — 視覚言語と、生成ビジュアルの注文書をつくる（第9段階・規則版）
 *
 * **ここでは画像を作らない。** 作るのは「どういう絵を、何のために、どこへ置くか」だけである。
 * 画像生成APIはこの環境には無い（`docs/36` §0）ので、**注文書は人が外へ持っていける形**で出す。
 *
 * 【会社ごとに違う絵になること】
 * 勝ち筋から視覚言語（軸）を引き、**会社の材料で4つ修飾する**——
 * 材質・型の気分・密度・光。同じ `precision` でも、
 * アルミの会社と鋳鉄の会社では別の絵になる。**乱数もAIも使わない。**
 *
 * 【増やさない】
 * 1サイト2〜4枚まで（`MAX_GENERATED`）。**主題は描ける5つだけ。**
 * 材料が無ければ作らない——`none` は失敗ではない（docs/31 原則①）。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import { getDirection } from "./direction.ts";
import { resolveTheme } from "../theme.ts";
import { projectHashOf } from "./brief.ts";
import {
  DRAWABLE, MAX_GENERATED, NEGATIVE_PROMPT, assertGenerated, getVisualLanguage, LANGUAGE_OF,
  type AssetSubject, type GeneratedPurpose, type GeneratedVisual, type VisualLanguageId,
} from "./system/index.ts";

/**
 * 視覚言語（方針）。**会社データから引く。**
 *
 * `axis` は勝ち筋のもの、`material` / `mood` / `density` / `light` は会社のものである。
 * ここが「会社Aと会社Bで絵が変わる」の実体で、**同じ型でも中身が違えば違う絵になる。**
 */
export interface VisualLanguagePlan {
  id: VisualLanguageId;
  label: string;
  axis: string[];
  /** 材質。`capability.materials` から引く（英語。生成サービスに渡す言葉） */
  material: string;
  /** 気分。型の `tone` と `mood`（かたい／標準／やわらかい）から */
  mood: string;
  /** 密度。第7段階⑥の `typeScale` と帯の余白から */
  density: string;
  /** 光。配色の明暗と、その型が使う面から */
  lighting: string;
  /** なぜこうなったか。**社長が説明できるように**（D-184） */
  why: string;
}

/** 材質の言い方。**聞き取った材質をそのまま英語にするだけ**（新しい事実を作らない） */
const MATERIAL_WORDS: [RegExp, string][] = [
  [/アルミ/, "pale aluminium surface"],
  [/ステンレス|SUS/, "brushed stainless surface"],
  [/鋳鉄|鋼|鉄|SS400|S45C/, "dark cast iron surface"],
  [/チタン/, "titanium surface with faint iridescence"],
  [/樹脂|プラ|POM|ABS/, "matte polymer surface"],
  [/銅|真鍮|黄銅/, "warm brass surface"],
  [/木|集成材/, "grained timber surface"],
];

const materialOf = (project: Project): { word: string; from: string } => {
  const list: string[] = (project as any)?.capability?.materials ?? [];
  for (const [re, word] of MATERIAL_WORDS) {
    const hit = list.find((m) => re.test(m));
    if (hit) return { word, from: hit };
  }
  /** 材質を聞けていない会社。**素材を作らない**——面だけの絵にする */
  return { word: "neutral matte surface", from: "（材質は未取得）" };
};

const MOOD_WORDS: Record<string, string> = {
  katai: "hard-edged, high contrast, disciplined",
  futsu: "calm, balanced, quiet",
  yawaraka: "soft, low contrast, unhurried",
};

const TONE_WORDS: Record<string, string> = {
  spec: "precise and factual",
  story: "narrative and patient",
  visual: "visual and immediate",
};

/** **会社の視覚言語を決める。** 材料が無ければ `none`（絵を作らない） */
export function visualLanguageOf(project: Project, a: Analysis, direction?: string): VisualLanguagePlan {
  const d = getDirection(direction ?? (project as any)?.theme?.direction);
  const theme = resolveTheme((project as any)?.theme,
    (project as any)?.formSet === "general" ? "general" : "manufacturing");
  const id = LANGUAGE_OF[a.primaryStrength] ?? "none";
  const lang = getVisualLanguage(id);
  const mat = materialOf(project);

  /** 密度は、第7段階⑥で決めた「段の強さ」の裏返し。**詰める型は密に、ゆるい型は疎に** */
  const density = theme.mood.typeScale >= 1.1 ? "dense composition, little empty space"
    : theme.mood.typeScale <= 0.95 ? "sparse composition, generous empty space"
    : "measured composition, balanced empty space";

  /** 光は、その型が暗い面を使うかどうかで決める。**配色の言い方はしない**（色はCSSが持つ） */
  const dark = d.surfaces.includes("dark") || d.surfaces.includes("accent");
  const lighting = dark
    ? "single directional light, deep shadows, dark background"
    : "even diffused light, pale background, no harsh shadow";

  return {
    id: lang.id, label: lang.label, axis: lang.axis,
    material: mat.word,
    mood: `${MOOD_WORDS[theme.mood.id] ?? MOOD_WORDS.futsu}, ${TONE_WORDS[d.tone] ?? TONE_WORDS.spec}`,
    density, lighting,
    why: lang.id === "none"
      ? `勝ち筋（${a.primaryStrength}）から絵の方針が引けないので、生成ビジュアルは作らない`
      : `勝ち筋 ${a.primaryStrength} → ${lang.label}。材質「${mat.from}」・型「${d.label}」・`
        + `${theme.mood.label}の余白から、${dark ? "締まった光" : "均質な光"}で組む`,
  };
}

/** 用途ごとの置き場所と、構図の方針。**全帯には入れない**（4つだけ） */
const PURPOSE: Record<GeneratedPurpose, {
  page: string; slot: string; role: GeneratedVisual["placement"]["role"];
  aspect: string; cropSafe: string; textSafe: GeneratedVisual["mobile"]["textSafeArea"];
  focal: { x: number; y: number }; composition: string; why: string;
}> = {
  firstView: {
    page: "index", slot: "hero", role: "background",
    aspect: "21:9", cropSafe: "4:5", textSafe: "left", focal: { x: 0.72, y: 0.45 },
    /** **打ち消しに書いた言葉は、注文書の側にも書けない**（`assertGenerated` が弾く）。
     *  「見出しが乗るので空ける」は「空ける」とだけ書く */
    composition: "wide asymmetric composition, interest on the right third, "
      + "large calm empty area across the left third",
    why: "最初の画面。**見出しと札はそのまま上に乗る**ので、左側は空けて描かせる",
  },
  strength: {
    page: "index", slot: "technique", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "bottom", focal: { x: 0.5, y: 0.35 },
    composition: "centred abstract composition, detail across the upper half, "
      + "quiet empty lower half",
    why: "技術の帯。**文章が主役のまま**にするため、下半分を空ける",
  },
  company: {
    page: "company", slot: "history", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "none", focal: { x: 0.5, y: 0.5 },
    composition: "very quiet full-frame texture, no focal object, even distribution",
    why: "会社の帯。地に沈める。**焦点を作らない**",
  },
  peak: {
    page: "index", slot: "declined", role: "background",
    aspect: "16:9", cropSafe: "4:5", textSafe: "top", focal: { x: 0.5, y: 0.6 },
    composition: "single abstract form, generous margin, upper area kept empty",
    why: "中盤の山。**実写があるときは作らない**——実物のほうが強い",
  },
};

const SUBJECT_FOR = (lang: ReturnType<typeof getVisualLanguage>, i: number): AssetSubject =>
  lang.subjects[i % Math.max(lang.subjects.length, 1)] ?? "geometry";

/**
 * プロンプトを組む。
 *
 * **汎用の一文にしない**（ご指示）。入れるのは
 * 視覚言語の軸・材質・主題・構図・光・密度・比・**置かれる場所の余白**の8つで、
 * すべて会社データか型から来ている。
 */
function promptOf(plan: VisualLanguagePlan, subject: AssetSubject, spec: typeof PURPOSE[GeneratedPurpose]): string {
  const SUBJECT_WORDS: Record<string, string> = {
    geometry: "abstract geometric forms",
    light: "gradients of light across a plane",
    texture: "close abstract surface texture",
    grid: "fine orthogonal grid structure",
    dimension: "thin measurement lines and reference marks",
  };
  return [
    "abstract non-representational image for a website background",
    SUBJECT_WORDS[subject] ?? SUBJECT_WORDS.geometry,
    plan.axis.join(", "),
    plan.material,
    spec.composition,
    plan.lighting,
    plan.mood,
    plan.density,
    `aspect ratio ${spec.aspect}`,
    "must stay legible when cropped to " + spec.cropSafe + " on a phone",
    "no recognisable object, no readable mark of any kind",
  ].join(", ");
}

/**
 * 注文書を作る。**必ず `assertGenerated` を通してから返す。**
 *
 * 作る枚数は材料で決まる。**上限4枚、方針が無ければ0枚。**
 */
export function planGeneratedVisuals(
  project: Project, a: Analysis, direction?: string,
): { language: VisualLanguagePlan; visuals: GeneratedVisual[] } {
  const language = visualLanguageOf(project, a, direction);
  if (language.id === "none") return { language, visuals: [] };

  const lang = getVisualLanguage(language.id);
  const d = getDirection(direction ?? (project as any)?.theme?.direction);
  const hash = projectHashOf(project).slice(0, 8);

  /** どの用途を作るか。**材料を見て決める。埋めるために作らない** */
  const wanted: GeneratedPurpose[] = ["firstView"];
  if (a.strands?.some((s: any) => s.id === "technique")) wanted.push("strength");
  if ((project as any)?.basics?.founded || (project as any)?.basics?.history) wanted.push("company");
  /** **実写があるなら山は実写に譲る**（生成は実写の代用品ではない） */
  if (!a.hasRealPhotos && wanted.length < MAX_GENERATED) wanted.push("peak");

  const visuals: GeneratedVisual[] = wanted.slice(0, MAX_GENERATED).map((purpose, i) => {
    const spec = PURPOSE[purpose];
    const subject = SUBJECT_FOR(lang, i);
    return {
      visualId: `${hash}-${purpose}`,
      purpose, source: "generated", intent: "atmosphere", subject,
      direction: d.id, language: language.id,
      mood: language.mood, composition: spec.composition,
      material: language.material, lighting: language.lighting,
      aspectRatio: spec.aspect,
      placement: { page: spec.page, slot: spec.slot, role: spec.role },
      mobile: { focalPoint: spec.focal, cropSafe: spec.cropSafe, textSafeArea: spec.textSafe },
      prompt: promptOf(language, subject, spec),
      negativePrompt: NEGATIVE_PROMPT,
      provenance: {},
      status: "brief",
      why: spec.why,
    };
  });
  assertGenerated(visuals);
  return { language, visuals };
}

/** 保存する形。**来歴は本体と分けない**——1枚ごとに持つ（画像ごとに出所が違うため） */
export interface StoredVisualPlan {
  language: VisualLanguagePlan;
  visuals: GeneratedVisual[];
  sourceProjectHash: string;
  generatedAt: string;
}

export const storedPlan = (
  project: Project, plan: { language: VisualLanguagePlan; visuals: GeneratedVisual[] },
): StoredVisualPlan => ({
  ...plan, sourceProjectHash: projectHashOf(project), generatedAt: new Date().toISOString(),
});

export { DRAWABLE };
