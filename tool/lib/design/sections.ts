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
import { canPresent, hasMaterial, keepsAll, widthFor } from "./system/index.ts";
import { labelOf } from "./system/page.ts";
import type { PageId } from "./system/page.ts";
import { isOwner, REFERENCE_AS, canListTechnique } from "./system/owner.ts";
import type { WidthId } from "./system/index.ts";
import { choosePresentation, PLAYBOOK, LABEL } from "./playbook.ts";
import { materialsOf } from "./materials.ts";
import type { BriefSource, BriefTrace, DesignBrief, Emphasis, StoredBrief } from "./brief.ts";

/** セクションの幅。**全部同じ幅にしない**のが今回の主眼 */
/**
 * 帯の幅。**語彙は `system/width.ts` が単一の正**（第7段階）。
 * ここは名前を変えずに受けるだけ（既存の読み手を壊さないため）。
 */
export type Width = WidthId;

/**
 * 強さ。**重要情報と補助情報を同じ大きさで出さない**
 * 語彙は `brief.ts` が単一の正（3段で固定・ご指示）。
 */
export type { Emphasis };

export interface Section {
  kind:
    | "hero"
    | "offerings" // 取り扱い・サービス・料金（汎用プランの中心・D-272）
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
    /** ここから下は、事例個別・会社概要・採用・お問い合わせのための帯（D-301） */
    | "caseSpec" // この事例の条件（材質・数量・納期・加工法・お断りの理由）
    | "caseSteps" // この事例の ご相談 → 対応 → 結果
    | "caseTags" // この事例の材質・加工法
    | "profileTable" // 会社概要の表
    | "recruitTerms" // 募集要項の表
    | "recruitPoints" // 募集している職種・職場について
    | "executiveVoice" // 社員に伝えたいこと（代表の言葉そのまま）
    | "inquiryContact" // ご連絡先（電話・メール・所在地・稼働体制）
    | "inquiry" // お問い合わせの用紙
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
  /**
   * **この帯は、その内容の本体ではない**（Owner / Reference の実証）。
   *
   * 本体は別のページにあるので、ここでは**見出し＋短い情報＋本体へのリンク**にする。
   * 判定は `system/owner.ts` の表だけが持ち、**Astro 側には散らさない。**
   */
  reference?: true;
  /**
   * **この帯は、その内容の全件を見せる帯である**（第6.5段階）。
   *
   * 一覧のページの一覧そのものに付ける。
   * 付いていると、`choosePresentation` が**1件に畳む表現を候補から外す。**
   *
   * 【なぜ帯の側で宣言するか】
   * 「代表1件を工程で見せて、一覧へ誘導する」は正しい設計である（トップページ）。
   * **1件に畳むこと自体は悪ではない。** 悪いのは、
   * **一覧そのものの帯が1件に畳まれること**で、それは帯の役割でしか区別できない。
   *
   * 実測：加工事例の一覧ページで、4件のうち**画面に出ていたのは0件**だった
   * （`process` が代表1件、`quote` が1発言。しかもこのページでは「すべて見る」の
   * 導線も出ない作りだったので、**残り3件に到達する道が1つも無かった**）。
   */
  keepAll?: boolean;
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
/**
 * 型の好みを、見立ての点数に足し引きする。
 *
 * **型は「好み」であって、会社の材料を追い越すものではない**（D-282）。
 *
 * もとは ±3 だった。汎用の3社（士業・美容室・工務店）を同じ型で並べたところ、
 * **3社とも先頭の帯が同じ**になった。見立ての点は 2〜6 の幅しかないので、
 * **±3 はほとんどどの組も逆転させてしまう。**「型を選んだら毎回同じページ」（ご指示§5）
 * の、いちばん分かりやすい形である。
 *
 * ±2 にすると、**大きく離れた組は動かず、僅差の組だけが入れ替わる。**
 * 製造業3社の基準HTMLは1ページも変わらなかった（点差がもともと大きいため）。
 */
function applyDirection(strands: Strand[], directionId: string | undefined): Strand[] {
  const d = getDirection(directionId);
  return strands
    .map((s) => {
      if (d.favor.includes(s.id)) return { ...s, score: s.score + 2, why: `${s.why}／型「${d.label}」で前に出す` };
      if (d.defer.includes(s.id)) return { ...s, score: Math.max(1, s.score - 2), why: `${s.why}／型「${d.label}」では後ろに回す` };
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

/**
 * **帯の見出しを、商品ごとに出し分ける**（D-276）。
 *
 * 画面を見て発見した。水まわりの設備工事の会社のページに
 * **「加工事例」「他社様で難しいと言われた案件」**と出ていた。
 * `Present.astro` は中身のほうを出し分けていた（汎用では「実績をすべて見る」）のに、
 * **見出しだけ製造業の言葉のまま**だった。**片方だけ直した典型である。**
 *
 * 汎用では、`declined` の中身は「選ばれている理由」（`general.reasonChosen`）であり、
 * 他社が断った案件ではない。**見出しが中身と食い違っていた。**
 * お客様にそのまま出る言葉なので、**ここを間違えると納品できない。**
 *
 * 【言い換えの表にした理由】
 * 最初は「帯の種類 → 商品ごとの見出し」の表にしたが、**製造業が壊れた。**
 * 対応可能範囲のページだけ「対応できる材質・**加工法**」という別の見出しを使っており、
 * 種類で引くと**その区別ごと潰してしまう**（基準HTMLが3ページ落ちて気づいた）。
 *
 * **製造業の見出しを鍵にして、汎用の言い方を引く。**
 * 表に無い見出しはそのまま通るので、**製造業は定義上1文字も変わらない。**
 */
const GENERAL_WORDS: Record<string, string> = {
  "加工事例": "実績",
  "他社様で難しいと言われた案件": "選ばれている理由",
  "どうやって受けているか": "どうやって応えているか",
  "主な設備": "設備・道具",
  "保有設備一覧": "設備の一覧",
  "対応できる材質": "対応できるもの",
  "対応できる材質・加工法": "対応できるもの",
  /** 美容室に「工場・設備」と出ていた（D-293）。D-276の表からの漏れ */
  "工場・設備": "現場の様子",
  "沿革": "歩み",
};

/**
 * その商品での見出し。
 * **製造業は、渡された見出しをそのまま返す**（言い換えは汎用のときだけ）。
 */
export const headingFor = (heading: string | undefined, isGeneral: boolean): string | undefined =>
  isGeneral && heading ? (GENERAL_WORDS[heading] ?? heading) : heading;

const BY_STRAND: Record<ShowBy, Base | null> = {
  /**
   * 取り扱い（D-272）。**汎用プランの中心なので、既定で主役に置く。**
   * 製造業の案件では材料が0件なので、`analyze()` が0点にして落とす。
   */
  offerings: { kind: "offerings", width: "wide", emphasis: "lead", heading: "取り扱い" },
  voice: { kind: "points", width: "wide", emphasis: "normal", heading: "お客様の声" },
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
/**
 * **同じ地紋を隣どうしに置かない**（第8段階③・D-362）。
 *
 * 地紋は「強い帯にだけ敷く」（`emphasis === "lead"` のとき `pickMotif`）が、
 * **その型で選ばれる地紋は1つ**なので、強い帯が続くと**まったく同じ模様が隣に並ぶ。**
 * 実測：老舗の会社概要で「素材の目」が2本続き、製品・開発の事例と会社概要で
 * 「断面」が2本続いていた。**2度出た模様は、2度目には模様として読まれない。**
 *
 * 第2段階で装飾どうしに課した「2本以上離す」（D-324）と同じ規則を、地紋にも当てる。
 * **足すのではなく、2本目を落とす**（装飾は増やさない）。
 * 最初の画面（hero）は `.band` ではなく地紋を描かないので、数に入れない。
 */
function spaceMotif(sec: Section, prev: Section | undefined): Section {
  if (sec.motif === "none" || !prev || prev.kind === "hero") return sec;
  return prev.motif === sec.motif ? { ...sec, motif: "none" } : sec;
}

function repress(
  sec: Omit<Section, "why">, project: Project, a: Analysis, hero: string,
  used: Map<ContentId, Set<PresentationId>>,
  /** **この帯を描くページ。** 本体（Owner）かどうかの判定に使う */
  page: PageId,
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
   * ── 本体でないページでは、短く出す（Owner / Reference の実証）──────
   *
   * **帯そのものは消さない**（D-204）。消すと導線ごと無くなる。
   * 変えるのは**見せ方と強さ**だけで、文章には一切手を入れていない。
   *
   * 【なぜ `avoid` のあとに置くか】★実装中に検査が3本落ちて分かった
   * 最初はこの判断を関数の先頭に置き、そこで `return` していた。すると
   *   ・**D-183 の関所を素通り**した（最初の画面が数字なのに、条件の帯も大きな数字になった）
   *   ・**材料の2重の関所を素通り**した（材料の無い表現がそのまま画面に出た）
   * **短くするための近道が、既存の安全装置を飛び越えていた。**
   * 短い見せ方も `avoid` を通し、使えなければ**規則版の選択に戻す**（AIの指定は通さない）。
   */
  /**
   * **トップページは、その会社の勝ち筋だけを本体として持つ**（Owner / Reference）。
   *
   * ★検査が教えてくれた：「全15型・6社とも、トップに山が1つ以上ある」が落ちた。
   * すべての内容を別ページの参照にしたので、**トップに山が1つも立たなくなった。**
   * トップが何も所有しないのは、要約ではなく**目次**である。
   *
   * `PLAYBOOK[勝ち筋].lead` は「この会社を一言で言うとこれ」という内容で、
   * それだけは**トップで全文**、残りは参照にする。
   * 難加工の会社ならトップの主役は実際に受けた仕事、精度の会社なら条件になる。
   */
  const ownsAsLead = page === "index" && isLead;
  if (!isOwner(sec.content, page) && !ownsAsLead) {
    const st: any = (project as any).strengths ?? {};
    /** **候補を順に見て、関所を全部通った最初のものを使う。** 通らなければ規則版に戻す */
    const refAs = (REFERENCE_AS[sec.content] ?? []).find((x) =>
      canPresent(sec.content, x) && hasMaterial(x, m) && !avoid.includes(x)
      && (sec.content !== "technique" || canListTechnique(st.followUpFindings)));
    const fallback = choosePresentation(sec.content, a, m, { isLead: false, avoid, keepAll: sec.keepAll });
    const presentation = refAs ?? fallback.presentation;
    const ok = Boolean(refAs);
    /** **本体でない帯を、そのページの山にしない。** 同じ文が3ページで山になっていた */
    const emphasis = sec.emphasis === "lead" ? "normal" as const : sec.emphasis;
    (used.get(sec.content) ?? used.set(sec.content, new Set()).get(sec.content)!).add(presentation);
    /**
     * **AIが何か言っていたのに採らなかったなら、そう記録する**（検査が教えてくれた）。
     * ここは Brief を読まずに決める場所だが、**「読まなかった」のと
     * 「読んで落とした」のを同じ `rules` にすると、誰が決めたかの記録が嘘になる。**
     */
    const said = usable(brief)?.blocks.find((b) => b.content === sec.content);
    const decidedBy: BriefSource =
      said && said.presentation !== presentation ? "ai-fallback" : "rules";
    return {
      sec: { ...sec, presentation, reference: true, emphasis, width: widthFor(presentation),
             decidedBy, ruleChoice: { presentation, emphasis } },
      note: ok ? `／本体は別ページなので「${presentation}」で短く出す`
               : `／本体は別ページだが、短い見せ方が使えないので規則版の「${presentation}」で出す`,
    };
  }

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
      ...sec, presentation: sec.form, width: widthFor(sec.form), decidedBy: "rules" as BriefSource,
      ruleChoice: { presentation: sec.form, emphasis: sec.emphasis },
    };
    return { sec: fixed, note: sec.form === sec.presentation ? "" : `／突き合わせて読む表なので「${sec.form}」で見せる` };
  }

  const rules = choosePresentation(sec.content, a, m, { isLead, avoid, keepAll: sec.keepAll });
  const rulesEmphasis = sec.emphasis;

  /**
   * Brief（AI版）の判断を優先する。**ただし通すのは、もう一度検査してから。**
   *
   * `validateBrief` で一度通っていても、ここで**描く直前にもう一度**
   * 可否表・材料・重複を確認する（ご指示「AIの判断を4段検査より先に信頼しない」を
   * 2重にして守る）。落ちたら規則版に戻す。**止めない。**
   */
  const want = usable(brief)?.blocks.find((b) => b.content === sec.content && !avoid.includes(b.presentation));
  /**
   * **AIの判断にも、同じ条件を当てる**（第6.5段階）。
   * 規則版だけを直しても、Brief を効かせたときに同じ穴が開く。
   */
  const ok = Boolean(
    want && canPresent(want.content, want.presentation) && hasMaterial(want.presentation, m)
    && (!sec.keepAll || m.count < 2 || keepsAll(sec.content, want.presentation)),
  );
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

  /**
   * **幅は見せ方から決まる**（第7段階・`system/width.ts`）。
   *
   * 帯の種類ごとに手で書いていたため、**同じ見せ方なのに帯によって幅が違い**、
   * しかも4段のうち `normal` は168帯中1帯しか使われていなかった。
   * ここで見せ方から引き直すと、**同じ見せ方は必ず同じ幅**になる。
   */
  const next = {
    ...sec, presentation, emphasis, decidedBy, width: widthFor(presentation),
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
 * 材料の薄い帯を、主役として出さない（D-251）。
 *
 * 「対応できる条件」の帯は、**会社によらず必ず `lead`** だった。
 * ところが公差が空欄で、納期が「案件により相談」の会社では、
 * **何も言っていない帯が、いちばん強い帯として画面の上に出る。**
 * AI版が唯一まともに効いたのがここで（D-248のB社）、**規則で埋められる。**
 *
 * 条件が主役になるのは、**短く言い切れて、数字を含む値**があるときだけ。
 */
function weaken(base: Base, project: Project, a: Analysis): Base {
  if (base.emphasis !== "lead") return base;
  if (KIND_AS[base.kind].content !== "conditions") return base;
  const m = materialsOf(project, "conditions", a.hasRealPhotos);
  return m.hasStrongValue || m.hasPair ? base : { ...base, emphasis: "normal" };
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
  /** **汎用では見出しの言葉が違う**（D-276）。水まわりの会社に「加工事例」と出さない */
  const isGeneral = (project as any).formSet === "general";
  const put = (base: Base, why: string) => {
    const named = { ...base, heading: headingFor(base.heading, isGeneral) };
    const decorated = decorate(applyTone(weaken(named, project, a), tone), d, a, n++, prev, invertedDone);
    if (INVERTED.includes(decorated.surface)) invertedDone = true;
    const { sec, note } = repress(decorated, project, a, hero, used, "index", brief);
    prev = sec.surface;
    out.push({ ...spaceMotif(sec, out[out.length - 1]), why: why + note });
  };
  const out: Section[] = [];
  out.push({
    kind: "hero", width: "normal", emphasis: "lead",
    surface: d.surfaces[0] ?? "plain", layout: "stack", media: a.hasRealPhotos ? "full" : "none",
    motif: pickMotif(d.motifs, a), ...KIND_AS.hero, why: "型で選ばれた最初の画面",
  });

  // 見立ての上位。材料の無いものは analyze() の時点で落ちている
  /**
   * **写真は足し算であって、置き換えではない**（D-289・ご指示§10）。
   *
   * 帯の数には上限がある（`maxStrands`）。写真の筋をその枠の中で数えていたため、
   * **写真が届いた途端、別の帯が枠から押し出されて画面から消えていた。**
   * 実測：写真7枚を足すと、
   *   ・精度の会社　… 「どうやって受けているか」が消えた
   *   ・美容室　　　… **「選ばれている理由」（その会社の山）が消えた**
   * D-204（情報を削らせない）に真っ向から反する。
   *
   * 写真は**メディアの層**であって、情報の帯と枠を奪い合うものではない。
   * 枠の外に出して、材料があるときだけ後ろに足す。
   */
  const ranked2 = applyDirection(a.strands, direction)
    .filter((s) => BY_STRAND[s.id] && !coveredByHero.includes(BY_STRAND[s.id]!.kind));
  const gallery = ranked2.find((s) => s.id === "photos");
  let picked = ranked2.filter((s) => s.id !== "photos").slice(0, maxStrands);
  /**
   * **枠は奪わないが、位置は型の好みに従う。**
   * 最後に固定すると、写真を前に出す型（量産・設備）の指定を踏み潰す。
   * 点数どおりの位置に**差し込む**ので、ほかの帯は1つも消えず、**相対の順番も変わらない。**
   */
  if (gallery) {
    const at = picked.findIndex((s) => s.score < gallery.score);
    picked.splice(at < 0 ? picked.length : at, 0, gallery);
  }

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

  /**
   * **Brief の並び順を、実際に効かせる**（D-263）。
   *
   * `DesignBrief.blocks` は前から順に「先に見せるもの」と定義してあり、
   * AIへの指示にも「どの情報を先に見せるか（blocks の並び順）」と書いてある。
   * **ところが、composeTop はこれを一度も読んでいなかった。**
   * 表現と強さだけを内容ごとに引いており、順番は捨てていた。
   * 実測で、AIが「技術の説明を2番目に上げる」と返したのに画面は1文字も動かず、
   * **こちらが訊いておいて捨てていた**ことが分かった。
   *
   * 効かせるのは**見立てから出てくる帯の並びだけ**である。
   * 最初の画面・生成した散文・事例の位置は、ページの筋としてこちらが決める
   * （事例は上に、散文は1位の直後）。Brief に無いものは後ろに、元の順のまま残す。
   */
  const order = usable(brief)?.blocks.map((b) => b.content);
  if (order) {
    const rank = (s: typeof picked[number]) => {
      const c = BY_STRAND[s.id] && KIND_AS[BY_STRAND[s.id]!.kind].content;
      const i = c ? order.indexOf(c) : -1;
      return i < 0 ? order.length : i;
    };
    picked = picked
      .map((s, i) => ({ s, i }))
      .sort((x, y) => rank(x.s) - rank(y.s) || x.i - y.i)
      .map((x) => x.s);
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

  /**
   * **「どうやって受けているか」は、事例のすぐ後ろに置く**（D-264）。
   *
   * 事例は「こう相談され、こう解決した」と言う。
   * 「どうやって受けているか」は、**その解決の方法に名前をつけて説明する帯**である。
   *   事例「専用治具を内製し、荒取り後に一度寝かせて応力を逃がしてから仕上げた」
   *   　→　技術「治具の内製」「加工順序の設計」
   * **この2つの間に材質の札や設備のカードが挟まると、話の筋が切れる。**
   *
   * 規則版は帯を「見立ての点数順」に並べていた。点数順は**我々が測った強さの順**であって、
   * **読み手の疑問の順ではない。** 読み手は「本当にできるのか」の次に「なぜできるのか」を見る。
   *
   * これは会社によらない**ページの筋**なので、規則で持つ（D-250・D-252の考え方）。
   * 実測：3社（精度・難加工・短納期）でAIが返した並びが、3社とも同じこの動きだった。
   * 会社ごとに違う判断ではない以上、毎回AIに訊いて払う理由がない。
   */
  const rest = picked.slice(1);
  /** **事例が無ければ、この規則は意味を持たない。** 直後に置くものが無い */
  const tech = has.cases ? rest.findIndex((s) => s.id === "technique") : -1;
  if (tech > 0) rest.unshift(...rest.splice(tech, 1));
  for (const s of rest) put(BY_STRAND[s.id]!, s.why);

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
/**
 * 帯で組むページ。**13ページ全部**（D-301）。
 *
 * 長いあいだ、ここは3ページしか受け付けなかった。
 * 事例・会社概要・代表挨拶・採用・お問い合わせは `pages/*.astro` に直接書かれており、
 * **山も・余白の変化も・組み方の変化も、構造として存在しなかった。**
 */
export type PageSlug =
  | "strengths" | "capability" | "equipment"
  | "cases" | "case" | "company" | "message" | "recruit" | "contact";

export function composePage(
  slug: PageSlug,
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
  opts: {
    direction?: string; hasProse?: boolean;
    /**
     * **厚くするか**（第6段階・`composeSite`）。
     *
     * `thick` は「新しい内容を作る」ではない。
     * **この会社がすでに持っている材料を、このページにも降ろす**だけである。
     * 材料が無ければ何も足さないので、**水増しにならない。**
     * 勝ち筋のページだけが厚くなる（難加工なら事例、短納期なら設備）。
     */
    depth?: "standard" | "thick";
  } = {},
): Section[] {
  const { direction, hasProse = false, depth = "standard" } = opts;
  const thick = depth === "thick";
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
  /** **下層ページの見出しも、商品ごとに出し分ける**（D-276）。トップだけ直しても片手落ち */
  const isGeneral = (project as any).formSet === "general";
  /**
   * **ページの見出しと同じ言葉を、すぐ下でもう一度出さない。**
   *
   * 実測：会社概要のページは `会社概要`（ページ見出し）→ `会社概要`（節の見出し）、
   * 設備一覧のページは `設備一覧` → `保有設備一覧` と、**同じ言葉が続けて2回**出ていた。
   * 上の見出しがもう言っているので、下は言い直しでしかない。
   * **人が作ったページでは起きない重なり方**で、自動生成に見えるいちばん安い印である。
   *
   * ★最初は「ページの1本目だけ」にしたが、**会社概要で効かなかった。**
   * 写真の無いギャラリーの帯が数に入っていて、`profileTable` が2本目になっていたためである
   * （画面には出ないが、`composePage` は帯を返す）。**画面上の1本目は、ここでは分からない。**
   * 位置ではなく**言葉で**判定する。ページ見出しとまったく同じ言葉の節は、
   * どこにあっても言い直しである。
   */
  const pageLabel = labelOf(slug as PageId, isGeneral ? "general" : "manufacturing");
  /**
   * ★**完全一致だけ**にする。最初は「ページ見出しで終わる見出し」も消していたが、
   * 実測で **「お問い合わせ」→「フォームでのお問い合わせ」まで消えた**（43案件中35件）。
   * こちらは言い直しではなく、**電話とフォームを区別する見出し**である。
   * 言い直しかどうかを語尾で当てるのは無理なので、**同じ言葉のときだけ**にする。
   */
  const echoesPageHead = (h: string | undefined) => Boolean(h) && h === pageLabel;
  const add = (base: Base, why: string) => {
    const h0 = headingFor(base.heading, isGeneral);
    const named = { ...base, heading: echoesPageHead(h0) ? undefined : h0 };
    const decorated = decorate(applyTone(weaken(named, project, a), tone), d, a, n++, prev, invertedDone);
    if (INVERTED.includes(decorated.surface)) invertedDone = true;
    const { sec, note } = repress(decorated, project, a, "headline", used, slug as PageId);
    prev = sec.surface;
    out.push({ ...spaceMotif(sec, out[out.length - 1]), why: why + note });
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
    /**
     * **厚くするとき**（精度・対応範囲が強み／来てほしくない問い合わせがある会社）。
     * 条件の表だけを見せて終わると、「なぜその条件で受けられるのか」が無い。
     * **取材の追い質問で出てきた工程の工夫**を、ここにも降ろす。
     */
    if (thick && has(st.followUpFindings)) {
      add({ kind: "technique", width: "narrow", emphasis: "normal", heading: "どうやって受けているか" }, "受けられる条件の裏づけ（このページを厚くする）");
    }
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
    /**
     * **「控えめ」にしてよいのは、上に「主な設備」の帯があるときだけ**（D-302）。
     * `named.length` だけを見ていたので、型番が1台しか分からない会社では
     * **上に何も無いのに一覧表が控えめ**になり、ページに主役が1つも無くなっていた。
     * 条件は、上の帯を足した条件（2台以上）と同じでなければならない。
     */
    add({ kind: "equipmentTable", width: "wide", emphasis: named.length >= 2 ? "quiet" : "normal", heading: "保有設備一覧", form: "spec" }, "全設備の一覧");
    add({ kind: "gallery", width: "full", emphasis: "normal", heading: "工場・設備" }, "設備は写真があると伝わる");
    /**
     * **厚くするとき**（短納期・設備が強みの会社）。
     * 短納期で選ばれる会社に効くのは「何があるか」より「どれだけ回せるか」なので、
     * **ロット・納期の数字**をこのページにも降ろす。
     */
    if (thick && a.figures.length) {
      add({ kind: "figures", width: "full", emphasis: "normal", heading: "対応できる条件" }, "どれだけ回せるかを数字で見せる（このページを厚くする）");
    }
  }

  /**
   * ── 加工事例の一覧 ────────────────────────────
   * **一覧はカードの格子である**、が既定。ただし格子1つだけのページにしない。
   * 難加工が強みの会社では、代表1件を工程として先に見せる（D-301）。
   */
  if (slug === "cases") {
    const caseCount = (p.cases ?? []).length;
    const showsOne = ["difficulty", "craft", "engineering"].includes(a.primaryStrength);
    if (showsOne) {
      add({ kind: "caseSteps", width: "narrow", emphasis: "lead", heading: "代表的な案件" }, "難しい仕事が強みの会社は、1件を順を追って見せたほうが伝わる");
    }
    /**
     * **事例が1件のときは、一覧を出さない**（第6.5段階）。
     *
     * 上の「代表的な案件」が、その1件を課題→対応→結果まで全部出している。
     * その下にもう一度同じ案件の一覧を置くと、**同じ言葉が2度出る。**
     * 実測：1件だけの会社で、「代表的な案件」の①に書いてある
     * 「削ると反って精度が出ない」が、すぐ下の「加工事例」にもう一度出ていた。
     * **1件の一覧は、一覧ではない。**
     */
    if (!(showsOne && caseCount <= 1)) {
    /**
     * **ここが一覧そのものである。全件が読めなければ意味がない**（第6.5段階）。
     *
     * 実測：このページに4件の事例があるのに、**画面に出ていたのは0件**だった。
     * 手順書の1番目（`process`）を上の「代表的な案件」が使い、
     * 一覧の帯が2番目の `quote`（1発言）に落ちていた。
     * しかもこのページでは「すべて見る」の導線も出ない作りなので、
     * **残り3件に到達する道が1つも無かった。**
     */
    add({ kind: "cases", width: "wide", emphasis: "normal", keepAll: true, heading: isGeneral ? "実績" : "加工事例" }, "一覧");
    }
    add({ kind: "gallery", width: "full", emphasis: "quiet", heading: "加工したもの" }, "加工品の写真がいちばん問い合わせに繋がる");
    /**
     * **厚くするとき**（難加工・設計・職人・実績が強みの会社）。
     * 一覧を見たあとに残る問いは「なぜ受けられるのか」である。
     */
    if (thick && has(st.followUpFindings)) {
      add({ kind: "technique", width: "narrow", emphasis: "normal", heading: "どうやって受けているか" }, "事例を読んだあとの「なぜ受けられるのか」（このページを厚くする）");
    }
  }

  /**
   * ── 加工事例の個別ページ ──────────────────────
   * **最も読まれ、最も問い合わせに繋がる**（`pages/cases/[n].astro` の注記）。
   * それなのに、ここは長いあいだ帯が1本も無かった。
   *
   * 渡ってくる `project` は**この1件だけに絞ったもの**なので、
   * 材料の数え方（`materialsOf`）はそのまま使える。
   */
  if (slug === "case") {
    /**
     * **見出しと中身がずれないように、材料をここで見る**（D-302）。
     *
     * 帯を無条件に足して `repress` の落とし先に任せると、
     * **「この案件の条件」という見出しの下に工程が出る**、
     * **「ご相談から結果まで」の下にカードが1枚出る**、ということが起きた（実測）。
     * 見出しは我々が書いているので、**中身が決まってから足す。**
     */
    const mc = materialsOf(project, "cases", a.hasRealPhotos);
    const mm = materialsOf(project, "materials", a.hasRealPhotos);
    if ((mc.rows ?? 0) >= 1) {
      add({ kind: "caseSpec", width: "wide", emphasis: "normal", heading: "この案件について", form: "spec" }, "調達担当者が最初に見るもの");
    }
    add({ kind: "gallery", width: "full", emphasis: "normal", heading: "加工したもの" }, "加工品の写真");
    /**
     * **原稿があるときは、工程の帯を出さない。**
     * 原稿はこの事例の話そのものなので、両方出すと同じ内容が2度並ぶ。
     * 原稿が無い案件（第1回取材まで）では、ここが本文になる。
     */
    if (!hasProse && (mc.steps ?? 0) >= 2) {
      add({ kind: "caseSteps", width: "narrow", emphasis: "lead", heading: "ご相談から結果まで", form: "process" }, "事例の説得力は、順を追って読めるかで決まる");
    }
    /** 札は2つ以上そろってはじめて札になる。1つだけなら条件の表の中で足りている */
    if (mm.count >= 2) {
      add({ kind: "caseTags", width: "wide", emphasis: "quiet", heading: "材質・加工法" }, "検索される語そのもの");
    }
  }

  if (slug === "company") {
    add({ kind: "gallery", width: "full", emphasis: "normal", heading: "外観" }, "どこにある会社かが分かる");
    add({ kind: "profileTable", width: "wide", emphasis: "lead", heading: "会社概要", form: "spec" }, "発注前に確かめる欄");
    /**
     * **沿革は、聞き取った行を全部出す**（D-204・D-302）。
     *
     * 形を強みで選ばせていたため、沿革が2件の会社で「年表」の材料が足りず、
     * **「沿革」という見出しの下に「創業 1972年」の1行だけが出て、
     * 聞き取った出来事が丸ごと消えていた**（実測・松原精機）。
     * 3件以上なら年表、2件なら箇条書き。**どちらでも全行が出る。**
     */
    const mh = materialsOf(project, "history", a.hasRealPhotos);
    if (mh.count >= 2) {
      add({ kind: "timeline", width: "narrow", emphasis: "normal", heading: "沿革", form: mh.count >= 3 ? "timeline" : "list" }, "続いていることが信用になる");
    }
  }

  /**
   * ── 代表挨拶 ──────────────────────────────────
   *
   * **このページの中身は、聞き取った2つの欄しかない。**
   * だから原稿があるときは、原稿がその2つを書き直したものである。
   * 両方を出すと、**同じ話が3回並ぶ**（実測・デモ案件で確認）。
   *
   * 強み・対応可能範囲のページは事情が違う。あちらは帯ごとに別の材料があり、
   * 原稿は「すでに画面に出ているもの」を知ったうえで書かれる（D-193）。
   */
  if (slug === "message") {
    if (!hasProse) {
      add({ kind: "people", width: "narrow", emphasis: "lead", heading: "これからの5年" }, "代表の言葉が、この会社の人柄になる");
      /** **聞き取った文章をそのまま読ませる。** 引用に畳むと、前後の説明が落ちる（D-204） */
      if (has(p.executive?.messageToStaff)) {
        add({ kind: "executiveVoice", width: "narrow", emphasis: "normal", heading: "社員に伝えたいこと", form: "longform" }, "社内に向けた言葉は、社外にいちばんよく届く");
      }
    }
    /** 実写が届けば、ここが山になる（`image` の山） */
    add({ kind: "gallery", width: "normal", emphasis: "normal", heading: "代表者" }, "顔が見えると信用が変わる");
  }

  if (slug === "recruit") {
    /**
     * **聞けていない帯は出さない**（D-302）。
     *
     * 募集要項を無条件に足していたため、労働条件が1つも聞けていない案件で
     * **「募集要項」という見出しの下が空**になった（実測）。
     * 空欄の並んだ表より不信を招く。聞けるまでは、見出しごと出さない。
     */
    const mr = materialsOf(project, "recruit", a.hasRealPhotos);
    const r = p.recruitment ?? {};
    const heads = [
      (r.neededRoles ?? []).length ? "募集している職種" : "",
      (r.workplaceAppeal ?? []).length ? "職場について" : "",
    ].filter(Boolean);
    /** 代表挨拶と同じ理由で、原稿があるときは聞き取った欄をそのまま出さない */
    if (heads.length && !hasProse) {
      add({ kind: "recruitPoints", width: "narrow", emphasis: "lead", heading: heads.join("・") }, "何をする仕事かが先");
    }
    if ((mr.rows ?? 0) >= 1) {
      add({ kind: "recruitTerms", width: "wide", emphasis: "normal", heading: "募集要項", form: "spec" }, "条件の書いていない求人は応募されない（D-171）");
    }
    add({ kind: "gallery", width: "full", emphasis: "quiet", heading: "働く人" }, "働いている人が見えると応募が変わる");
  }

  if (slug === "contact") {
    /** **用紙の前に、相談してよい理由を置く。** 用紙だけのページは送信されない */
    if (has(st.wonAfterOthersDeclined) || isGeneral) {
      add({ kind: "declined", width: "narrow", emphasis: "lead", heading: "他社様で難しいと言われた案件" }, "相談してよい理由を、用紙の前に置く");
    }
    /**
     * **見出しと中身がずれないように、両方とも形を決めておく**（D-302）。
     *
     * 形を決めずに並べたところ、`repress` が「同じ内容を同じ形で2度出さない」規則に従って
     * 2つの帯の形を入れ替え、**「ご連絡先」の下に用紙が、「フォームでのお問い合わせ」の下に
     * 電話番号の表が出た**（実測）。見出しは我々が書いているので、形も我々が決める。
     */
    add({ kind: "inquiryContact", width: "wide", emphasis: "normal", heading: "ご連絡先", form: "list" }, "電話とメールは必ず出す（D-060）。用紙が止まっても問い合わせが絶えないように");
    /** **書くことが分かってから、用紙に入る。** 先に用紙を出すと、空欄を見ることになる */
    add({ kind: "inquiry", width: "normal", emphasis: "normal", heading: "フォームでのお問い合わせ", form: "prose" }, "用紙");
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
  offerings: "取り扱い・サービスの名前と内容と料金を、聞き取ったまま",
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
  caseSpec: "この事例の材質・数量・納期・加工法・他社様がお断りになった理由",
  caseSteps: "この事例の ご相談の内容 → 対応した内容 → 結果",
  caseTags: "この事例の材質・加工法を、ひとつずつ札にして",
  profileTable: "会社名・代表者・創業・資本金・従業員数・所在地・連絡先・事業内容",
  recruitTerms: "募集要項（雇用形態・給与・勤務時間・休日・手当・保険・応募資格・選考）",
  recruitPoints: "募集している職種・職場について",
  executiveVoice: "社員に伝えたいこと（聞き取った文章そのまま）",
  inquiryContact: "電話・メールアドレス・所在地・稼働体制",
  inquiry: "ご相談の際にお知らせいただきたいことと、お問い合わせの用紙",
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
  offerings: { content: "offerings", presentation: "cardGrid" },
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
  caseSpec: { content: "cases", presentation: "spec" },
  caseSteps: { content: "cases", presentation: "process" },
  caseTags: { content: "materials", presentation: "chips" },
  profileTable: { content: "profile", presentation: "spec" },
  recruitTerms: { content: "recruit", presentation: "spec" },
  recruitPoints: { content: "recruit", presentation: "list" },
  executiveVoice: { content: "executive", presentation: "longform" },
  inquiryContact: { content: "inquiry", presentation: "list" },
  inquiry: { content: "inquiry", presentation: "prose" },
  prose: { content: "draft", presentation: "prose" },
};

export const asContentPresentation = (kind: Section["kind"]) => KIND_AS[kind];
