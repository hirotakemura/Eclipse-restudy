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

  /**
   * 光は、その型が暗い面を使うかどうかで決める。**配色の言い方はしない**（色はCSSが持つ）。
   *
   * 【明暗の幅を、どちらの型でも必ず頼む】（D-464）
   * 実測：届いた4枚とも**128より暗い画素が 0.0〜0.8%**、5%点〜95%点の幅が **41/255** しかなく、
   * 背景に敷いても**絵の有無による最大画素差が 32〜36/255**にとどまった。
   * 覆いの濃さをいくら上げても、**絵の中に無い明暗は作れない。**
   *
   * 原因はここで、明るい型に **`even diffused light, pale background, no harsh shadow`**
   * ——「均質な光・淡い地・強い影なし」——と指示していた。**絵は言われたとおりに出来ていた。**
   * 15の型のうち**10がこちら側**なので、1案件の話ではない。
   *
   * この言葉が入っていた理由は、**絵を `.22` で文字の下に敷いていた頃、
   * 淡いことが文字を守る手段だったから**である。D-459/D-463 で
   * 「**地の色を55%必ず残す**」という別の守り方に変えたので、役目は終わっている。
   * 真っ黒な絵が来ても合成後の明るさは 140/255 で、墨の本文に対して **5.0:1**（AA）。
   *
   * **文字の逃げ場は `FRAME` の `textSafe` が持つ**ので、ここでは光だけを言う。
   * 明るい型でも「影の側がはっきり暗い」ことを頼み、**淡いことは頼まない。**
   */
  const dark = d.surfaces.includes("dark") || d.surfaces.includes("accent");
  /** どちらの型にも共通で付ける。**幅が無い絵は、背景にすると消える** */
  const RANGE = "full tonal range from deep shadow to bright highlight, "
    + "at least one clearly dark region occupying a meaningful part of the frame";
  const lighting = dark
    ? `single directional light, deep shadows, dark background, ${RANGE}`
    : `soft directional light from one side, the shaded side of each form reading clearly `
      + `darker than its lit side, mid-tone background rather than a pale one, ${RANGE}`;

  return {
    id: lang.id, label: lang.label, axis: lang.axis,
    material: mat.word,
    mood: `${MOOD_WORDS[theme.mood.id] ?? MOOD_WORDS.futsu}, ${TONE_WORDS[d.tone] ?? TONE_WORDS.spec}`,
    density, lighting,
    why: lang.id === "none"
      ? `勝ち筋（${a.primaryStrength}）から絵の方針が引けないので、生成ビジュアルは作らない`
      : `勝ち筋 ${a.primaryStrength} → ${lang.label}。材質「${mat.from}」・型「${d.label}」・`
        + `${theme.mood.label}の余白から、${dark ? "締まった光" : "片側からの光"}で組む`
        + "（どちらの型でも**明暗の幅**は必ず頼む・D-464）",
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

/**
 * 手がかり → **画面に見える出来事**（第9段階③で書き直した）。
 *
 * 【なぜ書き直したか】
 * 3枚を実際に生成して分かったのは、**会社の言葉はプロンプトに入っていたのに、
 * 絵がそれを構造として描けていなかった**こと。3枚とも「淡いアルミの膜が曲がっている」に収束した。
 * 原因は、ここに書いていたのが「意味の説明」（*value that is not visible* のような）で、
 * **画像生成に渡しても、画面上の何をどう置くかが決まらない**言い方だったからである。
 *
 * だから、変換の鎖をこう決める——
 *   会社の事実 → 会社の合図 → **視覚的な出来事** → 画面に見える構造
 * 書くのは、**要素の数・形・位置・接触・距離・重なり・状態の変化・安定／不安定**だけ。
 * 「精密だ」「誠実だ」のような形容は書かない（絵にならないため）。
 */
const CUES: { re: RegExp; kind: "form" | "problem" | "act" | "time"; word: string }[] = [
  // ── 形：何を扱っているか ──
  { re: /薄肉|薄物|薄板/, kind: "form", word: "one continuous sheet thinner than card, its far edge so thin that light passes through it and that edge reads brighter than the body" },
  { re: /複雑形状|複雑な形状|異形/, kind: "form", word: "a surface that changes direction twice before it leaves the frame, each turn a different radius" },
  { re: /小ロット|1個から|試作/, kind: "form", word: "one form only, unrepeated, with no identical neighbour anywhere in the frame" },
  { re: /量産|5,000個|数千個/, kind: "form", word: "identical forms standing in one even rank, the gaps between them equal, none of them singled out" },
  { re: /古い設備|部品供給|廃番|型式/, kind: "form", word: "one older surface still in service, its finish unevenly worn while its edges stay true" },
  { re: /浴室|給湯|水まわり|配管/, kind: "form", word: "smooth pale surfaces meeting at soft radii, with water-like reflections lying flat across them" },
  { re: /半導体|装置部品/, kind: "form", word: "flat planes stepped in fine parallel terraces, every step the same height as the last" },
  // ── 課題：何を解決しているか ──
  { re: /歪(み|む)|反(り|る)/, kind: "problem", word: "a plane resting level at three of its four corners while the fourth lifts clear by a small but unmistakable amount" },
  { re: /ビビ|振動|割れ/, kind: "problem", word: "one fine crease running diagonally inward and stopping halfway, the surface still unbroken" },
  { re: /断られ|無理と言われ|敬遠/, kind: "problem", word: "one form carried past the line where every other form in the frame stops, alone beyond that line" },
  { re: /交換|買い替え|全面改装/, kind: "problem", word: "a single element renewed inside an otherwise continuous field, its edges meeting the old field exactly" },
  { re: /価格|相見積/, kind: "problem", word: "two forms of identical outline, one of them visibly denser in substance than the other" },
  // ── 行為：何をしているか ──
  /**
   * **治具を描かせない。** 支持そのもの（薄い形を複数の点で安定させている関係）だけを描かせる。
   * 実在の治具・機械部品として読まれないよう、打ち消しは `COMMON_WORLD` と `NEGATIVE_PROMPT` の側に置く。
   */
  { re: /治具|支持点|押さえ|固定/, kind: "act", word: "three abstract structural support nodes, rounded and minimal, rising from below to meet the form from underneath, so that the support relationship is visible: where a node touches, the form is perfectly flat, and between nodes it still lifts" },
  { re: /削る順番|加工順序|工程間|段取り/, kind: "act", word: "the same form shown at successive stages, each stage thinner and more resolved than the one before it" },
  { re: /休ませ|寝かせ|時間を置/, kind: "act", word: "two states of one form side by side, the second settled flat where the first was still under tension" },
  { re: /図面|設計|意図/, kind: "act", word: "faint construction lines lying beneath the form, describing its shape before the form itself arrives" },
  { re: /測定|検査|三次元/, kind: "act", word: "three reference planes meeting at a single corner, every other element positioned from that corner" },
  { re: /在庫|すぐ|1時間|即日/, kind: "act", word: "every element already in place from the start, with no empty slot left waiting to be filled" },
  { re: /修理|直す|探して/, kind: "act", word: "a continuous surface whose break has closed, the join readable only as a change of sheen" },
  /**
   * ── ものを作らない会社の手がかり ──────────────
   * **業種で決めているのではない。** 上と同じで、**その会社が話した言葉**を拾っている。
   * 汎用の会社（士業・美容・工務店）で手がかりが0〜1件しか拾えず、
   * **プロンプトが9割一致した**ので足した（検査が先に見つけた）。
   */
  { re: /規則|条文|協定|法改正|制度/, kind: "form", word: "translucent sheets stacked and aligned, each one offset from the sheet below it by the same small amount" },
  { re: /履歴|記録|カルテ|経過/, kind: "form", word: "every earlier position of the form still faintly present behind the position it holds now" },
  { re: /築[0-9]+年|old|古い家|住まい|住宅/, kind: "form", word: "one surface weathered evenly across its whole area, with no sharp new patch anywhere on it" },
  { re: /髪|施術|薬剤|矯正/, kind: "form", word: "fine filaments falling in one direction, evenly spaced, not one of them crossing another" },
  { re: /建て替え|葺き替え|全面|やり直し/, kind: "problem", word: "one whole form kept whole, with a single small area inside it renewed and the rest untouched" },
  { re: /断られ|対応できない|前例が無い/, kind: "problem", word: "one form held steady well beyond the point where the forms around it have already come to rest" },
  { re: /不安|分からな|判断が/, kind: "problem", word: "an edge that is soft and unreadable at the margin and resolves into one sharp line toward the centre" },
  { re: /要らない|不要|勧めてこな|押し売り/, kind: "act", word: "one area of the field visibly changed while everything around it is left exactly as it was" },
  { re: /現地|現場|見に来|訪問/, kind: "act", word: "the surface held close enough to fill the frame before any other element is allowed in" },
  { re: /切り分け|原因|見立て/, kind: "act", word: "one strand lifted clear of a bundle and laid apart from the rest, still parallel to them" },
  // ── 続いてきた時間（会社の帯だけが使う） ──
  { re: /創業|創立|明治|大正|昭和|19[0-9]{2}年/, kind: "time", word: "many thin layers settled one on another, the oldest of them compressed thinnest at the bottom" },
  { re: /代替わり|二代目|三代目|承継|先代/, kind: "time", word: "two surfaces of different age meeting edge to edge with no seam between them" },
  { re: /続け|変わらず|守っ|以来/, kind: "time", word: "one unchanged surface whose only variation is the polish left by long use" },
  { re: /家族|社員[0-9]+名|少人数/, kind: "time", word: "a small number of distinct elements, each a different size, not one of them repeated" },
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
    /** **書いてある欄の名前で読む。** `basics.summary` は存在しない欄で、ずっと空を読んでいた（D-197） */
    P?.basics?.businessSummary, P?.basics?.founded,
    ...(P?.basics?.history ?? []).map((h: any) => h?.event),
    P?.executive?.vision, P?.executive?.messageToStaff,
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
export const PURPOSE: Record<GeneratedPurpose, {
  page: string; slot: string; role: GeneratedVisual["placement"]["role"];
  aspect: string; cropSafe: string; textSafe: GeneratedVisual["mobile"]["textSafeArea"];
  focal: { x: number; y: number }; composition: string; why: string;
  /**
   * **そのページだけの視覚的な出来事**（第9段階③）。
   * 会社の手がかりが「何が写っているか」を決め、こちらが「**それを何個、どう並べるか**」を決める。
   * ここを分けたので、同じ会社でも hero と strength と peak で**画面の構造そのものが変わる。**
   */
  arrangement: string;
  /** 奥行き。**視点だけでなく、光がその構造をどう読ませるか**まで書く */
  depth: string;
  /**
   * 主役の手がかりを何本立てるか／背景の手がかりを何本添えるか。
   *
   * **会社の帯だけ 1 + 2 にしてある。** 続いてきた時間の手がかり（創業・代替わり・家族）は
   * **どの会社でも似た言葉が拾える**ので、ここを2本にすると
   * 「1972年創業・三代目・家族経営」の会社どうしで**同じ絵の注文になる**（検査が実測92%で見つけた）。
   * 時間は1本にして、残りはその会社が実際にやっていること（形・行為）から埋める。
   */
  leadCount: number; secondCount: number;
  /**
   * 背景の手がかりをどの種類から借りるか。**順に見て、足りるまで取る。**
   *
   * ここを固定順（形→行為→課題）にしていたら、どの会社も**背景がその会社の最初の「形」**になり、
   * 似た業種の2社で**strengthの出来事が76%一致した**（検査が見つけた）。
   * 技術の帯なら「やっていること（行為）＋解いている課題」、
   * 会社の帯なら「時間＋扱っているもの」——**帯の話に合う種類から借りる。**
   */
  secondFrom: ("form" | "act" | "problem" | "time")[];
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
    arrangement: "one continuous element alone in the frame, nothing supporting it and nothing else beside it, "
      + "so that it rests on nothing and sags very slightly under its own weight, "
      + "shown at its full extent",
    lead: "form", leadCount: 2, secondCount: 0, secondFrom: [],
    viewpoint: "shallow oblique view, long lens, almost flat perspective",
    depth: "the near edge sharp and the far edge falling very slightly soft, "
      + "thickness rather than shadow separating near from far",
    why: "最初の画面。**扱っているものの形**を、いちばん静かに出す。見出しと札が上に乗るので左は空ける",
  },
  strength: {
    /**
     * **絵にも本体のページがある**（D-454）。
     *
     * ここは `index/technique` だった。だが D-410 で `technique` の本体は強み・技術のページになり、
     * **トップの帯は「要点＋本体へのリンク」の参照**になっている。
     * `visual.ts` は既に「**本体でない帯を山にしない**」と決めている（D-412）のに、
     * **そこへ、その会社でいちばん強い絵を置いていた。** 実測：生成4枚のうち3枚がトップに集中し、
     * **強み・技術のページは画像0枚**だった。絵は、内容の本体があるページへ置く
     */
    page: "strengths", slot: "technique", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "bottom", focal: { x: 0.5, y: 0.35 },
    composition: "directional composition reading left to right, change of state across the frame, "
      + "quiet empty lower half",
    arrangement: "the same element repeated five times in a row from left to right, "
      + "read as five ordered stages of one process, "
      + "the difference from each stage to the next small and always in the same direction",
    lead: "act", leadCount: 2, secondCount: 1, secondFrom: ["problem", "form"],
    viewpoint: "close raking view along the surface, shallow depth",
    depth: "light skimming almost parallel to the surface, so that every lift away from a contact point "
      + "reads as a soft elongated shadow and every flat area reads as one unbroken tone",
    why: "技術の帯。**その会社が何をしているか（工程・行為）**を主役にする。下半分は文章に空ける",
  },
  company: {
    page: "company", slot: "history", role: "background",
    aspect: "16:9", cropSafe: "1:1", textSafe: "none", focal: { x: 0.5, y: 0.5 },
    composition: "very quiet full-frame texture, layered and settled, no focal object, even distribution",
    arrangement: "no single dominant element, the whole frame evenly filled by one accumulation, "
      + "every part of it the same distance away and none of it nearer the edge than another, "
      + "the whole of it already settled rather than still changing",
    lead: "time", leadCount: 1, secondCount: 2, secondFrom: ["form", "act"],
    viewpoint: "straight-on view, flat and frontal",
    /**
     * ★D-464 で光の指定に「明暗の幅」を足したとき、**ここと真っ向から矛盾した。**
     * 元は `light without direction, the layers separating only as faint steps of value`
     * ——「方向の無い光・値の差はかすか」——で、実測でも**4枚中いちばん平べったかった**
     * （明暗の幅 23／暗い画素 0.0%）。
     * **「焦点を作らない」は構図の話で、「明暗を付けない」ことではない。**
     * 焦点を作らないまま、層ごとの値の差ははっきりさせる。
     */
    depth: "deep focus throughout, light raking low across the layers, "
      + "each layer separating as a clear step of value, the deepest layers falling into shadow",
    why: "会社の帯。**積み重なった時間**を出す。焦点は作らないが、層ごとの明暗ははっきり付ける",
  },
  peak: {
    /** 同じ理由で、実績の絵も本体（強み・技術）へ（D-454） */
    page: "strengths", slot: "declined", role: "background",
    aspect: "16:9", cropSafe: "4:5", textSafe: "top", focal: { x: 0.5, y: 0.6 },
    composition: "single tense form off-centre, generous margin, upper area kept empty",
    arrangement: "one element alone in a wide calm field, most of its area completely at rest "
      + "and one local area, off centre, that is not, "
      + "the imbalance staying local and never spreading across the whole form",
    lead: "problem", leadCount: 2, secondCount: 1, secondFrom: ["form", "act"],
    viewpoint: "low oblique view, slight tension in the horizon",
    depth: "the resting area in even focus, the one area that is not at rest catching "
      + "a fractionally brighter reflection than everything around it",
    why: "中盤の山。**その会社が解決している課題**を主役にする。実写があるときは作らない",
  },
};

const SUBJECT_FOR = (lang: ReturnType<typeof getVisualLanguage>, i: number): AssetSubject =>
  lang.subjects[i % Math.max(lang.subjects.length, 1)] ?? "geometry";

/** プロンプトの4節。**この順で読ませる**（何が写るか → 枠 → 奥行き → 世界） */
export const PROMPT_SECTIONS = ["SUBJECT", "FRAME", "DEPTH", "WORLD"] as const;
export type PromptSection = (typeof PROMPT_SECTIONS)[number];

/**
 * **会社にもページにも依らない部分。**
 *
 * 3枚を見たうえでのご判断で、`pale aluminium` などの共通世界観は今回変えない。
 * 変えるのは SUBJECT の作り方だけである。ここに置くのは**どの会社でも同じ打ち消し**——
 * 支持を描かせるときに、**実在の治具・機械部品として読まれないための歯止め**を含む。
 */
export const COMMON_WORLD = "abstract non-representational image, used as a quiet background layer "
  + "on a company website, purely abstract, not a fixture, "
  + "not a recognisable manufactured component, no readable mark of any kind";

/** 4節に切り分ける。**検査が「どこが会社固有で、どこが共通か」を別々に測れるように**（ご指示） */
export function promptSections(prompt: string): Record<PromptSection, string> {
  const out = { SUBJECT: "", FRAME: "", DEPTH: "", WORLD: "" };
  for (const line of prompt.split("\n")) {
    const m = /^(SUBJECT|FRAME|DEPTH|WORLD)\.\s*(.*)$/.exec(line);
    if (m) out[m[1] as PromptSection] = m[2] ?? "";
  }
  return out;
}

/**
 * プロンプトを組む（第9段階③で4節に作り直した）。
 *
 * 【なぜ作り直したか】
 * 3枚を実際に生成してみると、**会社固有の言葉は入っているのに、絵が同じ顔**になった。
 * 「薄い淡色のアルミ面が曲がっている」に3枚とも収束していた。
 * 足りなかったのは会社の言葉ではなく、**その意味を画面の構造へ翻訳する段**である。
 *
 * そこで、平らなカンマ列をやめて4節にした。
 *
 *   SUBJECT  **何が、何個、どう置かれ、どこで接し、どう変わるか。**
 *            ここだけが会社固有＋ページ固有で、ここが絵の違いを作る。
 *   FRAME    構図・焦点・空ける側・比・スマホの切り取り。
 *   DEPTH    視点と、**光がその構造をどう読ませるか。**
 *   WORLD    材質・光・気分・密度と、共通の打ち消し。**ここは今回変えない。**
 *
 * 変換の鎖は 会社の事実 → 会社の合図 → 視覚的な出来事 → 画面に見える構造。
 * **会社固有の単語を大量に入れるのではない。**
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
  const borrowed = lead.length ? lead.slice(0, spec.leadCount)
    : [...sig.act, ...sig.form, ...sig.problem].slice(0, 1);
  /**
   * 背景の手がかりを添える。**hero では添えない**——
   * hero の並べ方は「何も支えていない、ただ1つ」なので、
   * ここで支持や工程の手がかりが混ざると**画面の中で矛盾する。**
   */
  const second = spec.secondFrom.flatMap((k) => sig[k])
    .filter((w) => !borrowed.includes(w)).slice(0, spec.secondCount);

  /**
   * **「文字が乗る」と書けない。** `text` は打ち消しに入れている語なので、
   * 注文書の側に書くと `assertGenerated` が弾く（実際に2度弾かれた）。
   * 言い方を変えるのではなく、**伝えたいこと（低コントラストで空けておく）**をそのまま書く。
   */
  const safe = spec.textSafe === "none"
    ? "no single area needs to stay clear, keep the whole frame quiet"
    : `keep the ${spec.textSafe} area of the frame clear and low in contrast, page copy is overlaid there`;

  /** ① 何が、何個、どう置かれ、どう変わるか。**ここだけが絵の違いを作る** */
  const SUBJECT = [
    SUBJECT_WORDS[subject] ?? SUBJECT_WORDS.geometry,
    spec.arrangement,
    ...borrowed,
    ...second,
  ].join(". ");

  /** ② 枠。**画面に置くための指定**（生成の出来ではなく、サイトでの使い勝手を決める） */
  const FRAME = [
    spec.composition,
    `focal point at ${Math.round(spec.focal.x * 100)}% from the left, `
      + `${Math.round(spec.focal.y * 100)}% from the top`,
    safe,
    "generous negative space, nothing touching the outer edge",
    `aspect ratio ${spec.aspect}`,
    `must still read when cropped to ${spec.cropSafe} on a phone`,
  ].join(", ");

  /** ③ 奥行き。**どこから見て、光がその構造をどう読ませるか。** 距離は公差の桁から来る */
  const DEPTH = [spec.viewpoint, spec.depth, sig.scale].join(", ");

  /** ④ 世界。**会社の材質と型の光。共通の打ち消しは最後に置く**（今回は変更しない） */
  const WORLD = [plan.material, plan.lighting, plan.mood, plan.density, COMMON_WORLD].join(", ");

  return [`SUBJECT. ${SUBJECT}.`, `FRAME. ${FRAME}.`, `DEPTH. ${DEPTH}.`, `WORLD. ${WORLD}.`].join("\n");
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
