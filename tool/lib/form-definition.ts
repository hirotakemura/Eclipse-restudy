/**
 * KOBO — ヒアリングフォームの型定義とフォームセットの一覧
 *
 * フォームは商品ごとに分かれている。
 *
 *   manufacturing … 製造業向け（980,000円）。docs/06-取材台本.md の90分取材をそのまま実装
 *   general       … 汎用（198,000円）。サイトがない中小・零細企業向け。30分で埋まる短縮版
 *
 * **汎用フォームを足しても、製造業フォームは薄めない。**
 * 製造業の深さがこの事業の参入障壁そのものであり（D-043）、
 * 1つのフォームを両対応にすると、その深さが失われる。別々に持つ。
 *
 * `path` は lib/schema.ts の Project 型のドットパスと一致させる。
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "tags" // 文字列の配列。カンマ/Enter区切りで追加
  | "select"
  | "multiselect"
  | "date"
  | "boolean"
  | "photos" // 写真。ファイルを預かって置き場所（カテゴリ）を決める
  | "list"; // オブジェクトの配列

export interface Field {
  /** Project 型のドットパス。例: "basics.name" */
  path: string;
  label: string;
  /** 確認画面でお客様に見せる項目名。省略時は `label` を使う */
  customerLabel?: string;
  type: FieldType;
  /** 充足率の分母に含めるか。取材で必ず取るべき項目を true にする */
  required?: boolean;
  /** 取材台本の質問文。取材中はこれをそのまま聞く */
  help?: string;
  placeholder?: string;
  options?: readonly string[];
  /** type: "list" のときの各要素の項目 */
  itemFields?: Field[];
  /** list の要素をいくつ取りたいか（充足率の判定に使う） */
  minItems?: number;
}

/**
 * 追い質問。「相手がこう言ったら、こう聞く」。
 *
 * 第1回モック取材で最大の強みだった「治具の内製」は、定型質問では一切出ず、
 * 社長の「薄物は歪む」を受けた技術的な追い質問でのみ出た（docs/15 第4章）。
 *
 * **この質問は分野知識がないと思いつかない。**
 * 取材者が製造業に詳しいとは限らないので、知識は人ではなく道具に持たせる。
 * 取材中は画面に出しっぱなしにして、聞こえたら掘る。
 */
export interface FollowUp {
  /** 相手がこう言ったら */
  trigger: string;
  /** こう聞く */
  ask: string;
}

export interface Block {
  id: string;
  /** 取材台本のブロック番号 */
  scriptBlock: string;
  /** 我々が使う見出し。内部向けの注記（★SEOの本体 など）を含んでよい */
  title: string;
  /**
   * 確認画面でお客様に見せる見出し。省略時は `title` を使う。
   *
   * **「強み（社長が自分では言えない部分）」をそのままお見せするわけにはいかない。**
   * 内部向けの言い回しが混ざる見出しには、必ずこちらを付ける。
   */
  customerTitle?: string;
  minutes: number;
  note?: string;
  /** 取材中、画面に出しておく追い質問 */
  followUps?: FollowUp[];
  fields: Field[];
}


/** フォームセットの識別子。案件ごとにどちらかを選ぶ */
export type FormSetId = "manufacturing" | "general";

export interface FormSet {
  id: FormSetId;
  /** 画面に出す名前 */
  label: string;
  /** どういう案件に使うか */
  description: string;
  /** 想定の取材時間（分） */
  interviewMinutes: number;
  blocks: Block[];
}

import { BLOCKS as MANUFACTURING_BLOCKS } from "./forms/manufacturing.ts";
import { BLOCKS as GENERAL_BLOCKS } from "./forms/general.ts";

export const FORM_SETS: Record<FormSetId, FormSet> = {
  manufacturing: {
    id: "manufacturing",
    label: "製造業向け（980,000円）",
    description: "BtoB中小製造業。90分の取材で10〜15ページ分の原稿素材を取り切る",
    interviewMinutes: MANUFACTURING_BLOCKS.reduce((s, b) => s + b.minutes, 0),
    blocks: MANUFACTURING_BLOCKS,
  },
  general: {
    id: "general",
    label: "汎用ベーシック（198,000円）",
    description: "サイトがない中小・零細企業。業種を問わず、30分の聞き取りで5ページ分を取る",
    interviewMinutes: GENERAL_BLOCKS.reduce((s, b) => s + b.minutes, 0),
    blocks: GENERAL_BLOCKS,
  },
};

export function getFormSet(id: FormSetId | undefined): FormSet {
  return FORM_SETS[id ?? "manufacturing"] ?? FORM_SETS.manufacturing;
}

/** 後方互換：製造業フォームを既定として直接参照している箇所のため */
export const BLOCKS = MANUFACTURING_BLOCKS;
export const TOTAL_MINUTES = FORM_SETS.manufacturing.interviewMinutes;
