/**
 * KOBO — Node の組み込みのうち、**実際に使っているものだけ**の型（D-464）
 *
 * `@types/node` は入れない。この道具は**依存を増やさない**方針で、
 * `lib/` の TypeScript が Node の組み込みを使うのは `png-tone.ts` の `zlib` だけである。
 * 必要になったぶんだけ、ここに足す。
 */
declare module "node:zlib" {
  /** zlib で固めたものを展開する。**PNG の IDAT はこれで読める** */
  export function inflateSync(data: Uint8Array): Uint8Array;
}
