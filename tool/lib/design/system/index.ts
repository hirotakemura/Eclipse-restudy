/**
 * KOBO — Design System の語彙（単一の正）
 *
 * **ここに無い値は使えない。**
 * 生成AIに決めさせるのは「この中のどれか」だけで、**値そのものは作らせない**（D-200）。
 * そうすれば、AIが何を返しても機械で検査できる。
 */
export * from "./surface.ts";
export * from "./layout.ts";
export * from "./hero.ts";
export * from "./motif.ts";
export * from "./media.ts";
export * from "./asset.ts";
export * from "./library.ts";
export * from "./motion.ts";
export * from "./content.ts";
export * from "./presentation.ts";
export * from "./compat.ts";
/**
 * **Visual Composition の語彙**（Phase 2）。
 * ここは定義だけで、**まだ画面には接続していない。**
 * 接続は Phase 4（`composeVisual()`）で行う。
 */
export * from "./typography.ts";
export * from "./density.ts";
export * from "./peak.ts";
export * from "./cta.ts";
