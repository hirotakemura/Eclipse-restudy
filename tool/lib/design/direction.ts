/**
 * KOBO — 型（デザインディレクション）
 *
 * **型は「完成済みのテンプレート」ではない。**
 * 「この会社を、どういう方向で見せるか」を選ぶものである。
 *
 * 段階1までは、型は9軸（配色・書体…）の組み合わせの別名でしかなかった。
 * だから型を変えても**装飾しか変わらず**、同じ顔のサイトが出ていた（docs/21）。
 *
 * ここでは型に、**見せ方の優先順位**を持たせる。
 * 同じ型を選んでも、会社の材料が違えば出てくる構成は変わる。
 * 逆に、同じ会社でも型が違えば並び方と強弱が変わる。
 *
 * **名前は日本語のままにする。** 取材の場で、社長の目の前で押していただくボタンだから。
 */

import type { ShowBy } from "./analysis.ts";

/** 何を主役にするか。幅と強さの既定が変わる */
export type Tone =
  | "spec" // 条件と数字。調達担当者が最初に見るものを大きく
  | "story" // 読み物。文章と人・歴史を主役に
  | "visual"; // 写真。現場を見せる

export interface Direction {
  id: string;
  /** 取材の場で見せる名前。**日本語のまま** */
  label: string;
  note: string;
  tone: Tone;
  /** 前に出すもの */
  favor: ShowBy[];
  /** 後ろに回すもの。**消しはしない。** 材料があるのに出さないのは、もったいない */
  defer: ShowBy[];
}

export const DIRECTIONS: Direction[] = [
  {
    id: "hyojun", label: "標準", note: "迷ったらこれ。材料の多い順に並べる",
    tone: "spec", favor: [], defer: [],
  },
  {
    id: "seimitsu", label: "精密加工", note: "条件と設備で判断してもらう。金属加工・機械部品",
    tone: "spec", favor: ["numbers", "materials", "equipment"], defer: ["history", "people"],
  },
  {
    id: "shinise", label: "老舗・職人", note: "受け継いできたもので選ばれる会社。創業が古い会社に",
    tone: "story", favor: ["history", "people", "technique"], defer: ["numbers"],
  },
  {
    id: "seiketsu", label: "食品・環境", note: "現場を見せて安心してもらう。清潔さが問われる業種",
    tone: "visual", favor: ["photos", "equipment"], defer: ["declined"],
  },
  {
    id: "seikatsu", label: "生活サービス", note: "人と現場で選ばれる会社。個人のお客様が多い",
    tone: "visual", favor: ["photos", "people"], defer: ["equipment", "materials"],
  },
  {
    id: "sekkei", label: "設計・技術", note: "難しい案件を受けられることで選ばれる。図面・技術が中心",
    tone: "spec", favor: ["technique", "declined", "numbers"], defer: ["photos"],
  },
];

export const getDirection = (id: string | undefined): Direction =>
  DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0]!;
