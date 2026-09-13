/**
 * 取材メモの体裁をほどく。
 *
 * 取材の記録は「【治具の内製】…【設計経験による図面の意図読解】…」の形で書かれる。
 * **一塊の長文のまま出すと読まれない。** 【】を小見出しとして分ける。
 * 分けられない文はそのまま1つの塊として返す。
 */
export interface TextPart {
  title?: string;
  body: string;
}

export function splitParts(text: string | undefined): TextPart[] {
  return (text ?? "")
    .split(/【([^】]+)】/)
    .reduce<TextPart[]>((acc, chunk, i) => {
      if (i === 0) {
        if (chunk.trim()) acc.push({ body: chunk.trim() });
        return acc;
      }
      if (i % 2 === 1) {
        acc.push({ title: chunk.trim(), body: "" });
        return acc;
      }
      acc[acc.length - 1]!.body = chunk.trim();
      return acc;
    }, [])
    .filter((x) => x.body);
}
