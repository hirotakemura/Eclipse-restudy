/**
 * KOBO — 原稿を書く側に渡してよい案件データ
 *
 * **渡さなければ、書きようがない（D-253）。**
 *
 * これまで原稿生成には `project.json` を丸ごと渡していた。
 * 指示文には「社内の判断材料をそのまま書かない」と書いてあったが、**守られなかった。**
 * 実測では、D-170で公開テンプレートから消したはずの「人手が足りず受注を絞っている」が、
 * 採用ページ・代表挨拶・強みの3ページに、**言い換えられて**出た。
 * 公開判定（`internalValues`）は**同じ文字列**しか見ないので、言い換えは素通りする。
 *
 * 後ろで捕まえるのをやめ、**前で渡さない**ことにした。
 *
 * 通す順に意味がある：
 *   1. `sanitizeProject` … `{{要確認}}` 以降を落とし、未確認の項目の値を消す（D-213）
 *   2. `stripInternal`   … 社内向けの欄と、我々の手控えを落とす（D-253）
 *
 * **`unconfirmed`（未確認の項目名の一覧）は残す。**
 * 何が聞けていないかは、原稿を書く側が知っている必要がある。
 * 知らなければ空欄を埋めてしまう。残すのは**項目名だけ**で、**そのときの発言は渡さない。**
 */

import type { Project } from "../schema.ts";
import { sanitizeProject } from "../sanitize.ts";
import { stripInternal, type FormSetId } from "../form-definition.ts";

export function writerView(project: Project): Project {
  const formSet: FormSetId = (project as any).formSet === "general" ? "general" : "manufacturing";
  const out = stripInternal(sanitizeProject(project), formSet) as any;
  /**
   * **掲載用の文章は、原稿の材料ではない**（第10段階①）。
   * 渡すと、すでに画面に出ている文章を散文でもう一度書くことになる
   * （テンプレートが出すものを書かせない、と同じ理屈）。
   * 出典としても認めていない（`verify.ts`）ので、材料にもしない。
   */
  delete out.webText;
  return out as Project;
}
