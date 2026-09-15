/**
 * robots.txt — **sitemap の場所を伝えるためだけに置く**（第6段階）。
 *
 * 出さないページは作らない設計（`composeSite`）なので、
 * **`Disallow` で隠すものが無い。** 書くのは sitemap の場所だけである。
 * 「とりあえず何か禁止しておく」を書くと、**いつか本当に必要なページを塞ぐ。**
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? "https://example.com/").replace(/\/$/, "");
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
