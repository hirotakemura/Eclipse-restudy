/**
 * KOBO — ファーストビュー（最初の画面）
 *
 * **直す前は3つしか無く、そのうち1つ（写真を大きく）は写真が要った。**
 * つまり写真ゼロの会社では実質2択で、6つの型を選んでも
 * 最初の画面が2通りにしかならなかった（docs/22）。
 *
 * **写真ゼロでも5通り選べる**ようにする（ご指示②・§12）。
 */

export type HeroId = "headline" | "spec" | "figure" | "type" | "motif" | "photo";

export interface HeroStyle {
  id: HeroId;
  label: string;
  note: string;
  /**
   * この型を選ぶのに要る材料。無いときは選ばせない。
   * **材料が無いまま選ぶと、間延びした最初の画面になる。**
   */
  needs?: "photo" | "spec" | "figure" | "motif";
  worksWithoutPhotos: boolean;
}

export const HEROES: HeroStyle[] = [
  {
    id: "headline", label: "見出しを先に",
    note: "既定。何をしている会社かを一文で言い切る。写真が無くても成立する",
    worksWithoutPhotos: true,
  },
  {
    id: "spec", label: "対応範囲を先に",
    note: "材質・加工法・ロット・納期を最初の画面に置く。写真が無い会社ほど効く",
    needs: "spec", worksWithoutPhotos: true,
  },
  {
    id: "figure", label: "数字を大きく",
    note: "いちばん強い数字を1つだけ、画面いっぱいに。精度や納期で選ばれる会社に",
    needs: "figure", worksWithoutPhotos: true,
  },
  {
    id: "type", label: "余白と文字だけ",
    note: "大きな文字と広い余白。材料が少なくても成立し、静かで格が出る",
    worksWithoutPhotos: true,
  },
  {
    id: "motif", label: "技術の地紋",
    note: "寸法線や方眼を敷いた上に見出しを置く。図面・設計が中心の会社に",
    needs: "motif", worksWithoutPhotos: true,
  },
  {
    id: "photo", label: "写真を大きく",
    note: "外観や現場の写真が良いときに。**写真が無いと間延びする**",
    needs: "photo", worksWithoutPhotos: false,
  },
];

export const getHero = (id: string | undefined): HeroStyle =>
  HEROES.find((h) => h.id === id) ?? HEROES[0]!;
