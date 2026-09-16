/**
 * KOBO — 視覚言語（Visual Language）
 *
 * **「何を描くか」ではなく、「この会社をどういう視覚世界として表現するか」を決める層**である。
 *
 * `surface`（面）・`motif`（地紋）・`graphic`（CSSで描く）・`library`（素材）とは重ならない。
 * **あちらは描き方、こちらは方針**で、方針は生成ビジュアルの注文書（`generated.ts`）にしか使わない。
 *
 * 【なぜ要るか】
 * 第8段階まででレイアウト・余白・文字・面・地紋・動きは型ごとに変わるようになったが、
 * **同じ勝ち筋の会社は、まだ同じ顔をしている。** 会社の材料（材質・型・色・余白）から
 * **絵の方針**を引けるようにして、「この会社のために作られた」を1段進めるのがここである。
 *
 * 【増やさない】
 * 主題（`subjects`）は**描ける5つ（`DRAWABLE`）からしか選べない。**
 * 加工品・設備・外観・人・現場・商品を生成の主題にしないための歯止めで、
 * **「工場写真の代用品」を注意ではなく型で禁じる**（D-206と同じ思想）。
 */

import type { AssetSubject } from "./asset.ts";
import { DRAWABLE } from "./asset.ts";

export type VisualLanguageId =
  | "measurement"     // 計測・座標・公差
  | "transformation"  // 変形・工程・複雑さ
  | "material"        // 素材・手・時間
  | "structure"       // 構造・系・製図的幾何
  | "scale"           // 規模・反復・流れ
  | "object"          // 物・素材・設計された形
  | "record"          // 積み重ね・実績の厚み
  | "relation"        // 人と人・応対
  | "none";           // 方針を持たない（＝生成ビジュアルを作らない）

export interface VisualLanguage {
  id: VisualLanguageId;
  label: string;
  note: string;
  /** 絵の軸。**英語**（生成サービスに渡す言葉なので、ここで日本語にしない） */
  axis: string[];
  /** 使ってよい主題。**`DRAWABLE` の外は書けない**（assertVisualLanguages が弾く） */
  subjects: AssetSubject[];
}

export const VISUAL_LANGUAGES: VisualLanguage[] = [
  { id: "none", label: "持たない", note: "既定。方針が引けない会社では生成ビジュアルを作らない",
    axis: [], subjects: [] },
  { id: "measurement", label: "計測", note: "精度で選ばれる会社。座標・公差・制御された光",
    axis: ["measurement", "controlled geometry", "coordinate space", "tolerance"],
    subjects: ["dimension", "geometry", "light"] },
  { id: "transformation", label: "変形", note: "難加工の会社。素材が形を変えていく過程",
    axis: ["material transformation", "cutting trajectory", "process", "complexity"],
    subjects: ["geometry", "texture", "light"] },
  { id: "material", label: "素材", note: "手仕事・老舗。素材の目と、積み重なった時間",
    axis: ["material surface", "accumulated time", "workshop light", "grain"],
    subjects: ["texture", "light"] },
  { id: "structure", label: "構造", note: "設計・技術。層になった構造と製図的な幾何",
    axis: ["technical structure", "layered construction", "blueprint geometry", "spatial grid"],
    subjects: ["grid", "geometry", "dimension"] },
  { id: "scale", label: "規模", note: "設備・量産。反復と流れ、締まった光",
    axis: ["repetition", "production flow", "scale", "industrial geometry"],
    subjects: ["grid", "light", "geometry"] },
  { id: "object", label: "物", note: "製品・開発。設計された形と、その素材",
    axis: ["engineered form", "material reflection", "conceptual object"],
    subjects: ["geometry", "light", "texture"] },
  { id: "record", label: "積み重ね", note: "実績で選ばれる会社。層・反復・厚み",
    axis: ["accumulation", "layered record", "quiet repetition"],
    subjects: ["grid", "texture"] },
  { id: "relation", label: "応対", note: "人で選ばれる会社。柔らかい光と、間",
    axis: ["soft light", "open space", "calm atmosphere"],
    subjects: ["light", "texture"] },
];

export const getVisualLanguage = (id: string | undefined): VisualLanguage =>
  VISUAL_LANGUAGES.find((x) => x.id === id) ?? VISUAL_LANGUAGES[0]!;

/**
 * 勝ち筋 → 視覚言語。
 *
 * **業種では決めない。** 「製造業だから歯車」をやらないための歯止めは、
 * 地紋（`motif.ts`）と同じで、ここにあるのは**その会社が何で選ばれているか**だけである。
 * `unknown` は `none`——**根拠が無いのに絵の方針を作らない**（D-205）。
 */
export const LANGUAGE_OF: Record<string, VisualLanguageId> = {
  precision: "measurement",
  difficulty: "transformation",
  speed: "scale",
  range: "material",
  engineering: "structure",
  equipment: "scale",
  craft: "material",
  offering: "object",
  price: "none",        // 価格は絵にならない。**無理に絵を当てない**
  reason: "relation",
  voice: "relation",
  record: "record",
  person: "relation",
  history: "material",
  unknown: "none",
};

/** **読み込んだ時点で弾く。** 描けない主題を方針に書けないようにする */
export function assertVisualLanguages(list: VisualLanguage[] = VISUAL_LANGUAGES): void {
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.id)) throw new Error(`VisualLanguage: id が重複しています（${x.id}）`);
    seen.add(x.id);
    for (const s of x.subjects) {
      if (!DRAWABLE.includes(s)) {
        throw new Error(`VisualLanguage: 「${s}」は描ける主題ではありません（${x.id}）。実写でしか撮れないものを生成の主題にしない`);
      }
    }
    if (x.id !== "none" && (!x.axis.length || !x.subjects.length)) {
      throw new Error(`VisualLanguage: 軸か主題が空です（${x.id}）`);
    }
  }
}
assertVisualLanguages();
