/**
 * 案件で選ばれた見た目を、テンプレートに流し込む。
 *
 * 選択肢の定義そのものは `tool/lib/theme.ts` が単一の正。ここでは読み込むだけ。
 * **選べるのに反映されない、が一番まずい。** 定義を二重に持たない。
 */
import { resolveTheme, themeVars } from "../../../lib/theme.ts";
import { project } from "./site";

export const theme = resolveTheme((project as any).theme);
export const themeStyle = themeVars((project as any).theme);
/** レイアウトは CSS では表せない差もあるので、body の属性で出す */
export const layoutId = theme.layout.id;
export const webfont = theme.font.webfont;
