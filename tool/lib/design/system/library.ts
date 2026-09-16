/**
 * KOBO — 素材ライブラリ（Asset Library）
 *
 * **ここは「写真を増やすための素材置き場」ではない**（ご指示・docs/31 原則①）。
 *
 * 素材ライブラリを持つと、たいてい**「素材があるから使う」が始まる。**
 * 一度それが始まると、ページは「素材を並べる場所」になり、
 * **写真が無い会社ほど、借り物で埋まったページになる。** いちばん避けたい結果である。
 *
 * だからこの層は、**使える条件を狭くすることだけを仕事にする。**
 * 登録した素材が1枚も使われないページがあるのは、失敗ではなく**設計どおり**である。
 *
 * 【`evidence` に絶対に届かない】
 * `source` と `intent` を**リテラル型で固定**してある。
 * `LibraryAsset` は `intent: "atmosphere"` 以外を取れないので、
 * **「ライブラリ画像を実績写真として出す」コードは、書こうとしても型が通らない。**
 * 注意書きではなく構造で止める（D-206と同じ思想）。
 *
 * 【`generated` への道は作らない】
 * 語彙（`asset.ts`）には `generated` があるが、**そこへ値を入れる関数はどこにも無い。**
 * このファイルも作らない。`asset.test.mjs` が「生成画像に到達する経路が無いこと」を見張る。
 *
 * 【`none` はいつでも選べる】
 * `findLibraryAsset` は**見つからなければ `undefined` を返すだけ**で、
 * 代わりを探しにいかない。候補が無い＝`none` のまま成立する、が既定の動きである。
 */

import type { AssetRole, AssetSubject } from "./asset.ts";

/**
 * **ライブラリに登録してよい主題。**
 *
 * ここが、この仕組みでいちばん重要な1行である。
 *
 * ご指示の例には「工場らしい質感」「金属の質感」なども挙がっていたが、
 * **加工品・設備・外観・人・働く現場・商品を、ライブラリから出すことはしない。**
 * それらは**その会社の実物として読まれる主題**であり、
 * どれだけ「イメージです」と書いても、**画面ではお客様の証拠として働いてしまう。**
 * ご指示の原則③④（顧客の証拠は顧客の実写だけ・会社の事実の裏づけにライブラリを使わない）を
 * 守り切るには、**そもそも登録できないようにするしかない。**
 *
 * 残るのは `texture` ひとつ。
 * `light` と `geometry` は**CSSがすでに描けている**ので、ライブラリに来る理由が無い
 * （「graphic で満たせるなら library に行かない」）。
 * `grid` と `dimension` は地紋として既にある。
 * **CSSの繰り返しでは作れないのは、紙や布の「不規則な目」だけ**である。
 */
export const LIBRARY_SUBJECTS = ["texture"] as const;
export type LibrarySubject = (typeof LIBRARY_SUBJECTS)[number];

/**
 * 権利。**ここが埋まっていない素材は、本番の素材として扱わない**（ご指示）。
 *
 * `checked` は「誰が・いつ確かめたか」。
 * **空文字を許さない検査を、読み込み時に走らせる**（`assertLibrary`）ので、
 * 「あとで確認する」は登録の時点で通らない。
 */
export interface LibraryLicense {
  /** 権利者 */
  holder: string;
  /** 利用条件。商用可・改変可・クレジット要否まで、**言葉で書く** */
  terms: string;
  /** どこから来たか */
  origin: string;
  /** 誰がいつ確かめたか */
  checked: string;
}

/** 使い方。**metadata が採用条件を持つ**ので、判断する側はここを読む */
export interface LibraryUsage {
  /** 敷き方。**地の層だけ。`<img>` にはしない**（＝証拠として読まれる余地を作らない） */
  as: "background";
  /** 1ページに何枚まで。**1より大きい値は検査で弾く** */
  maxPerPage: 1;
  /** 敷いてよい面。白抜きの地（accent / dark）は含めない */
  surfaces: string[];
}

export interface LibraryAsset {
  id: string;
  /** **リテラル固定。** ここを広げない限り、ライブラリ以外の出所にはならない */
  source: "library";
  /** **リテラル固定。** 証拠には型として届かない */
  intent: "atmosphere";
  role: AssetRole;
  subject: LibrarySubject;
  /**
   * どの型（Direction）で使ってよいか。
   * **「どの型でも使える」は書けない。** 空配列は「どこでも使わない」と読む。
   * 素材の側から用途を広げられないようにするため、既定を持たせない。
   */
  directions: string[];
  license: LibraryLicense;
  usage: LibraryUsage;
  /** 書き出されたサイトから見た場所（`site-template/public/` の下） */
  path: string;
  /** 人が読む注記。**何を写していないか**を書く */
  note: string;
}

/**
 * **最小セット。**
 *
 * 4枚しかない。増やすことを目的にしない（ご指示・原則①）。
 * どれも**KOBOが作ったもの**なので、権利の確認が要らず、
 * **会社の物も人も写っていない**ので、お客様の実績と取り違えられない。
 *
 * 【2枚から4枚にした理由】（第8段階②）
 * 実測すると、**紙の目1枚を4つの型で共有**していた（product / classic / editorial / luxury）。
 * 型ごとに色も書体も余白も変えているのに、**地の目だけが全部同じ**になる。
 * 足したのは2枚だけで、**主題は `texture` のまま**（新しい subject も面も地紋も作っていない）。
 *
 *   紙 paper-grain　　… 読み物（editorial）
 *   布 linen-grain　　… 老舗・職人（craft）
 *   木 wood-grain　　 … 落ち着き・信頼（classic）
 *   金属 metal-hairline… 静か・上質（luxury）／製品・開発（product）
 *
 * **4枚とも、並べて撮って目で確かめてある。** 向きと細かさが違うので、
 * 拡大しなくても別のものとして読める（横の繊維／縦のうねり／規則的な筋／均一な粒）。
 */
export const LIBRARY: LibraryAsset[] = [
  {
    id: "paper-grain",
    source: "library",
    intent: "atmosphere",
    role: "background",
    subject: "texture",
    /**
     * **読み物の型だけ。** 文章が主役のページの地は、紙でよい。
     *
     * ここが「graphic で満たせるなら library に行かない」の、表の側の現れである。
     * 型が `texture` を挙げていても、**帯の地そのものが紙（`surface="paper"`）**なら
     * すでにCSSが目を出しているので、ここまで降りてこない（足すと二重になる）。
     * 降りてくるのは、**構成が紙の地を使わない型**だけである。
     */
    directions: ["editorial"],
    license: {
      holder: "KOBO",
      terms: "自社制作・自社保有。商用可・改変可・クレジット不要",
      origin: "KOBO内製（SVG・feTurbulence）",
      checked: "2026-09-15 社長",
    },
    usage: { as: "background", maxPerPage: 1, surfaces: ["plain", "soft"] },
    path: "/library/paper-grain.svg",
    note: "紙の目。会社の物・人・製品は写っていない",
  },
  {
    id: "linen-grain",
    source: "library",
    intent: "atmosphere",
    role: "background",
    subject: "texture",
    /** 手仕事の型だけ。紙より粗く、温度がある */
    directions: ["craft"],
    license: {
      holder: "KOBO",
      terms: "自社制作・自社保有。商用可・改変可・クレジット不要",
      origin: "KOBO内製（SVG）",
      checked: "2026-09-15 社長",
    },
    usage: { as: "background", maxPerPage: 1, surfaces: ["plain", "soft"] },
    path: "/library/linen-grain.svg",
    note: "布の目。会社の物・人・製品は写っていない",
  },
  {
    id: "wood-grain",
    source: "library",
    intent: "atmosphere",
    role: "background",
    subject: "texture",
    /**
     * 落ち着き・信頼の型だけ。**縦に流れる**ので、横に流れる布とは向きで見分けられる。
     * 木そのもの（板・什器）を描いているのではない。**目だけ**である。
     */
    directions: ["classic"],
    license: {
      holder: "KOBO",
      terms: "自社制作・自社保有。商用可・改変可・クレジット不要",
      origin: "KOBO内製（SVG・feTurbulence）",
      checked: "2026-09-16 社長",
    },
    usage: { as: "background", maxPerPage: 1, surfaces: ["plain", "soft"] },
    path: "/library/wood-grain.svg",
    note: "木の目。会社の物・人・製品は写っていない",
  },
  {
    id: "metal-hairline",
    source: "library",
    intent: "atmosphere",
    role: "background",
    subject: "texture",
    /**
     * 静か・上質（luxury）と、製品・開発（product）。
     * どちらも**構成が紙の地を使わない**型で、かつ紙の目では硬さが出ない。
     * **仕上げの筋**であって、金属板や製品を写したものではない。
     */
    directions: ["luxury", "product"],
    license: {
      holder: "KOBO",
      terms: "自社制作・自社保有。商用可・改変可・クレジット不要",
      origin: "KOBO内製（SVG・矩形の繰り返し）",
      checked: "2026-09-16 社長",
    },
    usage: { as: "background", maxPerPage: 1, surfaces: ["plain", "soft"] },
    path: "/library/metal-hairline.svg",
    note: "金属の仕上げの筋。会社の物・人・製品は写っていない",
  },
];

/**
 * **登録の時点で弾く。**
 *
 * 表を持っているだけでは守られない（`canUse` を書いた側でも確かめているのと同じ理屈）。
 * 読み込んだ瞬間に走るので、**条件を満たさない素材を足すと、サイトが書き出せない。**
 */
export function assertLibrary(list: LibraryAsset[] = LIBRARY): void {
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.id)) throw new Error(`Library: id が重複しています（${x.id}）`);
    seen.add(x.id);
    if (!(LIBRARY_SUBJECTS as readonly string[]).includes(x.subject)) {
      throw new Error(`Library: ${x.subject} は登録できません（${x.id}）`);
    }
    if (x.source !== "library" || x.intent !== "atmosphere") {
      throw new Error(`Library: 出所と意図は固定です（${x.id}）`);
    }
    /** **権利が空の素材を本番に置かない**（ご指示） */
    for (const k of ["holder", "terms", "origin", "checked"] as const) {
      if (!x.license[k]?.trim()) throw new Error(`Library: license.${k} が空です（${x.id}）`);
    }
    if (x.usage.as !== "background") throw new Error(`Library: 地の層以外には使いません（${x.id}）`);
    if (x.usage.maxPerPage !== 1) throw new Error(`Library: 1ページ1枚までです（${x.id}）`);
    if (!x.usage.surfaces.length) throw new Error(`Library: 敷ける面がありません（${x.id}）`);
    /** 白抜きの地に敷くと、文字のコントラストが落ちる（D-310の教訓） */
    for (const s of x.usage.surfaces) {
      if (s === "accent" || s === "dark") throw new Error(`Library: 白抜きの地には敷きません（${x.id}）`);
    }
    if (!x.path.startsWith("/library/")) throw new Error(`Library: path が /library/ の下にありません（${x.id}）`);
  }
}
assertLibrary();

/**
 * **その主題・その型で使ってよい素材を1つ返す。無ければ `undefined`。**
 *
 * **代わりを探さない。** 主題が合わなければ、型が合わなければ、そこで終わりで、
 * 呼ぶ側は `none` のまま進む。これが「`none` をいつでも選べる仕組み」の実体である。
 */
export function findLibraryAsset(subject: AssetSubject, direction: string): LibraryAsset | undefined {
  if (!(LIBRARY_SUBJECTS as readonly string[]).includes(subject)) return undefined;
  return LIBRARY.find((x) => x.subject === subject && x.directions.includes(direction));
}

/** 使う側が持つ、素材への参照。**metadata 全部ではなく、描くのに要る2つだけ** */
export interface LibraryRef {
  id: string;
  path: string;
}
