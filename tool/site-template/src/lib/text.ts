/**
 * **本体は `lib/design/text.ts` にある**（D-433）。
 *
 * 帯の組み立て（`materialsOf`）と画面の描画が、**同じ規則で文を区切る必要がある。**
 * 別々に持つと、必ずいつかずれる（D-197）。ここは置き換え先を指すだけにする。
 */
export { splitParts, type TextPart } from "../../../lib/design/text.ts";
