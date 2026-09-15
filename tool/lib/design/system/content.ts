/**
 * KOBO — 内容の語彙（何を伝えるか）
 *
 * **製造業では、重要な情報が共通するのは当然である**（D-204）。
 * 対応可能範囲・材質・条件・設備・加工事例・技術情報・お問い合わせは、
 * SEOと営業の両方で効く。**「他社と同じ情報だから削る」という判断はしない。**
 *
 * 差を作るのは、削ることではなく、**重要度・順番・表現・情報量・大きさ**である。
 */

export type ContentId =
  | "offerings"   // 取り扱い・サービス・料金　※汎用プランの中心
  | "conditions"  // 対応条件（ロット・納期・精度）
  | "materials"   // 対応材質・加工法
  | "equipment"   // 設備
  | "cases"       // 加工事例
  | "technique"   // 工程の工夫
  | "declined"    // 他社様が断った案件
  | "praise"      // お客様の言葉・敬遠される仕事
  | "history"     // 沿革
  | "executive"   // 代表
  | "photos"      // 写真
  | "profile"     // 会社概要（発注前に確かめる欄）
  | "recruit"     // 採用（募集要項・職種・職場）
  | "inquiry"     // お問い合わせ（用紙と連絡先）
  | "draft";      // 生成した原稿

export interface Content {
  id: ContentId;
  label: string;
  /** 製造業のSEO・営業で重要な情報か。**共通して出てよい**（D-204） */
  core: boolean;
}

export const CONTENTS: Content[] = [
  /**
   * **汎用プランの中心**（D-272）。
   *
   * 「何を・いくらで」は、汎用プランの商品価値そのものである。
   * ところが実測では、これが `pages/index.astro` に直接書かれており、
   * **可否表も材料条件も Brief も通っていなかった**（docs/30）。
   * 幅も強さも固定で、`/services/` ページには帯（`.band`）が1つも無かった。
   * **構成システムの外にあるものは、構成できない。** だから語彙に入れる。
   */
  { id: "offerings", label: "取り扱い・サービス", core: true },
  { id: "conditions", label: "対応条件", core: true },
  { id: "materials", label: "対応材質・加工法", core: true },
  { id: "equipment", label: "設備", core: true },
  { id: "cases", label: "加工事例", core: true },
  { id: "technique", label: "技術情報", core: true },
  { id: "declined", label: "他社様が断った案件", core: false },
  { id: "praise", label: "お客様の言葉", core: false },
  { id: "history", label: "沿革", core: false },
  { id: "executive", label: "代表", core: false },
  { id: "photos", label: "写真", core: false },
  /**
   * **会社概要・採用・お問い合わせを、語彙に入れる**（D-301）。
   *
   * この3つは長いあいだ `pages/` に直接書かれており、
   * **可否表も材料条件も、山も余白も通っていなかった。**
   * 実測：帯のあるページは見出しの段が3〜6段、この3つは2段で固定。
   * 「構成システムの外にあるものは、構成できない」（D-272 と同じ理由）。
   *
   * `core: false` にしてあるのは、**SEOの本体ではない**からで、
   * 出さないという意味ではない。会社概要は発注前に必ず見られる。
   */
  { id: "profile", label: "会社概要", core: false },
  { id: "recruit", label: "採用", core: false },
  { id: "inquiry", label: "お問い合わせ", core: false },
  { id: "draft", label: "原稿", core: false },
];

export const getContent = (id: string | undefined): Content =>
  CONTENTS.find((c) => c.id === id) ?? CONTENTS[0]!;
