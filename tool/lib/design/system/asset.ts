/**
 * KOBO — 素材の語彙（Asset）
 *
 * **この層の目的は、「その構成を成立させるために、どの素材が必要かを判断すること」である。**
 * **「画像を増やしてページを豪華にすること」ではない**（docs/31 §0・D-306）。
 *
 * 【`none` は失敗ではない】
 * 素材を置かないことは、**正当な完成形の選択肢**である。
 * 「決まらなかった」ではなく「要らないと決めた」を表す値として扱う。
 * Typography・余白・面・Graphic だけで成立するなら `none` を選ぶ。
 * **穴を埋めるために素材を探しにいかない。**
 *
 * 【証拠と雰囲気を、型で分ける】
 * 生成画像を実績写真として使わない、を**注意ではなく構造で守る**（D-206と同じ思想）。
 * `evidence` に使えるのは `customer` と `none` だけで、
 * **顧客写真が無いときの正解は「置かない＋依頼する」であって、代替素材ではない。**
 *
 * 【山とは別物】
 * 画面の山（`Visual.peak`）は素材を要らない。6種のうち写真が要るのは `image` だけで、
 * 「±0.005mm」「他社で断られた案件を実現」は**情報そのものが山になる**（D-305）。
 * だから `AssetRole` に `peak` という名前を使わない。`lead` とする。
 */

import type { ContentId } from "./content.ts";

/** どこから来た素材か。**権利と証拠性はここで決まる** */
export type AssetSource = "none" | "graphic" | "customer" | "library" | "generated";

/** 何のために置くか。**証拠か、雰囲気か。** ここが混ざると生成画像が実績写真になる */
export type AssetIntent = "evidence" | "atmosphere";

/** 画面の中での働き。**`Visual.peak` とは別物** */
export type AssetRole = "lead" | "support" | "background" | "decoration";

/** 何が写っている／描かれているべきか */
export type AssetSubject =
  // ── 実写でしか撮れないもの ──
  | "workpiece" // 加工品・製品そのもの
  | "facility" // 設備・機械
  | "exterior" // 外観・建物
  | "person" // 人（代表・従業員）
  | "workplace" // 人が働いている現場
  | "product" // 商品・サービスの現物
  // ── 描けるもの（CSS / SVG） ──
  | "texture" // 素材の目・紙・粒
  | "grid" // 方眼・格子
  | "dimension" // 寸法線
  | "geometry" // 幾何
  | "light"; // 光・階調

/** **描ける主題。** ここに無いものは、実写か素材ライブラリでしか用意できない */
export const DRAWABLE: AssetSubject[] = ["texture", "grid", "dimension", "geometry", "light"];

export interface Asset {
  source: AssetSource;
  intent: AssetIntent;
  role: AssetRole;
  subject: AssetSubject;
  /**
   * **実写が要るのに無い。人に知らせる。**
   * ここを素材ライブラリや生成画像で埋めない（docs/31 原則②）。
   * `npm run gaps` に流して、お客様への写真依頼にする（第3段階）。
   */
  wanted?: { category: PhotoCategoryId; why: string; priority: "high" | "medium" | "low" };
}

/**
 * 写真の置き場所。`schema.ts` の `PhotoCategory` と同じ語。
 * **語を2箇所で持たないため、型はここで文字列として受け、突き合わせは試験で行う。**
 */
export type PhotoCategoryId = "外観" | "代表者" | "工場・設備" | "加工事例" | "働く人" | "ロゴ" | "その他";

/**
 * 意図ごとに使ってよい出所。**証拠はお客様のものだけ。**
 *
 * `evidence` に `none` を入れているのが要点である。
 * **顧客写真が無いときの正解は「置かない＋依頼する」**であって、代替素材ではない。
 */
export const ALLOWED: Record<AssetIntent, AssetSource[]> = {
  evidence: ["customer", "none"],
  atmosphere: ["graphic", "library", "generated", "none"],
};

export const canUse = (intent: AssetIntent, source: AssetSource): boolean =>
  ALLOWED[intent].includes(source);

/**
 * **証拠になる内容。** ここに実写が要る。
 *
 * 「実在する会社・製品・設備の証拠」として読まれる内容だけを入れる。
 * 強み・技術・沿革は会社の言い分であって、写真が証拠になる種類の情報ではない。
 */
export const EVIDENTIAL: ContentId[] = ["cases", "equipment", "photos", "profile", "executive", "recruit"];

export const intentOf = (content: ContentId): AssetIntent =>
  EVIDENTIAL.includes(content) ? "evidence" : "atmosphere";

/**
 * 内容ごとの、素材の主題。
 *
 * **業種で決めない。** 「製造業だから歯車」をやらないための歯止めで、
 * ここにあるのは「その帯が何の話をしているか」だけである。
 */
export const SUBJECT_OF: Record<ContentId, AssetSubject> = {
  cases: "workpiece",
  equipment: "facility",
  photos: "facility",
  profile: "exterior",
  executive: "person",
  recruit: "workplace",
  offerings: "product",
  materials: "texture",
  conditions: "dimension",
  technique: "grid",
  declined: "light",
  praise: "light",
  history: "texture",
  inquiry: "geometry",
  draft: "light",
};
