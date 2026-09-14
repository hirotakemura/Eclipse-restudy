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
import type { Analysis, ShowBy, Strand } from "./analysis.ts";
import { getDirection, type Tone } from "./direction.ts";
import type { SurfaceId, LayoutId, MotifId, MediaId, ContentId, PresentationId } from "./system/index.ts";
import { MOTIFS } from "./system/index.ts";
import { canPresent, hasMaterial } from "./system/index.ts";
import { choosePresentation, PLAYBOOK, LABEL } from "./playbook.ts";
import { materialsOf } from "./materials.ts";
import type { BriefSource, BriefTrace, DesignBrief, Emphasis, StoredBrief } from "./brief.ts";

/** セクションの幅。**全部同じ幅にしない**のが今回の主眼 */
export type Width =
  | "narrow" // 散文。1行が長くなりすぎないように
  | "normal" // 既定
  | "wide" // 表・カード・設備
  | "full"; // 写真・大きな数字。画面いっぱい

/**
 * 強さ。**重要情報と補助情報を同じ大きさで出さない**
 * 語彙は `brief.ts` が単一の正（3段で固定・ご指示）。
 */
export type { Emphasis };

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
    | "points" // 強みを複数の塊に分ける
    | "specTable" // 対応可能範囲の表
    | "equipmentTable" // 設備の一覧表
    | "prose"; // 生成した散文
  width: Width;
  emphasis: Emphasis;
  /** 帯の地。**直す前は全部の帯が白だった**（docs/22） */
  surface: SurfaceId;
  /** 中身の並べ方。**直す前は1カラムしか無かった** */
  layout: LayoutId;
  /** 写真の扱い。預かっていなければ none */
  media: MediaId;
  /** 地紋。根拠が無ければ none */
  motif: MotifId;
  /**
   * 何を伝えるか。**`kind` とは別に持つ**（D-206）。
   * `kind` は内容と表現を1語で表していたので、型を変えても同じ内容が同じ形で出ていた。
   */
  content: ContentId;
  /** どう見せるか */
  presentation: PresentationId;
  heading?: string;
  /** `prose` のとき、どの原稿を流すか */
  slug?: string;
  /**
   * **形の決まっている帯**。材料がある限り、この形から動かさない。
   *
   * 「仕様」「保有設備一覧」は、**全項目を突き合わせて読むための表**であって、
   * 会社の強みで形を変える場所ではない。ここを強みで動かしたために、
   * 「仕様」という見出しの下に大きな数字が並ぶ、という画面になった（実測・3社中2社）。
   * 変えてよいのは、その上にある「対応できる条件」「主な設備」のほうである。
   */
  form?: PresentationId;
  /** なぜこの順・この形なのか。**社長に説明できるようにする**（画面には出さない） */
  why?: string;
  /**
   * この帯の見せ方を、**最終的に誰が決めたか**（ご指示）。
   *
   * `rules`       規則版がそのまま決めた
   * `ai`          Brief（AI版）の判断が、可否表と材料をもう一度通って採用された
   * `ai-fallback` Brief の判断が描く直前の確認で落ち、規則版に戻した
   *
   * **画面にも `data-decided-by` として出す。**
   * 出さないと「AIが判断を変えた」と「HTMLが変わった」の区別がつかない。
   */
  decidedBy?: BriefSource;
  /** 規則版なら何を選んでいたか。比較のために残す */
  ruleChoice?: { presentation: PresentationId; emphasis: Emphasis };
}

/**
 * 型（方向性）で、見せ方の順番を入れ替える。
 *
 * **前に出す／後ろに回す、であって、消す／作るではない。**
 * 材料が無いものは `analyze()` の時点で落ちている。
 * 材料があるのに型の都合で消すのは、聞き取った意味がなくなる。
 */
function applyDirection(strands: Strand[], directionId: string | undefined): Strand[] {
  const d = getDirection(directionId);
  return strands
    .map((s) => {
      if (d.favor.includes(s.id)) return { ...s, score: s.score + 3, why: `${s.why}／型「${d.label}」で前に出す` };
      if (d.defer.includes(s.id)) return { ...s, score: Math.max(1, s.score - 3), why: `${s.why}／型「${d.label}」では後ろに回す` };
      return s;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 主役の違いを、幅と強さに出す。
 *
 * **同じセクションでも、型が違えば出方が変わる。**
 * 「老舗・職人」で条件の数字を画面いっぱいに出しても、その会社の売りにはならない。
 */
function applyTone(section: Base, tone: Tone): Base {
  if (tone === "story") {
    if (section.kind === "figures") return { ...section, width: "normal", emphasis: "normal" };
    if (section.kind === "timeline" || section.kind === "people") return { ...section, emphasis: "lead" };
  }
  if (tone === "visual") {
    if (section.kind === "gallery") return { ...section, emphasis: "lead" };
    if (section.kind === "figures") return { ...section, width: "wide", emphasis: "normal" };
  }
  return section;
}

/** 見せ方ごとの、既定の出し方 */
type Base = Omit<Section, "why" | "surface" | "layout" | "media" | "motif" | "content" | "presentation">;

const BY_STRAND: Record<ShowBy, Base | null> = {
  declined: { kind: "declined", width: "narrow", emphasis: "lead", heading: "他社様で難しいと言われた案件" },
  technique: { kind: "technique", width: "narrow", emphasis: "normal", heading: "どうやって受けているか" },
  /**
   * 条件の帯。**見出しを付ける**（D-242）。
   * 大きな数字で出すときは項目名が値の上に出るので見出しが無くても読めたが、
   * 強みによって**仕様表に変わると、見出しのない表が1つ浮く**ようになった。
   */
  numbers: { kind: "figures", width: "full", emphasis: "lead", heading: "対応できる条件" },
  materials: { kind: "materials", width: "wide", emphasis: "normal", heading: "対応できる材質" },
  equipment: { kind: "equipment", width: "wide", emphasis: "normal", heading: "主な設備" },
  photos: { kind: "gallery", width: "full", emphasis: "normal", heading: "工場・設備" },
  people: { kind: "people", width: "narrow", emphasis: "quiet", heading: "代表より" },
  history: { kind: "timeline", width: "narrow", emphasis: "quiet", heading: "沿革" },
};


/**
 * 帯の地・組み方・写真・地紋を決める。
 *
 * **型が「好み」を出し、会社の材料が「できること」を出す。** その重なりを取る。
 * 材料が無ければ既定に落ちる。**無いものを飾りで埋めない。**
 *
 * 面は同じものを続けない。**隣り合う帯が同じ地だと、境目が見えない。**
 */
/** 白抜きの面。**地の色が違うだけで、上に乗るものの扱いは同じ**（D-230） */
const INVERTED: SurfaceId[] = ["accent", "dark"];

function decorate(
  base: Base,
  d: ReturnType<typeof getDirection>,
  a: Analysis,
  index: number,
  prevSurface: SurfaceId | null,
  /** すでに白抜きの帯を出したか。**1ページに1回まで** */
  invertedDone: boolean,
): Omit<Section, "why"> {
  /**
   * 面：型の候補から順に選び、直前と同じにならないものを取る。
   *
   * ただし**白抜きの帯（暗い地・アクセント地）だけは、順番で回さない。**
   * 回すと「たまたま当たった帯」が締まることになり、
   * **量産・設備では2本出て、製品・開発では1本も出ない**という実測になった。
   * 白抜きは**その会社を一言で言う帯（lead）に、1ページ1回だけ**当てる。
   */
  const plainPool = d.surfaces.filter((x) => !INVERTED.includes(x));
  const candidates = plainPool.filter((x) => x !== prevSurface);
  const pool = candidates.length ? candidates : (plainPool.length ? plainPool : ["plain" as SurfaceId]);
  let surface: SurfaceId = pool[index % pool.length] ?? "plain";
  const invert = d.surfaces.find((x) => INVERTED.includes(x));
  if (invert && !invertedDone && base.emphasis === "lead") surface = invert;
  // 散文の帯は、読ませる場所なので白か薄地に留める
  if (base.kind === "prose" || base.kind === "technique") {
    surface = surface === "accent" ? "plain" : surface;
  }
  // 数字の帯は締めたい。型が許していれば罫の面を優先する
  if (base.kind === "figures" && d.surfaces.includes("rule")) surface = "rule";
  // 写真の帯に地紋を敷かない
  if (base.kind === "gallery") surface = "plain";
  /**
   * **アクセント地は白抜きになるので、札を並べる帯には使わない。**
   * 実際に、事例カード（白い箱）を青地に置いたときに**見出しが白×白で消えた**（D-203）。
   * 短く強い内容（引用・数字）だけに使う。
   */
  const CARDS: Section["kind"][] = ["cases", "points", "equipment", "equipmentTable", "specTable", "gallery"];
  /**
   * **白抜きの帯は、1ページに1回まで**（D-230）。
   *
   * 二度使うと締める力が消えて、ただの「暗いサイト」になる。
   * 面の選び方は「型の候補を順に回す」だけなので、放っておくと
   * **量産・設備の型で暗い帯が2本出た**（実測）。自分で書いた上限を、機械で守らせる。
   *
   * 札を並べる帯には使わない、も同じ歯止め。事例カード（白い箱）を
   * 白抜きの地に置くと**見出しが白×白で消える**（D-203）。
   */
  if (INVERTED.includes(surface) && (CARDS.includes(base.kind) || invertedDone)) {
    surface = d.surfaces.find((x) => !INVERTED.includes(x) && x !== prevSurface)
      ?? d.surfaces.find((x) => !INVERTED.includes(x))
      ?? "plain";
  }

  // 組み方：狭い帯は積むしかない。広い帯でだけ型の好みを効かせる
  let layout: LayoutId = "stack";
  if (base.width !== "narrow") {
    layout = d.layouts.find((l) => l !== "fullbleed" || a.hasRealPhotos) ?? "stack";
  } else if (d.layouts.includes("editorial") && base.emphasis === "lead") {
    layout = "editorial";
  }

  // 写真：預かっていなければ none。**無理に写真中心にしない**
  const media: MediaId = !a.hasRealPhotos ? "none" : base.kind === "gallery" ? "full" : "none";

  // 地紋：根拠のあるものだけ。強い帯にだけ敷く
  const motif: MotifId = base.emphasis === "lead" ? pickMotif(d.motifs, a) : "none";

  const pair = KIND_AS[base.kind];
  return { ...base, surface, layout, media, motif, ...pair };
}

/**
 * 表現を、最大の強みに応じて差し替える。
 *
 * **可否表と材料の条件を必ず通す**（D-206）。
 * 例：精度が強みでも、具体的な精度の値が無ければ「大きな数字」を強制しない。
 */
function repress(
  sec: Omit<Section, "why">, project: Project, a: Analysis, hero: string,
  used: Map<ContentId, Set<PresentationId>>,
  brief?: DesignBrief | StoredBrief,
): { sec: Omit<Section, "why">; note: string } {
  if (sec.kind === "hero" || sec.content === "draft") return { sec, note: "" };
  const m = materialsOf(project, sec.content, a.hasRealPhotos);
  const isLead = PLAYBOOK[a.primaryStrength].lead === sec.content;
  /**
   * **最初の画面が出しているものを、すぐ下で同じ形で繰り返さない**（D-183）。
   * 「数字を大きく」の最初の画面なら、条件の帯は別の見せ方にする。
   * **帯そのものは消さない。** 消すと必要な情報が落ちる（D-204）。
   */
  const byHero: PresentationId[] =
    sec.content !== "conditions" ? []
    : hero === "figure" ? ["largeNumber"]
    : hero === "spec" ? ["spec", "list"]
    : [];
  /**
   * **同じページで、同じ内容を同じ形で2度出さない。**
   *
   * 対応可能範囲のページは「対応できる条件」と「仕様」の2帯で、
   * わざと**同じ内容を違う形**（大きな数字／仕様表）で出す作りになっている。
   * ところが D-214 で見せ方を強みに寄せたとき、この2帯が**どちらも大きな数字**になり、
   * 同じ4項目が1ページに二度、同じ顔で並んだ（実測・3社とも）。
   * 設備ページでも札の格子が2つ続いていた。
   * **消すのではなく、2つ目の形を変える**（D-204）。
   */
  const avoid: PresentationId[] = [...byHero, ...(used.get(sec.content) ?? [])];

  /**
   * 形の決まっている帯は、ここで終わり。**強みでも Brief でも動かさない。**
   * ただし材料が無ければ（型番の分かる設備が3件未満など）、下の通常の道に落ちる。
   */
  /**
   * 形の決まっている帯は、**中身が1行でもその形で出す。**
   *
   * 「3行以上」は、**薄い表を作らないため**の条件である（薄い年表は無いより悪い）。
   * ところが「保有設備一覧」「仕様」は**表そのものが中身**なので、この条件を当てると
   * **2行しかない会社で一覧が総台数の数字に化けた**（実測・a-precision）。
   * 見出しが「保有設備一覧」なのに数字が1つ出るだけ、という画面になる。
   * ここでは行数が1以上あるかだけを見る。
   */
  const rowsOf = (x: typeof m) => x.rows ?? x.count;
  if (sec.form && canPresent(sec.content, sec.form) && rowsOf(m) >= 1) {
    (used.get(sec.content) ?? used.set(sec.content, new Set()).get(sec.content)!).add(sec.form);
    const fixed = {
      ...sec, presentation: sec.form, decidedBy: "rules" as BriefSource,
      ruleChoice: { presentation: sec.form, emphasis: sec.emphasis },
    };
    return { sec: fixed, note: sec.form === sec.presentation ? "" : `／突き合わせて読む表なので「${sec.form}」で見せる` };
  }

  const rules = choosePresentation(sec.content, a, m, { isLead, avoid });
  const rulesEmphasis = sec.emphasis;

  /**
   * Brief（AI版）の判断を優先する。**ただし通すのは、もう一度検査してから。**
   *
   * `validateBrief` で一度通っていても、ここで**描く直前にもう一度**
   * 可否表・材料・重複を確認する（ご指示「AIの判断を4段検査より先に信頼しない」を
   * 2重にして守る）。落ちたら規則版に戻す。**止めない。**
   */
  const want = usable(brief)?.blocks.find((b) => b.content === sec.content && !avoid.includes(b.presentation));
  const ok = Boolean(want && canPresent(want.content, want.presentation) && hasMaterial(want.presentation, m));
  /**
   * **規則版と同じ判断なら、AIが決めたことにしない。**
   *
   * ここを「Brief が通った＝ai」にすると、AIがたたき台をそのまま返しただけの帯まで
   * `ai` と印がつき、**「AIが何を変えたのか」が読み取れなくなる**（ご指示5）。
   * 印を付けるのは、**実際に画面が変わったところだけ**にする。
   */
  const same = ok && want!.presentation === rules.presentation && want!.emphasis === rulesEmphasis;
  const decidedBy: BriefSource = !usable(brief) || same ? "rules" : ok ? "ai" : want ? "ai-fallback" : "rules";

  const presentation = ok ? want!.presentation : rules.presentation;
  const emphasis: Emphasis = ok ? want!.emphasis : rulesEmphasis;
  const why = ok ? "Briefの判断で" : decidedBy === "ai-fallback"
    ? `Briefの「${want!.presentation}」は材料が足りないので、規則版の` : rules.why;

  (used.get(sec.content) ?? used.set(sec.content, new Set()).get(sec.content)!).add(presentation);

  const next = {
    ...sec, presentation, emphasis, decidedBy,
    ruleChoice: { presentation: rules.presentation, emphasis: rulesEmphasis },
  };
  if (presentation === sec.presentation && emphasis === sec.emphasis) return { sec: next, note: "" };
  return { sec: next, note: `／${why}「${presentation}」で見せる` };
}

/**
 * **効かせてよい Brief かどうか。**
 *
 * 効かせるのは「AIの判断が4段検査を通って採用された」ものだけ。
 * `rules` と `ai-fallback` の中身は**規則版そのもの**なので、
 * 渡しても渡さなくても同じ結果でなければならない。
 *
 * ところがこれを素通しにしていたため、**APIが401で落ちて規則版に戻した案件で、
 * 強み・設備ページの帯が変わり、しかも `ai` の印が付いた**（実測）。
 * 原因は、Brief が「内容ごと」に1つの値を持つのに対し、
 * **同じ内容でもページによって出し方が違う**こと（強みページの条件は控えめ、
 * 対応可能範囲のページでは主役）。ここで止めるのが確実である。
 */
const usable = (brief: DesignBrief | StoredBrief | undefined): DesignBrief | undefined =>
  !brief ? undefined
  : (brief as StoredBrief).source === undefined || (brief as StoredBrief).source === "ai" ? brief
  : undefined;

/**
 * 形の決まっている帯のために、その形を先に押さえる。
 * **材料が無ければ押さえない**（押さえた形をその帯が使えないと、ただ選択肢が減る）。
 */
function reserve(
  used: Map<ContentId, Set<PresentationId>>,
  content: ContentId, form: PresentationId, project: Project, a: Analysis,
): void {
  if (!hasMaterial(form, materialsOf(project, content, a.hasRealPhotos))) return;
  (used.get(content) ?? used.set(content, new Set()).get(content)!).add(form);
}

/**
 * 誰が何を決めたかの一覧（ご指示）。
 *
 * **`final` は、実際に描かれた値。** AIが言った値ではない。
 */
export function traceOf(sections: Section[]): BriefTrace[] {
  return sections
    .filter((s) => s.kind !== "hero" && s.content !== "draft" && s.ruleChoice)
    .map((s) => ({
      content: s.content,
      heading: s.heading ?? s.kind,
      rules: s.ruleChoice!,
      ai: s.decidedBy === "ai" || s.decidedBy === "ai-fallback"
        ? { presentation: s.presentation, emphasis: s.emphasis }
        : null,
      final: { presentation: s.presentation, emphasis: s.emphasis },
      source: s.decidedBy ?? "rules",
    }));
}

const getStrength = (a: Analysis) => a.primaryStrength;

/** 型の候補のうち、**聞き取りに裏づけのある**最初のものを取る（ご指示§7） */
export function pickMotif(candidates: MotifId[], a: Analysis): MotifId {
  const available = new Set(a.motifs);
  return candidates.find((m) => m !== "none" && available.has(m)) ?? "none";
}

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
  opts: {
    maxStrands?: number; hero?: string; hasProse?: boolean; direction?: string;
    /**
     * 保存された Brief。**無ければ、いままでどおり規則版だけで決まる**（ご指示）。
     * 実案件の既定は規則版のまま。AI版は明示したときだけ作られる。
     */
    brief?: DesignBrief | StoredBrief;
  } = {},
): Section[] {
  const { maxStrands = 4, hero = "headline", hasProse = false, direction, brief } = opts;
  const tone = getDirection(direction).tone;
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
  /**
   * **主役の内容は、最初の画面と重なっても消さない**（D-204・D-214）。
   * 短納期が強みの会社で「対応範囲を先に」の最初の画面を選ぶと、
   * 条件の帯ごと消えて、**いちばん見せたい「標準7日／最短翌日」が出なくなった。**
   * 消すのではなく、**最初の画面と違う見せ方にする**（下の `avoid`）。
   */
  const leadIsConditions = PLAYBOOK[getStrength(a)].lead === "conditions";
  const coveredByHero: Section["kind"][] = hero === "spec" && !leadIsConditions ? ["figures"] : [];

  const d = getDirection(direction);
  let prev: SurfaceId | null = null;
  let n = 0;
  /** このページで、その内容をどの形ですでに出したか（同じ形を2度出さない） */
  const used = new Map<ContentId, Set<PresentationId>>();
  let invertedDone = false;
  const put = (base: Base, why: string) => {
    const decorated = decorate(applyTone(base, tone), d, a, n++, prev, invertedDone);
    if (INVERTED.includes(decorated.surface)) invertedDone = true;
    const { sec, note } = repress(decorated, project, a, hero, used, brief);
    prev = sec.surface;
    out.push({ ...sec, why: why + note });
  };
  const out: Section[] = [];
  out.push({
    kind: "hero", width: "normal", emphasis: "lead",
    surface: d.surfaces[0] ?? "plain", layout: "stack", media: a.hasRealPhotos ? "full" : "none",
    motif: pickMotif(d.motifs, a), ...KIND_AS.hero, why: "型で選ばれた最初の画面",
  });

  // 見立ての上位。材料の無いものは analyze() の時点で落ちている
  const picked = applyDirection(a.strands, direction)
    .filter((s) => BY_STRAND[s.id] && !coveredByHero.includes(BY_STRAND[s.id]!.kind))
    .slice(0, maxStrands);

  /**
   * **最大の強みに対応する内容を、主役として先頭に持ってくる**（ご指示④）。
   * 根拠が無い（unknown）ときは何もしない。安全な既定のまま。
   */
  const leadContent = PLAYBOOK[a.primaryStrength].lead;
  const leadStrand = a.primaryStrength === "unknown" ? -1
    : picked.findIndex((s) => BY_STRAND[s.id] && KIND_AS[BY_STRAND[s.id]!.kind].content === leadContent);
  if (leadStrand > 0) {
    const [x] = picked.splice(leadStrand, 1);
    picked.unshift(x!);
  }

  const first = picked[0];
  if (first) put(BY_STRAND[first.id]!, first.why);

  /**
   * 生成した散文は、**1位の直後**に置く。
   * 会社を一言で言う材料（他社が断った案件など）を見たあとに読むほうが入る。
   */
  if (has.prose) {
    put({ kind: "prose", width: "narrow", emphasis: "normal", slug: "index" }, "生成した紹介文");
  }

  // 事例は上に。**最も問い合わせに繋がる**
  if (has.cases) {
    put({ kind: "cases", width: "wide", emphasis: "normal", heading: "加工事例" }, "最も問い合わせに繋がる");
  }

  for (const s of picked.slice(1)) put(BY_STRAND[s.id]!, s.why);

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
    .map((s, i) => {
      const name = s.kind === "prose" ? "（ここに原稿が入ります）" : (s.heading ?? s.kind);
      return `${i + 1}. ${name}　[${s.width}/${s.emphasis}]　${s.why ?? ""}`;
    })
    .join("\n");
}

/**
 * トップ以外のページの構成。
 *
 * **ここも `.astro` に固定させない。**
 * 直す前は、強み・技術も対応可能範囲も設備一覧も、
 * 「見出し→本文→表」を1040pxの帯で繰り返すだけだった（docs/21）。
 *
 * 材料の無いものは作らない、はトップと同じ。
 */
export function composePage(
  slug: "strengths" | "capability" | "equipment",
  project: Project,
  a: Analysis,
  /**
   * **Brief は受け取らない**（ご指示の「AIが決めるのは、何を主役にするか」）。
   *
   * 主役の判断はトップページの話である。強み・対応可能範囲・設備の各ページには、
   * そのページ自身の筋がある（強みページの条件の帯は、強みを読んだあとに
   * 確かめてもらうための控えめな帯で、対応可能範囲のページでは主役）。
   * **内容ごとに1つの値しか持たない Brief を下層にも当てると、その筋が壊れる。**
   */
  opts: { direction?: string; hasProse?: boolean } = {},
): Section[] {
  const { direction, hasProse = false } = opts;
  const tone = getDirection(direction).tone;
  const p = project as any;
  const cap = p.capability ?? {};
  const st = p.strengths ?? {};
  const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const out: Section[] = [];
  const d = getDirection(direction);
  let prev: SurfaceId | null = null;
  let n = 0;
  const used = new Map<ContentId, Set<PresentationId>>();
  let invertedDone = false;
  const add = (base: Base, why: string) => {
    const decorated = decorate(applyTone(base, tone), d, a, n++, prev, invertedDone);
    if (INVERTED.includes(decorated.surface)) invertedDone = true;
    const { sec, note } = repress(decorated, project, a, "headline", used);
    prev = sec.surface;
    out.push({ ...sec, why: why + note });
  };

  if (hasProse) add({ kind: "prose", width: "narrow", emphasis: "normal", slug }, "生成した本文");

  if (slug === "strengths") {
    /**
     * **最も強い1つを、本文と同じ大きさで並べない。**
     * 「他社様で断られた案件を受けた」は、この会社を一言で言うもの。
     */
    if (has(st.wonAfterOthersDeclined)) {
      add({ kind: "declined", width: "narrow", emphasis: "lead", heading: "他社様で難しいと言われた案件" }, "この会社を一言で言うもの");
    }
    if (has(st.followUpFindings)) {
      add({ kind: "technique", width: "narrow", emphasis: "normal", heading: "どうやって受けているか" }, "取材の追い質問で出てきた工程の工夫");
    }
    // 残りは塊として。**全部を同じ見出しの繰り返しにしない**
    add({ kind: "points", width: "wide", emphasis: "normal", heading: "お取引先からいただく言葉" }, "褒め言葉・敬遠されがちな仕事・最も難しかった仕事");
    if (a.figures.length) add({ kind: "figures", width: "full", emphasis: "quiet", heading: "対応できる条件" }, "強みを読んだあとに、条件で確かめてもらう");
  }

  if (slug === "capability") {
    /**
     * **下の「仕様」が表で出せるなら、上の帯は表以外にする。**
     * 同じ内容を、同じページに、同じ形で2度出さないため（先に席を取っておく）。
     */
    reserve(used, "conditions", "spec", project, a);
    if (a.figures.length) add({ kind: "figures", width: "full", emphasis: "lead", heading: "対応できる条件" }, "調達担当者が最初に見るもの");
    if ((cap.materials ?? []).length) {
      add({ kind: "materials", width: "wide", emphasis: "normal", heading: "対応できる材質・加工法" }, "検索される語そのもの");
    }
    add({ kind: "specTable", width: "wide", emphasis: "normal", heading: "仕様", form: "spec" }, "数字で確かめてもらう部分");
  }

  if (slug === "equipment") {
    reserve(used, "equipment", "spec", project, a);
    const named = (cap.equipment ?? []).filter((e: any) => e?.model && e?.maker);
    /**
     * **型番の分かっている設備が2台以上あるときだけ、「主な設備」として抜き出す。**
     *
     * 1台しか分からない案件でこの帯を出すと、札の格子は材料不足で作れず、
     * **「主な設備」という見出しの下に総台数の数字が1つ出るだけ**になった（実測）。
     * 下の一覧表が全台を出しているので、抜き出しをやめても情報は減らない（D-204）。
     */
    if (named.length >= 2) {
      add({ kind: "equipment", width: "wide", emphasis: "lead", heading: "主な設備" }, "型番まで分かっている設備。型番そのものが検索される");
    }
    add({ kind: "equipmentTable", width: "wide", emphasis: named.length ? "quiet" : "normal", heading: "保有設備一覧", form: "spec" }, "全設備の一覧");
    add({ kind: "gallery", width: "full", emphasis: "normal", heading: "工場・設備" }, "設備は写真があると伝わる");
  }

  return dedupe(out);
}

/**
 * そのセクションが、**すでに画面に出しているもの**。
 *
 * 原稿を書く側に渡すために要る。
 * これまでは構成と原稿が別々に決まっていたので、
 * **材質の札がすぐ下に出ているのに、原稿でも材質を並べる**ということが起きていた。
 * 「何がすでに出ているか」を伝えれば、繰り返さずに済む（D-193）。
 */
const SHOWS: Record<Section["kind"], string> = {
  hero: "会社名・事業の概要・（型によっては）対応材質や納期の一覧・外観写真",
  figures: "対応ロット・最短納期・対応精度・対応材質を、大きな文字で",
  declined: "他社様が断った案件の記録（聞き取った文章そのまま）",
  technique: "工程の工夫（聞き取った文章そのまま）",
  materials: "対応材質と加工法を、ひとつずつ札にして",
  equipment: "メーカー・型番の分かっている設備（名称・メーカー・台数）",
  equipmentTable: "保有設備の一覧表（設備名・メーカー・台数）",
  specTable: "対応材質・加工法・サイズ・精度・ロット・納期・資格の一覧表",
  cases: "加工事例のカード（業界・表題・相談内容の冒頭）",
  gallery: "工場・設備の写真",
  timeline: "創業年と沿革の年表",
  people: "5年後のビジョン・代表者名",
  points: "褒め言葉・同業が敬遠する仕事・最も難しかった仕事（聞き取った文章そのまま）",
  prose: "——ここにあなたの文章が入ります——",
};

/** 原稿を書く人に見せる、このページの構成 */
export function describeForWriter(sections: Section[]): string {
  return sections
    .map((s, i) => {
      const head = s.kind === "prose" ? "**あなたの文章**" : (s.heading ?? s.kind);
      return `${i + 1}. ${head}　… ${SHOWS[s.kind]}`;
    })
    .join("\n");
}

/**
 * 実際に使える最初の画面を選ぶ。
 *
 * **選んだ型に材料が無ければ、その型の次の候補へ落とす。**
 * 「数字を大きく」を選んでも短い数字が聞き取れていなければ、
 * 画面いっぱいに長い文が出るだけになる（D-203）。
 * 黙って既定に戻すのではなく、**その型が向いている順**に落とす。
 */
export function resolveHero(
  chosen: string | undefined,
  a: Analysis,
  directionId: string | undefined,
): string {
  const d = getDirection(directionId);
  const ok = (h: string): boolean => {
    if (h === "photo") return a.hasRealPhotos;
    if (h === "figure") return a.heroFigure !== null;
    if (h === "motif") return a.motifs.length > 0;
    return true;
  };
  if (chosen && ok(chosen)) return chosen;
  return d.heroes.find(ok) ?? "headline";
}

/**
 * いまの `kind` を、内容と表現の組として読み替える。
 *
 * **1・2歩目では見え方を変えない**（D-210）。
 * 構造だけを分けて、既定の組み合わせを**いまとまったく同じ**にしておく。
 * 表現を実際に切り替えるのは4歩目から。
 */
const KIND_AS: Record<Section["kind"], { content: ContentId; presentation: PresentationId }> = {
  hero: { content: "draft", presentation: "prose" },
  figures: { content: "conditions", presentation: "largeNumber" },
  declined: { content: "declined", presentation: "quote" },
  technique: { content: "technique", presentation: "prose" },
  materials: { content: "materials", presentation: "chips" },
  equipment: { content: "equipment", presentation: "cardGrid" },
  equipmentTable: { content: "equipment", presentation: "spec" },
  specTable: { content: "conditions", presentation: "spec" },
  cases: { content: "cases", presentation: "cardGrid" },
  gallery: { content: "photos", presentation: "fullWidth" },
  timeline: { content: "history", presentation: "timeline" },
  people: { content: "executive", presentation: "prose" },
  points: { content: "praise", presentation: "cardGrid" },
  prose: { content: "draft", presentation: "prose" },
};

export const asContentPresentation = (kind: Section["kind"]) => KIND_AS[kind];
