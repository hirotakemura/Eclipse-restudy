/**
 * 生成した原稿（projects/<id>/draft/*.md）の読み込み。
 *
 * **原稿が無くてもサイトは建つ。** 聞き取ったデータだけで、表と事実は出せる。
 * 原稿はそこに散文を足すものであって、サイトの骨格ではない。
 * （APIキーが無い環境や、生成前の段階でも構成を確認できるようにしておく）
 */

const files = import.meta.glob("../site-data/draft/*.md", { eager: true }) as Record<
  string,
  { Content: any; rawContent?: () => string }
>;

const bySlug: Record<string, { Content: any }> = {};
for (const [path, mod] of Object.entries(files)) {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  bySlug[slug] = mod;
}

/** その slug の原稿。無ければ null */
export function draft(slug: string) {
  return bySlug[slug] ?? null;
}

export const hasDraft = (slug: string) => Boolean(bySlug[slug]);
