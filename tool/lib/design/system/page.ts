/**
 * KOBO — ページの語彙（Page）
 *
 * **サイトにどのページがあり、それぞれが読む人に何を渡すか。**
 *
 * 【なぜ語彙を作るか】
 * ページの集合は、これまで**3箇所に手書き**されていた
 * （`site-template/src/lib/site.ts` のメニュー／各 `.astro` の `getStaticPaths`／
 * `assets.ts` の写真依頼）。**書き写した表は、必ずいつかずれる**（D-197）ので、
 * 試験で突き合わせて凌いでいた。ここを単一の正にする。
 *
 * 【役割で並べる】
 * 「どの順に読ませるか」を、ページ名ではなく**役割**で決める。
 * ページ名で順番を書くと、ページを1枚足すたびに15通りの表を直すことになる。
 * 役割は6つしかないので、勝ち筋ごとの表が**6個の並べ替え**で済む。
 *
 * 【コアページは落ちない】
 * 会社の実在確認・連絡先・検索の本体は、**どんな勝ち筋でも落とさない**（ご指示）。
 * これは注意書きではなく、`CORE` に入っているページは
 * `composeSite` が**候補から外す経路そのものを持たない**ことで守る。
 */

/** サイトに存在しうるページ。**ここに無いページは作れない** */
export type PageId =
  | "index"
  | "capability"  // 対応可能範囲（製造業）
  | "equipment"   // 設備一覧（製造業）
  | "services"    // サービス・料金（汎用）
  | "strengths"   // 強み・技術 ／ 選ばれている理由
  | "cases"       // 加工事例の一覧 ／ 実績
  | "case"        // 事例の個別ページ（製造業のみ・件数ぶん）
  | "company"
  | "message"     // 代表挨拶
  | "recruit"
  | "contact";

/**
 * そのページが読む人に何を渡すか。**順序を決める軸はこれだけ。**
 *
 * 「メニューの何番目か」ではなく「何を渡す場面か」で持つ。
 * 勝ち筋ごとの違いは、**この6つの並べ替え**として表す。
 */
export type PageRole =
  | "entry"    // 入口。何の会社か
  | "capacity" // 受けられるか（条件・設備・取り扱い）
  | "proof"    // 受けられる証拠（事例・技術・お客様の言葉）
  | "trust"    // 会社そのものの信用（所在・沿革）
  | "people"   // 人（代表）
  /**
   * 求職者向け（採用情報）。
   *
   * **読む人が違うので、役割を分ける。**
   * 代表挨拶と同じ「人」の群に入れていたため、職人・人で選ばれる会社の並べ替えで
   * **採用情報が加工事例より前に出る**という、顧客にとって意味のない導線ができていた。
   */
  | "hiring"
  | "action";  // 行動（問い合わせ）

export const ROLE_OF: Record<PageId, PageRole> = {
  index: "entry",
  capability: "capacity",
  equipment: "capacity",
  services: "capacity",
  strengths: "proof",
  cases: "proof",
  case: "proof",
  company: "trust",
  /** **代表挨拶は「人」である。** 会社の信用（所在・沿革）とは別の渡し方をする */
  message: "people",
  recruit: "hiring",
  contact: "action",
};

/**
 * **既定の並び。**
 *
 * 会社の見立てに根拠が無いとき（`unknown`）は、**この並びのまま**にする（D-205）。
 * 推測で並べ替えない。
 *
 * **`entry` は必ず先頭、`action` は必ず末尾。** どの勝ち筋でも動かさない。
 * 入口と問い合わせの位置が会社ごとに変わると、**使い方そのものが分からなくなる。**
 */
export const ROLES: PageRole[] = ["entry", "capacity", "proof", "trust", "people", "hiring", "action"];

export const DEFAULT_ROLE_ORDER: PageRole[] = ["entry", "capacity", "proof", "trust", "people", "hiring", "action"];

/**
 * 同じ役割の中での並び。**役割を並べ替えても、中の順は動かさない。**
 * 「対応可能範囲 → 設備一覧」は、どの会社でもこの順で読むほうが分かる。
 */
export const WITHIN_ROLE: PageId[] = [
  "index",
  "capability", "equipment", "services",
  "strengths", "cases", "case",
  "company",
  "message", "recruit",
  "contact",
];

/**
 * **落とさないページ**（ご指示）。
 *
 *   index    …… 入口が無いサイトは無い
 *   company  …… 実在する会社かどうかを確かめる場所
 *   contact  …… 連絡先。**商品として成立しなくなる**
 *   capability / equipment（製造業）
 *            …… **検索の本体。** 材質・加工法・メーカー・型番が、そのまま検索語になる
 *
 * 汎用（198,000円）には対応可能範囲も設備一覧も無いので、コアは3枚である。
 */
export const CORE: Record<"manufacturing" | "general", PageId[]> = {
  manufacturing: ["index", "company", "contact", "capability", "equipment"],
  general: ["index", "company", "contact"],
};

export const isCore = (id: PageId, formSet: "manufacturing" | "general"): boolean =>
  CORE[formSet].includes(id);

/** URL。**勝ち筋で変えない**（変えると再生成のたびに検索順位が動く） */
export const HREF_OF: Record<PageId, string> = {
  index: "/",
  capability: "/capability/",
  equipment: "/equipment/",
  services: "/services/",
  strengths: "/strengths/",
  cases: "/cases/",
  case: "/cases/", // 実際は /cases/<n>/。件数ぶん作るので composeSite が組み立てる
  company: "/company/",
  message: "/message/",
  recruit: "/recruit/",
  contact: "/contact/",
};

/**
 * メニューに出す言葉。**商品で変わる**（D-276）。
 * 水まわりの会社に「加工事例」と出さない。
 */
export const LABEL_OF: Record<PageId, string | { manufacturing: string; general: string }> = {
  index: "トップ",
  capability: "対応可能範囲",
  equipment: "設備一覧",
  services: "サービス・料金",
  strengths: { manufacturing: "強み・技術", general: "選ばれている理由" },
  cases: { manufacturing: "加工事例", general: "実績" },
  case: { manufacturing: "加工事例", general: "実績" },
  company: "会社概要",
  message: "代表挨拶",
  recruit: "採用情報",
  contact: "お問い合わせ",
};

export const labelOf = (id: PageId, formSet: "manufacturing" | "general"): string => {
  const v = LABEL_OF[id];
  return typeof v === "string" ? v : v[formSet];
};
