/**
 * sitemap.xml — **ページの並びの意図を、検索エンジンに伝える唯一の場所**（第6段階）。
 *
 * これまで sitemap も robots.txt も**存在しなかった。**
 * ページの順番が会社ごとに変わるようになったので、
 * 「このサイトではどのページが重い扱いか」を機械に伝えられる場所が要る。
 *
 * **`priority` に入れるのは `searchWeight` であって、`order`（導線の順）ではない**（ご指示）。
 * 人が読む順と、検索での重みは一致しない。
 * 例：お問い合わせは導線の最後だが、社名で検索した人には拾われてよい。
 *
 * `lastmod` は入れない。**書き出すたびに全ページの日付が動く**ので、
 * 更新していないページまで「更新した」と伝えることになる。
 */
import type { APIRoute } from "astro";
import { sitePlan } from "../lib/site";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? "https://example.com/").replace(/\/$/, "");
  const urls = sitePlan.pages
    .map((p) => `  <url>\n    <loc>${base}${p.href}</loc>\n    <priority>${p.searchWeight.toFixed(1)}</priority>\n  </url>`)
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
