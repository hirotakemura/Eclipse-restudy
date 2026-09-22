/**
 * KOBO — その内容の「本体」はどのページか（Owner / Reference の実証）
 *
 * 【なぜ要るか】
 * 実測で、同じ本文が**一字一句そのまま複数ページに出ていた。**
 *   ・「どうやって受けているか」（272字）… トップ／強み・技術／対応可能範囲／加工事例の**4ページ**
 *   ・「他社様で難しいと言われた案件」（53字）… トップ／強み・技術／お問い合わせの**3ページ**、
 *     しかも**3ページとも `emphasis: lead`**（そのページの山）
 *   ・仕様の8行表 … トップ／強み・技術／対応可能範囲の**3ページ**
 * 5ページ見た人は、同じ2段落を4回読むことになる。
 *
 * 【考え方】
 * 「他のページにその情報がある」＝「他のページにも全文を載せる」ではない。
 *   **Owner**     … 全文を持つページ。1つだけ
 *   **Reference** … 見出し＋既存データから成立する短い情報＋Ownerへのリンク
 *
 * 【やっていないこと】
 * ・**新しい表現（PresentationId）を足していない。** 下の `REFERENCE_AS` は
 *   すべて `COMPATIBLE` にすでにある組み合わせである。
 * ・**文章を要約・生成していない。** 短い形は `project.json` の既存データから作る。
 * ・**先頭N文字で切っていない**（日本語が途中で切れる）。`technique` の一覧は
 *   取材で付いた【見出し】をそのまま並べるだけで、見出しが無ければ使わない。
 *
 * **この表は実証のための暫定値であり、最終仕様ではない**（docs の調査結果を参照）。
 */
import type { ContentId } from "./content.ts";
import type { PageId } from "./page.ts";
import type { PresentationId } from "./presentation.ts";

/**
 * 本体を持つページ。**ここに書いていない内容は、いままでどおり**どのページでも全文で出る。
 *
 * `cases` だけ2つあるのは、**一覧と個別で役割が違う**ため。
 * 個別ページ（`case`）はその1件の詳細そのものなので、短くしてはいけない。
 */
export const OWNER_OF: Partial<Record<ContentId, PageId[]>> = {
  technique: ["strengths"],
  declined: ["strengths"],
  conditions: ["capability"],
  cases: ["cases", "case"],
};

/**
 * 本体でないページで使う、短い見せ方。**すべて既存の可否表にある組み合わせ。**
 *
 *   technique  → `list`        取材で付いた【見出し】だけを並べる（本文は出さない）
 *   conditions → `largeNumber` 判断に効く数字だけ（8行の表は出さない）
 *   cases      → `spec`        件名と条件の一覧（工程の全文は出さない）
 *
 * `declined` はここに無い。**可否表にある3つ（quote / prose / longform）はどれも全文**で、
 * 短い形が存在しないからである。53字と短い文なので、
 * **文は変えず、山（`emphasis: lead`）をやめる**ことだけで Reference にする。
 */
export const REFERENCE_AS: Partial<Record<ContentId, PresentationId[]>> = {
  technique: ["list"],
  /**
   * **大きな数字は、大きく出す値があるときだけ**（`hasMaterial` が見ている）。
   * 松原精機は「±0.01mm」「標準7日」のような**文**なので、この関所に落ちる。
   * 落ちたときは一覧（`list`）に降りる。**8行の表よりは短い。**
   * ★実装中に気づいた：最初は落ちたら `kind` の既定値に戻していたので、
   *   **材料の無い大きな数字が画面に出ていた**（検査が落ちて分かった）。
   */
  conditions: ["largeNumber", "list"],
  /**
   * **`spec` は使えない。** 実測：`rows()` が「値の空いた行」を落とすため、
   * 材質も数量も納期も聞き取れていない案件が**表から消えた**
   * （松原精機は4件中2件しか出なかった）。**情報を落とす見せ方は Reference にできない**（D-204）。
   * `cardGrid` は全件が出て、本文は3行で切られる（`line-clamp`・既存のCSS）。
   */
  cases: ["cardGrid"],
};

/** そのページが、その内容の本体か */
export const isOwner = (content: ContentId, page: PageId): boolean => {
  const owners = OWNER_OF[content];
  return !owners || owners.includes(page);
};

/**
 * **見出しの無い工程を、一覧にしてはいけない。**
 *
 * `technique` の一覧は `splitParts` が【】で切った `title` を並べる。
 * 取材本文が【】で始まっていない案件では**先頭に見出しの無い塊ができ**、
 * そこだけ本文を途中で切って出すことになる。**日本語が途中で切れる。**
 * だから「本文が【で始まり、【】が2つ以上ある」ときだけ一覧にする。
 * 条件を満たさなければ Reference の見せ方を諦め、いままでどおり全文で出す。
 */
export const canListTechnique = (text: string | undefined): boolean => {
  const v = (text ?? "").trim();
  return v.startsWith("【") && (v.match(/【[^】]+】/g) ?? []).length >= 2;
};
