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
import { sanitizeProject } from "../../../lib/sanitize.ts";
import type { StoredBrief } from "../../../lib/design/brief.ts";

/**
 * **落とす処理は `lib/sanitize.ts` が単一の正**（D-213）。
 * ここに書いていたため、書き出しの説明は生データを見て、
 * ページは落としたデータを見る、という食い違いが起きていた。
 */
export const project = sanitizeProject(raw) as Project;

/**
 * 情報の見せ方の判断（Design Brief）。**読み出すだけ。ここでは作らない。**
 *
 * **ビルド中にAIを呼ばないための要**である。
 * 判断は生成のときに済ませて `project.json` に保存してあり、
 * ここから先はネットワークが無くても同じサイトが建つ。
 * 無ければ `undefined` のままで、規則版が決める（実案件の既定）。
 */
export const designBrief = (project as any).designBrief as StoredBrief | undefined;

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

/**
 * 商品が2つある（`lib/form-definition.ts`）。**テンプレートは1つしか持たない**（D-096）。
 *
 *   manufacturing … 製造業向け（980,000円）。対応可能範囲・設備一覧がSEOの本体
 *   general       … 汎用ベーシック（198,000円）。業種を問わない。ページ数を増やさない
 *
 * 見た目の違いは、聞き取ったデータの違いから出す。コードを分けない。
 */
export const formSet = (project as any).formSet ?? "manufacturing";
export const isGeneral = formSet === "general";

/** 汎用：主なサービス・商品。中身のあるものだけ */
export const offerings = ((project as any).general?.offerings ?? []).filter(
  (o: any) => o && (o.name || o.detail),
);
export const serviceArea = (project as any).general?.serviceArea ?? "";
export const idealCustomer = (project as any).general?.idealCustomer ?? "";
export const reasonChosen = (project as any).general?.reasonChosen ?? "";

const goals = new Set(project.inquiry?.goals ?? []);
export const hasRecruit = goals.has("採用") && Boolean(project.recruitment);
export const hasMessage = (goals.has("採用") || goals.has("信用構築")) && Boolean(project.executive?.vision);
export const cases = project.cases ?? [];

export interface NavItem {
  href: string;
  label: string;
}

export const nav: NavItem[] = isGeneral
  ? [
      { href: "/", label: "トップ" },
      ...(offerings.length ? [{ href: "/services/", label: "サービス・料金" }] : []),
      { href: "/strengths/", label: "選ばれている理由" },
      ...(cases.length ? [{ href: "/cases/", label: "実績" }] : []),
      { href: "/company/", label: "会社概要" },
      ...(hasRecruit ? [{ href: "/recruit/", label: "採用情報" }] : []),
      ...(hasMessage ? [{ href: "/message/", label: "代表挨拶" }] : []),
      { href: "/contact/", label: "お問い合わせ" },
    ]
  : [
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

/**
 * 頭のメニューには「お問い合わせ」を入れない。
 *
 * **同じ画面の中に、緑のボタンとメニュー項目で2回出ていた。**
 * ボタンのほうが目立つうえ、常に見えているので、メニュー項目は重複でしかない（D-175）。
 * 脚のメニューには残す。会社情報を探す人は、脚を見るから。
 */
export const headerNav: NavItem[] = nav.filter((n) => n.href !== "/contact/");

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
