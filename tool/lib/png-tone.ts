/**
 * KOBO — PNG の明暗を測る（D-464）
 *
 * 【なぜ要るか】
 * 生成ビジュアルは背景として敷く（D-459・D-463）。**幅の無い絵は、敷いても消える。**
 * 実測：届いた4枚とも **128より暗い画素が 0.0〜0.8%**、5%点〜95%点の幅が **41/255** で、
 * 画面上の差は最大 32〜36/255 にとどまった。**覆いの濃さでは作れない差**である。
 * 書き出しのときに測って、**そのままでは見えない絵を、黙って画面に出さない。**
 *
 * 【デコーダを足さない】
 * 画像ライブラリは入れない。PNG の画素は **`zlib.inflateSync` と展開後の解除**で読める。
 * 8bit の grayscale / RGB / それぞれの alpha 付きに対応する。
 * 16bit は上位バイトだけ使う。**Adam7（インターレース）は読まない**——読めないときは
 * `null` を返し、呼ぶ側が「測れなかった」として扱う（**推測で合格にしない**）。
 */
import zlib from "node:zlib";

export interface Tone {
  /** 画素の5%点・中央・95%点（0〜255） */
  p5: number; median: number; p95: number;
  /** 128より暗い画素の割合（0〜1） */
  dark: number;
  /** 明暗の幅（p95 − p5） */
  range: number;
  width: number; height: number;
}

const BYTES_PER_PIXEL: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** **平均の絶対差がいちばん小さいものを選ぶ**（PNG の Paeth） */
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * PNG の明暗を測る。**読めない形なら `null`。**
 * パレット（colorType 3）も読まない——索引から色表を引く必要があり、
 * 生成ビジュアルは真彩色で来るので、いまは要らない。
 */
export function toneOf(bytes: Uint8Array): Tone | null {
  if (bytes.length < 33) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number) => view.getUint32(at);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (u32(0) !== 0x89504e47) return null;
  const width = u32(16), height = u32(20);
  const depth = bytes[24]!, colorType = bytes[25]!, interlace = bytes[28]!;
  if (interlace !== 0 || colorType === 3) return null;
  if (depth !== 8 && depth !== 16) return null;
  const channels = BYTES_PER_PIXEL[colorType];
  if (!channels || !width || !height) return null;

  /** IDAT は分かれて入っていることがある。**全部つなげてから展開する** */
  const parts: Uint8Array[] = [];
  let at = 8, total = 0;
  while (at + 8 <= bytes.length) {
    const len = u32(at);
    const type = ascii(at + 4, at + 8);
    if (type === "IDAT") { parts.push(bytes.subarray(at + 8, at + 8 + len)); total += len; }
    if (type === "IEND") break;
    at += 12 + len;
  }
  if (!parts.length) return null;
  const idat = new Uint8Array(total);
  let put = 0;
  for (const part of parts) { idat.set(part, put); put += part.length; }
  let raw: Uint8Array;
  try { raw = zlib.inflateSync(idat); } catch { return null; }

  const bpp = channels * (depth === 16 ? 2 : 1);
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;

  /** **1行ずつ解除する。** 前の行を使う filter があるので、順に進むしかない */
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const lum: number[] = [];
  /** 全画素は要らない。**行と画素を間引いて、最大でも約6万点**見る */
  const rowStep = Math.max(1, Math.floor(height / 240));
  const colStep = Math.max(1, Math.floor(width / 240));
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++]!;
    cur.set(raw.subarray(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0, b = prev[i]!, c = i >= bpp ? prev[i - bpp]! : 0;
      const x = cur[i]!;
      cur[i] = (filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b
        : filter === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 0xff;
    }
    if (y % rowStep === 0) {
      for (let x = 0; x < width; x += colStep) {
        const i = x * bpp;
        /** 16bit は上位バイトだけ。**明暗の幅を測るのに下位は要らない** */
        const g = (k: number) => cur[i + k * (depth === 16 ? 2 : 1)]!;
        lum.push(colorType === 0 || colorType === 4
          ? g(0)
          : Math.round(0.2126 * g(0) + 0.7152 * g(1) + 0.0722 * g(2)));
      }
    }
    const swap = prev; prev = cur; cur = swap;
  }
  if (!lum.length) return null;
  lum.sort((a, b) => a - b);
  const q = (t: number) => lum[Math.min(lum.length - 1, Math.floor((lum.length - 1) * t))]!;
  const p5 = q(0.05), p95 = q(0.95);
  return {
    p5, median: q(0.5), p95, range: p95 - p5,
    dark: lum.filter((v) => v < 128).length / lum.length,
    width, height,
  };
}

/**
 * **背景として敷いても見えるか。**
 *
 * 覆いは `.45`（地の色を55%残す・D-459）。画面上の差は およそ `(255 − 明るさ) × .45` になるので、
 *   ・**中間（128）より暗い画素が 5% 以上** … 差 60/255 以上を作れる暗さが要る
 *   ・**明暗の幅（5%点〜95%点）が 100 以上** … 一様な灰色1枚では形にならない
 * のどちらも満たすことを条件にする。実測（届いた4枚）は **暗い画素 0.0〜0.8%／幅 41** で、
 * どちらも満たしていなかった。
 */
export const READABLE_AS_BACKGROUND = { dark: 0.05, range: 100 } as const;

export const readableAsBackground = (t: Tone): boolean =>
  t.dark >= READABLE_AS_BACKGROUND.dark && t.range >= READABLE_AS_BACKGROUND.range;
