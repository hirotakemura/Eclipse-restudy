/**
 * KOBO — 素材の判断（Asset Direction）
 *
 *   何を・どの順で（composeTop / composePage）
 *     ↓
 *   画面のリズム（composeVisual）　山・余白・組み方・文字の段
 *     ↓
 *   **この層**　　　　　　　　　　その構成に、何の素材が要るか
 *     ↓
 *   Astro
 *
 * 【目的】
 * **「その構成を成立させるために、どの素材が必要かを判断する」**（docs/31 §0）。
 * **「画像を増やしてページを豪華にする」ことではない。**
 *
 * 【`brief` を引数に取らない】
 * これが設計上いちばん重要な一行である（D-304）。
 * AI Brief はまだ確定しておらず、当面は使わないと決めている（D-266）。
 * **引数に無ければ、AI Brief がこの先どう確定しても、この層は影響を受けない。**
 * 境界を言葉で定義するのではなく、**依存を書かないこと**で守る。
 *
 * 【composeVisual のあとに置く理由】
 * 素材の必要性は**帯1本では決まらない。**
 * 「ここに写真が要る」は、山がどこか・余白をどこで取るかが決まって初めて言える。
 * ページ全体を見ている関数は `composeVisual` だけである。
 *
 * 【第2段階でやったこと】
 * `softLight`（淡い光）と `geometry`（幾何の線）の2つだけを描けるようにした。
 * **装飾のために全帯へ付けない。1ページに light 1本・geometry 1本まで。**
 * `none` は完成形であって、埋めるべき穴ではない（docs/31 原則①）。
 *
 * **範囲は汎用プランに限る**（ご指示）。
 * 製造業には寸法線・方眼・工程線・断面・素材の目が既にあり、
 * **汎用にはほぼ何も無い**——それが実測で出た差である（docs/31 §1-2）。
 * ここは設計上の原則ではなく、第2段階の範囲の線引きなので、
 * 画面を見たうえで広げるかどうかを決める。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import { getDirection } from "./direction.ts";
import type { VisualSection } from "./visual.ts";
import {
  DRAWABLE, EVIDENTIAL, SUBJECT_OF, canUse,
  type Asset, type AssetSource, type AssetRole, type AssetSubject, type PhotoCategoryId,
} from "./system/index.ts";

export type AssetSection = VisualSection & { asset: Asset };

/**
 * **証拠が要る帯は、どの置き場所の写真を要るか。**
 *
 * `photos` の帯だけはページによって変わる（会社概要は外観、代表挨拶は代表者）。
 * `Present.astro` が同じ対応で写真を選んでいる。
 * **2箇所に同じ表があるので、`asset.test.mjs` が突き合わせている**（D-197・D-299と同じ形）。
 */
export const PHOTO_OF_PAGE: Record<string, PhotoCategoryId> = {
  cases: "加工事例",
  case: "加工事例",
  company: "外観",
  message: "代表者",
  recruit: "働く人",
};
const photoCategoryOf = (page: string): PhotoCategoryId => PHOTO_OF_PAGE[page] ?? "工場・設備";

/** その内容が証拠として要る写真の置き場所 */
export function categoryFor(content: string, page: string): PhotoCategoryId {
  switch (content) {
    case "cases": return "加工事例";
    case "equipment": return "工場・設備";
    case "profile": return "外観";
    case "executive": return "代表者";
    case "recruit": return "働く人";
    case "photos": return photoCategoryOf(page);
    default: return "その他";
  }
}

/**
 * 置き場所ごとの、素材の主題。
 *
 * **証拠の主題は、置き場所から決まる。** 内容から決めると、
 * `photos` の帯がどのページでも「設備」になる（実測でそうなっていた）。
 * 会社概要は外観、代表挨拶は代表者、採用は働く人である。
 */
export const SUBJECT_OF_CATEGORY: Record<PhotoCategoryId, AssetSubject> = {
  加工事例: "workpiece",
  "工場・設備": "facility",
  外観: "exterior",
  代表者: "person",
  働く人: "workplace",
  ロゴ: "geometry",
  その他: "light",
};

/**
 * **いま何枚あって、何件に対して足りないのか**（第3段階）。
 *
 * 理由の文に混ぜて出す。`wanted` が持つのは `category` / `why` / `priority` の3つまで
 * （ご指示4）なので、**数は別の欄にせず、人が読む理由の中に入れる。**
 */
function reasonFor(category: PhotoCategoryId, project: Project): string {
  const base = WHY[category] ?? WHY["その他"]!;
  const p = project as any;
  const have = realPhotosOf(project, category);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  /** 何件に対しての写真か。**件数の分かるものだけ**添える */
  const need =
    category === "加工事例" ? arr(p.cases).length
    : category === "工場・設備" ? arr(p.capability?.equipment).length
    : 0;
  if (have === 0 && need > 1) return `${base}（${need}件のうち、まだ1枚も届いていません）`;
  if (have > 0 && need > have) return `${base}（${need}件のうち ${have}枚）`;
  return base;
}

/**
 * **どの写真から先にお願いするか**（第3段階・ご指示「どの情報を証拠化すると効果が高いか」）。
 *
 * 置き場所ごとの重みは**思いつきで決めない。** `analysis.ts` が写真の見立てに使っている
 * 点数をそのまま使う——**同じことを2箇所で決めないため**（D-197）。
 *
 *   `score: (工場・設備 ? 2 : 0) + (外観 ? 1 : 0) + (加工事例 ? 2 : 0)`
 *
 * 2点のもの（加工品・設備）が `high`、1点のもの（外観）が `medium`。
 * 見立てに入っていない代表者・働く人は、**証拠として要るが順位は下**なので `medium`。
 *
 * そのうえで、帯の置かれ方で一段動かす。
 * **山になる帯の写真はいちばん効き、控えめに置くと決めた帯の写真は後回しでよい。**
 */
const BASE_PRIORITY: Record<PhotoCategoryId, number> = {
  加工事例: 3, "工場・設備": 3, 外観: 2, 代表者: 2, 働く人: 2, ロゴ: 1, その他: 1,
};
function priorityOf(category: PhotoCategoryId, sec: VisualSection, isPeak: boolean): "high" | "medium" | "low" {
  let n = BASE_PRIORITY[category] ?? 2;
  if (isPeak) n += 1;
  if (sec.emphasis === "quiet") n -= 1;
  return n >= 3 ? "high" : n === 2 ? "medium" : "low";
}

/** なぜその写真が要るのか。**お客様に依頼するときの理由になる**（第3段階で `gaps` に流す） */
const WHY: Record<string, string> = {
  加工事例: "加工したものが写っている写真が、いちばん問い合わせに繋がります",
  "工場・設備": "設備の現物は、受けられるかどうかの判断に直結します",
  外観: "どこにある会社かが分かると、初めての方の不安が減ります",
  代表者: "顔が見えると、会う前の信用が変わります",
  働く人: "働いている人が見えると、応募が変わります",
  その他: "この帯には実物の写真が要ります",
};

/**
 * **実写があるか。置き場所ごとに数える。**
 *
 * `analysis.hasRealPhotos` は案件全体で1つの真偽値なので、
 * 「代表者写真はあるが加工事例写真が無い」を区別できない。
 * ここでは置き場所ごとに見る。**仮の画像（SVG）は数えない**（D-174）。
 */
function realPhotosOf(project: Project, category: PhotoCategoryId): number {
  const photos = Array.isArray((project as any).photos) ? (project as any).photos : [];
  return photos.filter((x: any) => x?.file && !/\.svg$/i.test(String(x.file)) && x.category === category).length;
}

/**
 * **描ける主題を選ぶ。**
 *
 * 帯の内容が言っている主題（`SUBJECT_OF`）が描けるならそれを使う。
 * 描けないもの（加工品・設備・人）なら、型が持っている描ける主題に寄せる。
 * 型が何も持っていなければ、内容の主題をそのまま返す（描かないことの記録になる）。
 */
function subjectFor(content: string, direction: ReturnType<typeof getDirection>): AssetSubject {
  const natural = SUBJECT_OF[content as keyof typeof SUBJECT_OF] ?? "light";
  if (DRAWABLE.includes(natural)) return natural;
  return direction.assets.find((x) => DRAWABLE.includes(x)) ?? natural;
}

/** 地の面そのものになる主題。**帯の下地なので `background`** */
const GROUND: AssetSubject[] = ["texture", "light"];

/** いま実際に地紋が描かれている面（`site.css` の `[data-surface]`） */
const PATTERNED: Record<string, AssetSubject> = { grid: "grid", paper: "texture" };

/**
 * **すでに描かれている地紋を、素材の言葉に置き換える。**
 *
 * ここで `light` と `geometry` を返してはいけない。
 * その2つは第2段階で足した**描き方の名前**でもあるので、
 * 地紋のある帯に付けると**地紋と装飾が二重に描かれる。**
 * 表に無い組み合わせを作らないのと同じ理屈で、名前で衝突させない。
 */
const MOTIF_AS: Record<string, AssetSubject> = {
  dimension: "dimension",
  section: "dimension",
  grid: "grid",
  process: "grid",
  grain: "texture",
};

/**
 * **新しい装飾を置いてよい面**（第2段階）。
 *
 * 暗い地・アクセント地は白抜きなので、淡い光を重ねると文字が読みにくくなる。
 * 方眼と紙の地には**すでに地紋がある。** 二重に敷かない。
 */
const DECORABLE = new Set(["plain", "soft"]);
/** 白抜きの面。**幾何の線だけはこの上にも置ける**（線を白に倒してある） */
const INVERTED_SURFACES = new Set(["accent", "dark"]);

export function composeAssets(
  sections: VisualSection[],
  project: Project,
  a: Analysis,
  opts: { direction?: string; page?: string } = {},
): AssetSection[] {
  const d = getDirection(opts.direction);
  const page = opts.page ?? "index";

  const out: AssetSection[] = sections.map((sec) => {
    /** **証拠か雰囲気かは、帯の内容から機械的に決まる。** AIも人も選ばない */
    const intent = EVIDENTIAL.includes(sec.content) ? "evidence" as const : "atmosphere" as const;
    const isPeak = sec.kind !== "hero" && (sec.visual?.peak ?? "none") !== "none";

    let source: AssetSource = "none";
    let wanted: Asset["wanted"];
    /** 証拠の主題は置き場所から、雰囲気の主題は内容と型から決まる */
    let subject: AssetSubject;

    if (intent === "evidence") {
      /**
       * **証拠はお客様のものだけ。** 無ければ `none` で、代替素材では埋めない。
       * 代わりに「この写真が要る」と人に知らせる（docs/31 原則②）。
       */
      const category = categoryFor(sec.content, page);
      subject = SUBJECT_OF_CATEGORY[category];
      const have = realPhotosOf(project, category);

      /**
       * **写真を実際に描いている帯だけが、お客様の素材を名乗る**（第3段階）。
       *
       * 画面に画像を出すのは `photos` の帯だけである
       * （`CaseCard` `Equipment` `People` `Points` のどれにも `<img>` は無い）。
       * 事例の表・設備のカード・会社概要の表は、**写真ではなく事実で証拠を出す帯**で、
       * その事例の写真は**すぐ隣の `photos` の帯**が引き受けている。
       *
       * ここを「写真があるかどうか」で決めていたため、
       * **画像を1枚も描かない帯が「お客様の写真あり」と名乗っていた**（第1〜2段階）。
       * 「写真があるから使う」ではない（ご指示6）。**出している帯だけが名乗る。**
       */
      const shows = sec.content === "photos";
      if (shows && have > 0) {
        source = "customer";
      } else if (shows) {
        source = "none";
        /**
         * **依頼は、その写真を出す帯からだけ出す。**
         *
         * 事例の表からも設備のカードからも同じ置き場所を頼むと、
         * 実案件で**加工事例の依頼が15本**立った（第1段階の実測）。
         * 同じ「加工品の写真をください」が15回並ぶのは、人に渡す紙として役に立たない。
         * **出す場所ごとに1本**にすれば、事例ページ4枚なら4本＝どの事例が欠けているかが分かる。
         */
        wanted = { category, why: reasonFor(category, project), priority: priorityOf(category, sec, isPeak) };
      } else {
        /** 写真を出さない帯。**証拠であることは変わらないが、素材は持たない** */
        source = "none";
      }
    } else {
      /**
       * 雰囲気。**まず、いま実際に描かれているものを記録する。**
       * 新しい装飾（第2段階）は、そのあとで、描かれていない帯にだけ置く。
       */
      const drawn = MOTIF_AS[sec.motif] ?? PATTERNED[sec.surface];
      if (drawn) { source = "graphic"; subject = drawn; }
      else { source = "none"; subject = subjectFor(sec.content, d); }
    }

    /**
     * 画面の中での働き。**山（`Visual.peak`）とは別物**（D-305）。
     * 山の帯の素材は `lead`、地になる素材は `background`、
     * 控えめに置くと決めた帯は `decoration`、それ以外は `support`。
     */
    const role: AssetRole =
      isPeak ? "lead"
      : source === "graphic" && GROUND.includes(subject) ? "background"
      : sec.emphasis === "quiet" ? "decoration"
      : "support";

    const asset: Asset = { source, intent, role, subject, ...(wanted ? { wanted } : {}) };

    /** **可否表を、書いた側でも確かめる。** 表を持っているだけでは守られない */
    if (!canUse(intent, source)) {
      throw new Error(`Asset: ${intent} に ${source} は使えません（${sec.content}）`);
    }
    return { ...sec, asset };
  });

  return decorate(out, d);
}

/**
 * ── 淡い光と、幾何の線を置く（第2段階）──────────────
 *
 * **1ページに light 1本・geometry 1本まで。**
 * 白抜きの帯を1ページ1回に絞ったのと同じ理屈で（D-230）、
 * **二度使うと効かなくなる。** 装飾の数は品質ではない（docs/31 原則⑤）。
 *
 * 置く場所は**画面の山、無ければ最初の主役の帯**。
 * 2つ目は、1つ目から2本以上離れた帯にだけ置く。
 * **隣り合わせにすると、装飾どうしが競って、どちらも効かない。**
 */
function decorate(out: AssetSection[], d: ReturnType<typeof getDirection>): AssetSection[] {
  /** **第2段階の範囲は汎用プランに限る**（ご指示）。製造業には既に地紋がある */
  if (d.plan !== "general") return out;
  const kinds = (["light", "geometry"] as const).filter((k) => d.assets.includes(k));
  if (!kinds.length) return out;

  /**
   * 置いてよい帯か。**地紋のある帯・証拠の帯には置かない。**
   *
   * 面の条件は、装飾の種類で変わる。
   * **淡い光は、白抜きの地の上では使えない**——暗い地に明るい光を重ねると、
   * 白い文字のコントラストが落ちる。
   * **幾何の線は、白抜きの上でも使える**（線を白に倒してある・`site.css`）。
   */
  const canDecorate = (s: AssetSection, kind: AssetSubject) =>
    s.kind !== "hero"
    && s.asset.intent === "atmosphere"
    && s.asset.source === "none"
    && s.motif === "none"
    && (DECORABLE.has(s.surface) || (kind === "geometry" && INVERTED_SURFACES.has(s.surface)));

  const put = (i: number, subject: AssetSubject) => {
    out[i] = { ...out[i]!, asset: { ...out[i]!.asset, source: "graphic", subject, role: "background" } };
  };

  /**
   * 置く場所は、**山 → 主役 → それ以外**の順で探す。
   *
   * 最初に山だけを見ていたら、山の帯に地紋がある型（モダン）で
   * **1本も置かれなかった**（実測）。山が使えないときに諦めるのは、
   * 「置けるところが無い」ではなく「探していない」である。
   */
  const pick = (kind: AssetSubject, avoid: number) => {
    const ok = (s: AssetSection, i: number) => canDecorate(s, kind) && (avoid < 0 || Math.abs(i - avoid) >= 2);
    const peak = out.findIndex((s, i) => ok(s, i) && (s.visual?.peak ?? "none") !== "none");
    if (peak >= 0) return peak;
    const lead = out.findIndex((s, i) => ok(s, i) && s.emphasis === "lead");
    if (lead >= 0) return lead;
    return out.findIndex((s, i) => ok(s, i) && s.emphasis !== "quiet");
  };

  const first = pick(kinds[0]!, -1);
  if (first < 0) return out;
  put(first, kinds[0]!);

  /** **もう1種類あれば1本だけ。隣り合わせにしない**——装飾どうしが競うと、どちらも効かない */
  if (kinds.length > 1) {
    const second = pick(kinds[1]!, first);
    if (second >= 0) put(second, kinds[1]!);
  }
  return out;
}

/** この案件で、お客様にお願いすべき写真。**ページ単位の生の並び** */
export function wantedPhotos(sections: AssetSection[]): NonNullable<Asset["wanted"]>[] {
  const out: NonNullable<Asset["wanted"]>[] = [];
  for (const s of sections) if (s.asset.wanted) out.push(s.asset.wanted);
  return out;
}

const RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * **お客様にお願いする写真の一覧**（第3段階）。
 *
 * 置き場所ごとに1行にまとめ、**いちばん強い優先度**を代表にする。
 * 同じ頼みを何度も並べない——人に渡す紙として役に立たないから。
 *
 * `places` は「どのページのどこで要るか」で、**なぜ要るのかを説明するために持つ。**
 * 枚数を品質の指標にしない（docs/31 原則⑤）ので、**この数を検査に使わない。**
 */
export function photoRequests(
  all: { page: string; sections: AssetSection[] }[],
): { category: PhotoCategoryId; why: string; priority: "high" | "medium" | "low"; places: string[] }[] {
  const map = new Map<string, { category: PhotoCategoryId; why: string; priority: "high" | "medium" | "low"; places: string[] }>();
  for (const { page, sections } of all) {
    for (const s of sections) {
      const w = s.asset.wanted;
      if (!w) continue;
      const cur = map.get(w.category);
      if (!cur) { map.set(w.category, { ...w, places: [page] }); continue; }
      if (!cur.places.includes(page)) cur.places.push(page);
      if (RANK[w.priority] > RANK[cur.priority]) { cur.priority = w.priority; cur.why = w.why; }
    }
  }
  return [...map.values()].sort((a, b) => RANK[b.priority] - RANK[a.priority]);
}
