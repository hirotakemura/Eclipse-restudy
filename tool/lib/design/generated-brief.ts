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

/**
 * ── 会社固有の手がかり（第9段階②）─────────────────
 *
 * **ここが「別の会社でも成立するプロンプト」を潰す層である。**
 *
 * 1枚目を実際に生成して分かったこと：`material transformation` のような
 * **勝ち筋そのままの言葉は、抽象すぎて絵にならない。**
 * 出てきたのは「きれいなアルミの面」で、**アルミを扱うどの会社でも成立する絵**だった。
 *
 * だから、勝ち筋（15分類）ではなく**その会社が実際に話した言葉**から拾う。
 *   form    何を扱っているか（薄肉・複雑形状・小ロット／古い設備・浴室）
 *   problem 何を解決しているか（歪む・反る・ビビる／部品が無い）
 *   act     何をしているか（支持点で押さえる・削る順番／すぐ着く・在庫を持つ）
 *   scale   どの細かさの世界か（公差の桁）
 *
 * **一対一の対応表にしない。** 当たったものが全部、視覚の句として積み上がる。
 * **何も当たらなければ、何も足さない**——作り話をしないためである（D-116）。
 */
export interface CompanySignals {
  form: string[];
  problem: string[];
  act: string[];
  /** 続いてきた時間。**会社の帯だけが主役にする**（ほかと同じ絵にしないため） */
  time: string[];
  scale: string;
  /** 拾った元の言葉。**人が「なぜこの絵なのか」を追えるように** */
  from: string[];
}

/** 手がかり → 視覚の句。**絵の内容ではなく、絵の性質を書く** */
const CUES: { re: RegExp; kind: "form" | "problem" | "act" | "time"; word: string }[] = [
  // ── 形 ──
  { re: /薄肉|薄物|薄板/, kind: "form", word: "extremely thin walled planes, almost translucent at the edge" },
  { re: /複雑形状|複雑な形状|異形/, kind: "form", word: "compound curvature that changes direction twice" },
  { re: /小ロット|1個から|試作/, kind: "form", word: "a single unique form, not a repeated series" },
  { re: /量産|5,000個|数千個/, kind: "form", word: "the same form repeated in an even rank" },
  { re: /古い設備|部品供給|廃番|型式/, kind: "form", word: "an older surface that has been kept in service" },
  { re: /浴室|給湯|水まわり|配管/, kind: "form", word: "smooth domestic surfaces and clean water-like reflections" },
  { re: /半導体|装置部品/, kind: "form", word: "flat precision planes with fine parallel steps" },
  // ── 課題 ──
  { re: /歪(み|む)|反(り|る)/, kind: "problem", word: "a plane under tension, minutely out of true" },
  { re: /ビビ|振動|割れ/, kind: "problem", word: "a threshold where a surface is about to give way" },
  { re: /断られ|無理と言われ|敬遠/, kind: "problem", word: "a boundary others stopped at, crossed quietly" },
  { re: /交換|買い替え|全面改装/, kind: "problem", word: "one part renewed inside something otherwise intact" },
  { re: /価格|相見積/, kind: "problem", word: "value that is not visible in the surface itself" },
  // ── 行為 ──
  { re: /治具|支持点|押さえ|固定/, kind: "act", word: "unseen support points holding a fragile shape steady" },
  { re: /削る順番|加工順序|工程間|段取り/, kind: "act", word: "an ordered sequence of passes, each one lighter" },
  { re: /休ませ|寝かせ|時間を置/, kind: "act", word: "a pause between two states, stress released" },
  { re: /図面|設計|意図/, kind: "act", word: "an intention read from a drawing before it is cut" },
  { re: /測定|検査|三次元/, kind: "act", word: "reference planes from which everything is measured" },
  { re: /在庫|すぐ|1時間|即日/, kind: "act", word: "everything needed already at hand, nothing waiting" },
  { re: /修理|直す|探して/, kind: "act", word: "continuity kept rather than replaced" },
  /**
   * ── ものを作らない会社の手がかり ──────────────
   * **業種で決めているのではない。** 上と同じで、**その会社が話した言葉**を拾っている。
   * 汎用の会社（士業・美容・工務店）で手がかりが0〜1件しか拾えず、
   * **プロンプトが9割一致した**ので足した（検査が先に見つけた）。
   */
  { re: /規則|条文|協定|法改正|制度/, kind: "form", word: "layered translucent sheets, one aligned over another" },
  { re: /履歴|記録|カルテ|経過/, kind: "form", word: "a faint trace of every earlier state, still readable" },
  { re: /築[0-9]+年|old|古い家|住まい|住宅/, kind: "form", word: "a surface that has weathered evenly over a long time" },
  { re: /髪|施術|薬剤|矯正/, kind: "form", word: "fine filaments falling in one direction, soft and even" },
  { re: /建て替え|葺き替え|全面|やり直し/, kind: "problem", word: "something whole, kept whole, instead of begun again" },
  { re: /断られ|対応できない|前例が無い/, kind: "problem", word: "a case no one else would take, held calmly" },
  { re: /不安|分からな|判断が/, kind: "problem", word: "a blur that resolves as it is looked at longer" },
  { re: /要らない|不要|勧めてこな|押し売り/, kind: "act", word: "restraint: only the part that needed touching is different" },
  { re: /現地|現場|見に来|訪問/, kind: "act", word: "attention paid at close range before anything is decided" },
  { re: /切り分け|原因|見立て/, kind: "act", word: "one true cause separated from what merely looked like it" },
  // ── 続いてきた時間（会社の帯だけが使う） ──
  { re: /創業|創立|明治|大正|昭和|19[0-9]{2}年/, kind: "time", word: "many thin layers settled one on another over decades" },
  { re: /代替わり|二代目|三代目|承継|先代/, kind: "time", word: "two surfaces of different age meeting without a seam" },
  { re: /続け|変わらず|守っ|以来/, kind: "time", word: "an unchanged surface, worn only by use" },
  { re: /家族|社員[0-9]+名|少人数/, kind: "time", word: "a small number of elements, each one distinct" },
];

/** 公差の桁から、絵の「距離」を決める。**数字は絵に書かせない**（言うのは距離だけ） */
function scaleOf(project: Project): string {
  const t: string = (project as any)?.capability?.tolerance ?? "";
  const m = /([0-9]*\.?[0-9]+)\s*mm/.exec(t);
  if (!m) return "read at arm's length, whole-surface view";
  const v = Number(m[1]);
  if (v <= 0.005) return "seen far closer than the eye normally reads a surface";
  if (v <= 0.02) return "seen close, at the distance where a surface stops looking flat";
  return "read at arm's length, whole-surface view";
}

/**
 * 会社の言葉から手がかりを拾う。**同じ言葉を2度使わない。**
 * 拾う先は強み・事例・問い合わせの本文で、**数値も固有名詞も絵に渡さない。**
 */
export function companySignals(project: Project): CompanySignals {
  const P: any = project;
  const texts: string[] = [
    ...Object.values(P?.strengths ?? {}),
    ...(P?.cases ?? []).flatMap((c: any) => [c?.title, c?.challenge, c?.solution]),
    ...(P?.capability?.materials ?? []),
    P?.inquiry?.wantMoreOf, P?.inquiry?.wantLessOf,
    P?.basics?.summary, P?.basics?.history, P?.basics?.founded, P?.executive?.vision,
  ].filter((x): x is string => typeof x === "string");
  const joined = texts.join("　");

  const out: CompanySignals = { form: [], problem: [], act: [], time: [], scale: scaleOf(project), from: [] };
  for (const c of CUES) {
    const hit = c.re.exec(joined);
    if (!hit) continue;
    if (out[c.kind].includes(c.word)) continue;
    out[c.kind].push(c.word);
    out.from.push(hit[0]);
  }
  return out;
}

/** 用途ごとの置き場所と、構図の方針。**全帯には入れない**（4つだけ） */
const PURPOSE: Record<GeneratedPurpose, {
  page: string; slot: string; role: GeneratedVisual["placement"]["role"];
  aspect: string; cropSafe: string; textSafe: GeneratedVisual["mobile"]["textSafeArea"];
  focal: { x: number; y: number }; composition: string; why: string;
  /**
   * **その絵が担う視覚的役割**（第9段階②）。
   * 同じ会社でも、ページの目的が違えば**主役にする手がかりが変わる。**
   * ここを分けないと、1社に似た絵が4枚並ぶ。
   */
  lead: "form" | "act" | "time" | "problem";
  /** どこから見ているか。生成サービスに効く語 */
  viewpoint: string;
}> = {
  firstView: {
    page: "index", slot: "hero", role: "background",
    aspect: "21:9", cropSafe: "4:5", textSafe: "left", focal: { x: 0.72, y: 0.45 },
    /** **打ち消しに書いた言葉は、注文書の側にも書けない**（`assertGenerated` が弾く）。
     *  「見出しが乗るので空ける」は「空ける」とだけ書く */
    composition: "wide asymmetric composition, interest on the right third, "
      + "large calm empty area across the left third",
    lead: "form", viewpoint: "shallow oblique view, long lens, almost flat perspective",
    why: "最初の画面。**扱っているものの形**を、いちばん静かに出す。見出しと札が上に乗るので左は空ける",
  },
  strength: {
    page: "index", slot: "technique", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "bottom", focal: { x: 0.5, y: 0.35 },
    composition: "directional composition reading left to right, change of state across the frame, "
      + "quiet empty lower half",
    lead: "act", viewpoint: "close raking view along the surface, shallow depth",
    why: "技術の帯。**その会社が何をしているか（工程・行為）**を主役にする。下半分は文章に空ける",
  },
  company: {
    page: "company", slot: "history", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "none", focal: { x: 0.5, y: 0.5 },
    composition: "very quiet full-frame texture, layered and settled, no focal object, even distribution",
    lead: "time", viewpoint: "straight-on view, flat and frontal",
    why: "会社の帯。**積み重なった時間**を出す。焦点を作らず、地に沈める",
  },
  peak: {
    page: "index", slot: "declined", role: "background",
    aspect: "16:9", cropSafe: "4:5", textSafe: "top", focal: { x: 0.5, y: 0.6 },
    composition: "single tense form off-centre, generous margin, upper area kept empty",
    lead: "problem", viewpoint: "low oblique view, slight tension in the horizon",
    why: "中盤の山。**その会社が解決している課題**を主役にする。実写があるときは作らない",
  },
};

const SUBJECT_FOR = (lang: ReturnType<typeof getVisualLanguage>, i: number): AssetSubject =>
  lang.subjects[i % Math.max(lang.subjects.length, 1)] ?? "geometry";

/**
 * プロンプトを組む（第9段階②で作り直した）。
 *
 * **汎用の一文にしない**（ご指示）。入れるのは次の13で、
 * **そのうち3つ（役割の手がかり・尺度・材質）は、その会社の言葉から来ている。**
 *
 *   visual purpose ／ subject ／ **会社固有の手がかり** ／ material ／ composition ／
 *   focal point ／ negative space ／ text-safe area ／ lighting ／ visual density ／
 *   viewpoint ／ aspect ratio ／ mobile crop
 *
 * 【1枚目を作って分かったこと】
 * 勝ち筋そのままの言葉（`material transformation`）は**抽象すぎて絵にならず、
 * アルミを扱うどの会社でも成立する絵**が返ってきた。
 * **絵にするのは、その会社が実際に話したことのほう**である。
 */
function promptOf(
  plan: VisualLanguagePlan, subject: AssetSubject,
  spec: typeof PURPOSE[GeneratedPurpose], sig: CompanySignals,
): string {
  const SUBJECT_WORDS: Record<string, string> = {
    geometry: "abstract geometric forms",
    light: "gradients of light across a plane",
    texture: "close abstract surface texture",
    grid: "fine orthogonal grid structure",
    dimension: "thin reference lines and datum marks",
  };
  /** **その用途が主役にする手がかり。** ページの目的が違えば、主役が変わる */
  const lead = spec.lead === "form" ? sig.form
    : spec.lead === "act" ? sig.act
    : spec.lead === "problem" ? sig.problem
    : sig.time;
  /** 主役が空なら、次に厚いところから1つだけ借りる。**無ければ足さない** */
  const borrowed = lead.length ? lead.slice(0, 2)
    : [...sig.act, ...sig.form, ...sig.problem].slice(0, 1);
  /** 会社の話は主役にするが、**背景の手がかりも1つだけ添える**（絵に厚みを出す） */
  const second = [...sig.form, ...sig.act, ...sig.problem].filter((w) => !borrowed.includes(w)).slice(0, 1);

  const focal = `focal point at ${Math.round(spec.focal.x * 100)}% from the left, `
    + `${Math.round(spec.focal.y * 100)}% from the top`;
  /**
   * **「文字が乗る」と書けない。** `text` は打ち消しに入れている語なので、
   * 注文書の側に書くと `assertGenerated` が弾く（実際に2度弾かれた）。
   * 言い方を変えるのではなく、**伝えたいこと（低コントラストで空けておく）**をそのまま書く。
   */
  const safe = spec.textSafe === "none"
    ? "no single area needs to stay clear, keep the whole frame quiet"
    : `keep the ${spec.textSafe} area of the frame clear and low in contrast, page copy is overlaid there`;

  return [
    "abstract non-representational image, used as a quiet background layer on a company website",
    SUBJECT_WORDS[subject] ?? SUBJECT_WORDS.geometry,
    ...borrowed,
    ...second,
    plan.material,
    sig.scale,
    spec.composition,
    focal,
    safe,
    "generous negative space",
    spec.viewpoint,
    plan.lighting,
    plan.mood,
    plan.density,
    `aspect ratio ${spec.aspect}`,
    `must still read when cropped to ${spec.cropSafe} on a phone`,
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
  const sig = companySignals(project);

  /** どの用途を作るか。**材料を見て決める。埋めるために作らない** */
  const wanted: GeneratedPurpose[] = ["firstView"];
  if (a.strands?.some((s: any) => s.id === "technique")) wanted.push("strength");
  if ((project as any)?.basics?.founded || (project as any)?.basics?.history) wanted.push("company");
  /** **実写があるなら山は実写に譲る**（生成は実写の代用品ではない） */
  if (!a.hasRealPhotos && wanted.length < MAX_GENERATED) wanted.push("peak");

  const visuals: GeneratedVisual[] = wanted.slice(0, MAX_GENERATED).map((purpose, i) => {
    const spec = PURPOSE[purpose];
    const subject = SUBJECT_FOR(lang, i);
    void i;
    return {
      visualId: `${hash}-${purpose}`,
      purpose, source: "generated", intent: "atmosphere", subject,
      direction: d.id, language: language.id,
      mood: language.mood, composition: spec.composition,
      material: language.material, lighting: language.lighting,
      aspectRatio: spec.aspect,
      placement: { page: spec.page, slot: spec.slot, role: spec.role },
      mobile: { focalPoint: spec.focal, cropSafe: spec.cropSafe, textSafeArea: spec.textSafe },
      prompt: promptOf(language, subject, spec, sig),
      negativePrompt: NEGATIVE_PROMPT,
      provenance: {},
      status: "brief",
      why: sig.from.length ? `${spec.why}（拾った言葉：${sig.from.slice(0, 4).join("・")}）` : spec.why,
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
