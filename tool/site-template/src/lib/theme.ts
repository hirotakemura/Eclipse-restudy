/**
 * 案件で選ばれた見た目を、テンプレートに流し込む。
 *
 * 選択肢の定義そのものは `tool/lib/theme.ts` が単一の正。ここでは読み込むだけ。
 * **選べるのに反映されない、が一番まずい。** 定義を二重に持たない。
 */
import { resolveTheme, themeVars } from "../../../lib/theme.ts";
import { getDirection } from "../../../lib/design/direction.ts";
import { analyze } from "../../../lib/design/analysis.ts";
import { resolveHero } from "../../../lib/design/sections.ts";
import { project } from "./site";

const plan = (project as any).formSet === "general" ? "general" : "manufacturing";
export const theme = resolveTheme(project.theme, plan);
export const themeStyle = themeVars(project.theme);
/** CSSだけでは表せない差は、<html> の属性で出す */
export const navId = theme.nav.id;
/**
 * 最初の画面。**材料が無ければ、その型の次の候補へ落とす**（D-203）。
 * CSSの `html[data-hero=...]` もこちらに合わせる。合わないと余白だけが変わる。
 */
export const heroId = resolveHero(theme.hero.id, analyze(project as any), theme.direction);
export const sectionsId = theme.sections.id;
export const headingsId = theme.headings.id;
export const tablesId = theme.tables.id;
/**
 * 動きの強さ。型が決める（lib/design/direction.ts）。
 * **動きは補助。無くても情報構造が成立する**（ご指示③）
 */
export const motionId = getDirection(theme.direction).motion;
export const webfont = theme.font.webfont;
