/**
 * KOBO — 情報表現の語彙（どう見せるか）
 *
 * **この改修の目的は「情報の種類を減らして違いを作る」ことではない。**
 * **「同じ必要情報を持っていても、その会社にとって何が重要なのかによって、
 * 情報の見せ方が変わる」状態を作ること**（D-204）。
 *
 * 直す前は `Section.kind` が「何を出すか」と「どう見せるか」を1語で表していた。
 * `materials` は必ず札、`figures` は必ず横並びの数字、`cases` は必ずカードの格子。
 * だから型を変えても**同じ内容が同じ形で出ていた**（実測：情報の種類の重なり0.76）。
 *
 * **12個。これ以上は増やさない。**
 */

export type PresentationId =
  | "prose" | "list" | "chips" | "cardGrid" | "largeNumber" | "spec"
  | "comparison" | "timeline" | "process" | "quote" | "longform" | "fullWidth";

export interface Presentation {
  id: PresentationId;
  label: string;
  note: string;
  /**
   * これを選ぶのに要る材料。**表に○があっても、材料が無ければ選べない**（D-206）。
   * 実際の判定は `compat.ts` の `hasMaterial()`。
   */
  needs: string;
  worksWithoutPhotos: boolean;
}

export const PRESENTATIONS: Presentation[] = [
  {
    id: "prose", label: "散文",
    // **`longform` と役割を分ける**（D-207）
    note: "短い説明・通常の本文。数行で用が足りるもの。1行の長さは40em前後に保つ",
    needs: "文章が1つ", worksWithoutPhotos: true,
  },
  {
    id: "list", label: "箇条書き",
    note: "数が少なく、並列に読めるもの", needs: "2件以上", worksWithoutPhotos: true,
  },
  {
    id: "chips", label: "札",
    note: "検索される語をひとつずつ。材質・加工法に向く", needs: "2件以上", worksWithoutPhotos: true,
  },
  {
    id: "cardGrid", label: "カードの格子",
    // **禁止ではない。「既定にしない」だけ**（D-207）
    note: "件数があり、各件が独立して読まれるもの。加工事例・設備に向く。“情報だからカード”にはしない",
    needs: "2件以上", worksWithoutPhotos: true,
  },
  {
    id: "largeNumber", label: "大きな数字",
    note: "1〜3個の強い数値を、本文に埋めずに大きく出す",
    needs: "短く言い切れる値が1つ以上（14文字以内・句読点なし）", worksWithoutPhotos: true,
  },
  {
    id: "spec", label: "仕様表",
    note: "項目が多く、突き合わせて読むもの", needs: "3行以上", worksWithoutPhotos: true,
  },
  {
    id: "comparison", label: "対比",
    note: "2つの値を並べて見せる（標準7日 ／ 最短3日）", needs: "対になる2つの値", worksWithoutPhotos: true,
  },
  {
    id: "timeline", label: "年表",
    // **薄い年表は、無いより悪い**
    note: "時系列。3件未満では作らない", needs: "3件以上", worksWithoutPhotos: true,
  },
  {
    id: "process", label: "工程の流れ",
    note: "順序に意味があるもの（相談→図面→加工→検査）", needs: "順序のある記述2つ以上", worksWithoutPhotos: true,
  },
  {
    id: "quote", label: "引用",
    note: "人の言葉をそのまま大きく出す", needs: "鍵括弧つきの発言", worksWithoutPhotos: true,
  },
  {
    id: "longform", label: "読み物",
    /*
      ご指示の「Editorial」はこれにあたる。
      **`editorial` は組み方（layout）の側ですでに使っているので名前を分ける。**
      同じ名前を2つの軸で使わない（D-207）。
    */
    note: "長めの文章を、余白・段落・引用で読ませる。読ませることが目的",
    needs: "200文字以上の文章", worksWithoutPhotos: true,
  },
  {
    id: "fullWidth", label: "全幅",
    note: "写真や図を画面いっぱいに", needs: "実写の写真", worksWithoutPhotos: false,
  },
];

export const getPresentation = (id: string | undefined): Presentation =>
  PRESENTATIONS.find((p) => p.id === id) ?? PRESENTATIONS[0]!;
