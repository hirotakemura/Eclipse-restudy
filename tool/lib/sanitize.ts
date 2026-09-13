/**
 * KOBO — 公開してよい値だけにする
 *
 * **聞き取ったデータ＝そのまま出してよいデータ、ではない。**
 * 取材メモには我々への申し送りが混ざる。読み込んだ時点で落とす。
 *
 * 1. `{{要確認}}` 以降を捨てる。残りが無ければ、その項目自体を無かったことにする
 * 2. 未確認マークが付いた項目は、値が残っていても出さない
 * 3. `unconfirmedNotes`（その場の発言の控え）は、そもそも読まない
 *
 * **ここが単一の正**（D-213）。
 * 直す前はテンプレート側（`site-template/src/lib/site.ts`）にしか無く、
 * **書き出しの説明は生データを見て、ページは落としたデータを見ていた。**
 * その結果、「この会社の最大の強みは精度です」と表示しながら、
 * ページには精度が出ない、という食い違いが起きた。
 */

const NEEDS_REVIEW = "{{要確認}}";

function cut(text: string): string {
  const i = text.indexOf(NEEDS_REVIEW);
  return i < 0 ? text : text.slice(0, i).trim().replace(/[、。]$/, "");
}

function strip(value: any): any {
  if (typeof value === "string") return cut(value);
  if (Array.isArray(value)) {
    return value
      .map(strip)
      .filter((v) => (typeof v === "string" ? v !== "" : v !== null && v !== undefined));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "unconfirmedNotes") continue;
      const s = strip(v);
      if (s === "" || s === null || s === undefined) continue;
      out[k] = s;
    }
    return out;
  }
  return value;
}

function dropUnconfirmed(obj: any, paths: string[]) {
  for (const path of paths) {
    const keys = path.split(".");
    let cur = obj;
    for (const k of keys.slice(0, -1)) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur && typeof cur === "object") delete cur[keys.at(-1)!];
  }
}

/** 公開してよい形にした案件データを返す。**元のデータは変えない** */
export function sanitizeProject<T>(raw: T): T {
  const cleaned = strip(raw);
  dropUnconfirmed(cleaned, (raw as any)?.unconfirmed ?? []);
  return cleaned as T;
}
