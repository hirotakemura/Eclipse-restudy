/**
 * 案件で選ばれた見た目を、テンプレートに流し込む。
 *
 * 選択肢の定義そのものは `tool/lib/theme.ts` が単一の正。ここでは読み込むだけ。
 * **選べるのに反映されない、が一番まずい。** 定義を二重に持たない。
 */
import { resolveTheme, themeVars } from "../../../lib/theme.ts";
import { project } from "./site";

export const theme = resolveTheme(project.theme);
export const themeStyle = themeVars(project.theme);
/** CSSだけでは表せない差は、<html> の属性で出す */
export const navId = theme.nav.id;
export const heroId = theme.hero.id;
export const sectionsId = theme.sections.id;
export const headingsId = theme.headings.id;
export const tablesId = theme.tables.id;
export const webfont = theme.font.webfont;
