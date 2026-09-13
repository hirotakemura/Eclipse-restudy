/**
 * 案件データの読み込みと、ページ構成の決定。
 *
 * **表・一覧・会社概要は、原稿生成を通さずここから直接出す（D-095）。**
 * 生成を通せば、通した分だけ捏造の余地が生まれる。設備の型番や対応材質に創作は要らない。
 * 生成に任せるのは散文だけにして、事実は聞き取ったデータをそのまま出す。
 *
 * ただし **聞き取ったデータ＝そのまま出してよいデータ、ではない。**
 * 取材メモには我々への申し送りが混ざる。読み込んだ時点で落とす（下の sanitize）。
 */

import type { Project } from "../../../lib/schema.ts";
import raw from "../site-data/project.json";

/** lib/schema.ts の NEEDS_REVIEW_MARKER と同じ */
const NEEDS_REVIEW = "{{要確認}}";

/**
 * 公開してよい値だけにする。
 *
 * 第1回の書き出しで、事例の「結果」に書いた
 * 「{{要確認}} 精度・歩留まりの数値実績を工場長に確認する」が、
 * **そのままページに出た。** 原稿生成を通さないぶん、verify.ts の検証も通らないため、
 * ここで落とさなければ公開物に出てしまう。
 *
 * 1. `{{要確認}}` 以降を捨てる。残りが無ければ、その項目自体を無かったことにする
 * 2. 未確認マークが付いた項目は、値が残っていても出さない
 * 3. `unconfirmedNotes`（その場の発言の控え）は、そもそも読まない
 */
function cut(text: string): string {
  const i = text.indexOf(NEEDS_REVIEW);
  return i < 0 ? text : text.slice(0, i).trim().replace(/[、。]$/, "");
}

function sanitize(value: any): any {
  if (typeof value === "string") return cut(value);
  if (Array.isArray(value)) {
    return value
      .map(sanitize)
      .filter((v) => (typeof v === "string" ? v !== "" : v !== null && v !== undefined));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "unconfirmedNotes") continue;
      const s = sanitize(v);
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

const cleaned = sanitize(raw);
dropUnconfirmed(cleaned, (raw as any).unconfirmed ?? []);
export const project = cleaned as Project;

export const companyName = project.basics?.name ?? "";
export const tel = project.basics?.tel ?? "";
export const address = project.basics?.address ?? "";

/**
 * メールアドレス。
 *
 * 取材中に「k-matsubara@…（事務担当のCC先は工場長に確認後に追加）」のように
 * **注記ごと入力されることがある。** そのまま mailto: に入れると壊れたリンクになり、
 * こちらの手控えを公開してしまう。アドレスの形をしている部分だけを取る。
 */
export const email = (project.terms?.inquiryNotifyEmail ?? "").match(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "";

/** 電話番号の表記ゆれを `tel:` 用に整える */
export const telHref = tel.replace(/[^\d+]/g, "");

const goals = new Set(project.inquiry?.goals ?? []);
export const hasRecruit = goals.has("採用") && Boolean(project.recruitment);
export const hasMessage = (goals.has("採用") || goals.has("信用構築")) && Boolean(project.executive?.vision);
export const cases = project.cases ?? [];

export interface NavItem {
  href: string;
  label: string;
}

export const nav: NavItem[] = [
  { href: "/", label: "トップ" },
  { href: "/capability/", label: "対応可能範囲" },
  { href: "/equipment/", label: "設備一覧" },
  { href: "/strengths/", label: "強み・技術" },
  ...(cases.length ? [{ href: "/cases/", label: "加工事例" }] : []),
  { href: "/company/", label: "会社概要" },
  ...(hasRecruit ? [{ href: "/recruit/", label: "採用情報" }] : []),
  ...(hasMessage ? [{ href: "/message/", label: "代表挨拶" }] : []),
  { href: "/contact/", label: "お問い合わせ" },
];

/** 値があるものだけを表の行にする。空欄の行を作らない */
export function rows(pairs: [string, unknown][]): [string, string][] {
  const out: [string, string][] = [];
  for (const [label, value] of pairs) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      out.push([label, value.join("、")]);
      continue;
    }
    out.push([label, String(value)]);
  }
  return out;
}

/**
 * 写真。置き場所（カテゴリ）ごとに取り出す。
 *
 * **写真が無くてもサイトは建つ**（D-099）。写真は足すもので、骨格ではない。
 * ただし「事業所と社長の写真は載せたい」は必ず言われるので、置き場所は先に決めてある。
 */
export interface Photo {
  file: string;
  category: string;
  caption?: string;
  caseNo?: number;
}
const allPhotos: Photo[] = ((project as any).photos ?? []) as Photo[];

/** 公開するファイルのURL。build-site.mjs が public/photos/ に配る */
export const photoSrc = (p: Photo) => `/photos/${p.file}`;

export const photosOf = (category: string) => allPhotos.filter((p) => p.category === category);
export const photoOf = (category: string) => photosOf(category)[0] ?? null;
/** 事例の写真。何件目かで絞る（1始まり） */
export const photosOfCase = (n: number) => photosOf("加工事例").filter((p) => p.caseNo === n);

/** 事例ページのURL。1始まりで、生成した原稿の slug と合わせる */
export const caseHref = (i: number) => `/cases/${i + 1}/`;
