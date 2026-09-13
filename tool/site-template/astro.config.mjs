// @ts-check
import { defineConfig } from "astro/config";

/**
 * 静的書き出しのみ。サーバーは持たない。
 *
 * サイト数が増えても保守工数が増えない構造にすることが、この事業の前提そのもの（docs/10）。
 * 動くものを各サイトに置くと、その数だけ更新と障害対応が発生する。
 */
export default defineConfig({
  site: process.env.SITE_URL || "https://example.com",
  outDir: process.env.OUT_DIR || "./dist",
  build: { inlineStylesheets: "always" },
  devToolbar: { enabled: false },
});
