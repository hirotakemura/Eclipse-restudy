/**
 * KOBO — 組み方（帯の中身の並べ方）
 *
 * **直す前は1カラムしか無かった。** 幅（狭い・普通・広い）は変わっても、
 * 中身は常に上から順に積むだけだったので、どのページも同じ顔になっていた（docs/22）。
 *
 * **スマホでどうなるかを、ここで一緒に決める**（ご指示§17）。
 * PCで作ってから縮めると、非対称や重なりが壊れる。
 */

export type LayoutId = "stack" | "split" | "offset" | "editorial" | "fullbleed";

export interface Layout {
  id: LayoutId;
  label: string;
  note: string;
  /** スマホでどう畳むか。**定義に持たせる**（あとで縮めない） */
  mobile: string;
  worksWithoutPhotos: boolean;
}

export const LAYOUTS: Layout[] = [
  { id: "stack", label: "上から順", note: "既定。散文と表に向く", mobile: "そのまま", worksWithoutPhotos: true },
  { id: "split", label: "左右2分割", note: "見出しを左に固定し、中身を右に流す", mobile: "縦に積む", worksWithoutPhotos: true },
  { id: "offset", label: "非対称", note: "片側に寄せ、反対側に大きな余白を取る", mobile: "余白を戻して1カラム", worksWithoutPhotos: true },
  { id: "editorial", label: "読み物", note: "大きな見出し・狭い本文・広い余白", mobile: "見出しを1段落とす", worksWithoutPhotos: true },
  { id: "fullbleed", label: "画面いっぱい", note: "左右の余白を捨てる。写真があるほど効く", mobile: "左右の余白を戻す", worksWithoutPhotos: false },
];

export const getLayout = (id: string | undefined): Layout =>
  LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]!;
