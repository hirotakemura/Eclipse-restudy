/**
 * KOBO — 型（デザインディレクション）
 *
 * **型は「6個の固定テンプレート」ではない。**
 * 「この会社を、どういう方向で見せるか」を選ぶものである（ご指示§22）。
 *
 * だから型が持つのは**語彙の「好み」だけ**で、出来上がりは決めない。
 * 同じ型を選んでも、会社の材料が違えば Hero も面も組み方もモチーフも変わる。
 *
 * 【名前】**IDは英語、画面に出る名前は日本語**（D-189）。
 * 取材の場で、社長の目の前で押していただくボタンだから。
 *
 * 【集合】製造業と汎用で分ける（D-198・ご指示§23）。
 * 汎用の「生活サービス」系は中原設備が現に使っているので壊さない。
 */

import type { ShowBy } from "./analysis.ts";
import type { SurfaceId, LayoutId, HeroId, MotifId, MotionId } from "./system/index.ts";

/** 何を主役にするか */
export type Tone = "spec" | "story" | "visual";

export interface Direction {
  id: string;
  /** 取材の場で見せる名前。**日本語のまま** */
  label: string;
  note: string;
  tone: Tone;
  /** 前に出すもの */
  favor: ShowBy[];
  /** 後ろに回すもの。**消しはしない。** 材料があるのに出さないのはもったいない */
  defer: ShowBy[];

  // ── ここから語彙の好み。**固定ではなく、候補と既定** ──
  /** 使ってよい面。先頭が既定 */
  surfaces: SurfaceId[];
  /** 使ってよい組み方。先頭が既定 */
  layouts: LayoutId[];
  /** 向いているファーストビュー。材料がある先頭のものを選ぶ */
  heroes: HeroId[];
  /** モチーフの候補。**材料が無ければ none になる** */
  motifs: MotifId[];
  motion: MotionId;
  /**
   * この型を押したときに決まる9軸の既定。
   *
   * **`lib/theme.ts` の PRESETS は、ここから作る。**
   * 別々に持つと必ず食い違う（D-197で学んだとおり）。
   */
  axes: {
    palette: string; font: string; mood: string; textSize: string;
    nav: string; sections: string; headings: string; tables: string;
  };
  /** どのプランの型か */
  plan: "manufacturing" | "general";
}

/** 製造業向けの6つ */
export const MANUFACTURING_DIRECTIONS: Direction[] = [
  {
    id: "standard", label: "標準", note: "迷ったらこれ。材料の多い順に並べる",
    tone: "spec", favor: [], defer: [],
    surfaces: ["plain", "soft", "rule"], layouts: ["stack", "split"],
    heroes: ["headline", "spec", "type"], motifs: ["none"],
    axes: { palette: "ai", font: "gothic", mood: "futsu", textSize: "normal", nav: "standard", sections: "line", headings: "plain", tables: "all" },
    motion: "subtle", plan: "manufacturing",
  },
  {
    id: "technical", label: "精密加工", note: "精度・公差で選ばれる会社。金属加工・機械部品",
    tone: "spec", favor: ["numbers", "materials", "equipment"], defer: ["history", "people"],
    surfaces: ["rule", "grid", "plain", "soft"], layouts: ["split", "stack", "offset"],
    heroes: ["figure", "spec", "motif", "headline"], motifs: ["dimension", "grid", "none"],
    axes: { palette: "hagane", font: "mixed", mood: "katai", textSize: "normal", nav: "sidebar", sections: "line", headings: "rule", tables: "stripe" },
    motion: "standard", plan: "manufacturing",
  },
  {
    id: "craft", label: "老舗・職人", note: "受け継いできた手仕事で選ばれる会社。創業が古い会社に",
    tone: "story", favor: ["history", "people", "technique"], defer: ["numbers"],
    surfaces: ["paper", "plain", "soft"], layouts: ["editorial", "stack", "offset"],
    heroes: ["type", "headline", "photo"], motifs: ["grain", "none"],
    axes: { palette: "enji", font: "mincho", mood: "futsu", textSize: "normal", nav: "standard", sections: "space", headings: "underline", tables: "horizontal" },
    motion: "subtle", plan: "manufacturing",
  },
  {
    id: "engineering", label: "設計・技術", note: "難しい案件を受けられることで選ばれる。図面・技術が中心",
    tone: "spec", favor: ["technique", "declined", "numbers"], defer: ["photos"],
    surfaces: ["grid", "plain", "rule"], layouts: ["offset", "split", "stack"],
    heroes: ["motif", "figure", "spec"], motifs: ["grid", "section", "process", "none"],
    axes: { palette: "sumi", font: "mixed", mood: "katai", textSize: "normal", nav: "sidebar", sections: "line", headings: "rule", tables: "stripe" },
    motion: "standard", plan: "manufacturing",
  },
  {
    id: "industrial", label: "量産・設備", note: "設備と量産能力で選ばれる会社。数と体制を見せる",
    tone: "spec", favor: ["equipment", "numbers", "photos"], defer: ["people", "history"],
    surfaces: ["soft", "accent", "plain"], layouts: ["fullbleed", "split", "stack"],
    heroes: ["spec", "photo", "figure"], motifs: ["process", "grid", "none"],
    axes: { palette: "fukamidori", font: "gothic", mood: "futsu", textSize: "normal", nav: "standard", sections: "alternate", headings: "band", tables: "all" },
    motion: "subtle", plan: "manufacturing",
  },
  {
    id: "product", label: "製品・開発", note: "自社製品・開発力で選ばれる会社。製品そのものを主役に",
    tone: "visual", favor: ["technique", "materials", "photos"], defer: ["equipment"],
    surfaces: ["plain", "soft", "accent"], layouts: ["editorial", "offset", "fullbleed"],
    heroes: ["type", "photo", "headline"], motifs: ["section", "grain", "none"],
    axes: { palette: "ai", font: "mixed", mood: "yawaraka", textSize: "normal", nav: "standard", sections: "space", headings: "underline", tables: "horizontal" },
    motion: "standard", plan: "manufacturing",
  },
];

/**
 * 汎用ベーシック向け。
 *
 * **数を揃えない。** 30分の取材で取れる材料しかないので、
 * 選ばせる型を増やしても埋まらない。
 */
export const GENERAL_DIRECTIONS: Direction[] = [
  {
    id: "seikatsu", label: "生活サービス", note: "個人のお客様が多い会社。住宅・設備・店舗",
    tone: "visual", favor: ["photos", "people"], defer: ["equipment", "materials"],
    surfaces: ["soft", "plain", "paper"], layouts: ["stack", "split"],
    heroes: ["headline", "photo", "type"], motifs: ["none"],
    axes: { palette: "kohaku", font: "maru", mood: "yawaraka", textSize: "normal", nav: "standard", sections: "alternate", headings: "underline", tables: "horizontal" },
    motion: "subtle", plan: "general",
  },
  {
    id: "shop", label: "店舗・サービス", note: "何を・いくらで・どこまで、が問われる会社",
    tone: "spec", favor: ["numbers", "technique"], defer: ["history"],
    surfaces: ["plain", "soft", "accent"], layouts: ["stack", "split"],
    heroes: ["spec", "headline"], motifs: ["none"],
    axes: { palette: "fukamidori", font: "gothic", mood: "futsu", textSize: "normal", nav: "standard", sections: "line", headings: "plain", tables: "all" },
    motion: "subtle", plan: "general",
  },
  {
    id: "gstandard", label: "標準", note: "迷ったらこれ。業種を問わず外さない",
    tone: "spec", favor: [], defer: [],
    surfaces: ["plain", "soft"], layouts: ["stack"],
    heroes: ["headline", "spec"], motifs: ["none"],
    axes: { palette: "ai", font: "gothic", mood: "futsu", textSize: "normal", nav: "standard", sections: "line", headings: "plain", tables: "all" },
    motion: "subtle", plan: "general",
  },
];

export const DIRECTIONS: Direction[] = [...MANUFACTURING_DIRECTIONS, ...GENERAL_DIRECTIONS];

/**
 * 古い型のIDを読み替える。
 *
 * **取材済みの案件データは作り直せない**（D-141と同じ配慮）。
 * `seiketsu`（食品・環境）は業種の名前であって見せ方の方向ではなかったので、
 * 製造業では `standard` に寄せる。清潔さ・写真主役という性格は、
 * **写真を預かっているかどうか**（Company Analysis）で出る。
 */
const RENAMED: Record<string, string> = {
  hyojun: "standard",
  seimitsu: "technical",
  shinise: "craft",
  sekkei: "engineering",
  seiketsu: "standard",
};

export function migrateDirection(id: string | undefined, plan: "manufacturing" | "general" = "manufacturing"): string {
  if (!id) return plan === "general" ? "gstandard" : "standard";
  if (DIRECTIONS.some((d) => d.id === id && d.plan === plan)) return id;
  // 汎用の型が製造業案件に付いていたら、製造業の既定へ
  if (plan === "manufacturing" && id === "seikatsu") return "standard";
  return RENAMED[id] ?? (plan === "general" ? "gstandard" : "standard");
}

export const directionsFor = (plan: "manufacturing" | "general" | undefined): Direction[] =>
  plan === "general" ? GENERAL_DIRECTIONS : MANUFACTURING_DIRECTIONS;

export const getDirection = (id: string | undefined): Direction =>
  DIRECTIONS.find((d) => d.id === id) ?? MANUFACTURING_DIRECTIONS[0]!;
