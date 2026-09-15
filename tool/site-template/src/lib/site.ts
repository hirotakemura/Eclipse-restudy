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
import { analyze } from "../../../lib/design/analysis.ts";
import { composeSite, navOf, hasPage, pageOf } from "../../../lib/design/architecture.ts";
import type { PageId } from "../../../lib/design/system/index.ts";

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

/**
 * **メニューは、サイトの骨格から作る**（第6段階）。
 *
 * ここには長らく**手書きの配列**が2本あった（製造業用と汎用用）。
 * 同じ集合が `getStaticPaths` と `assets.ts` にも書き写してあり、
 * ずれないよう試験で突き合わせていた——**表が3つある状態そのものが負債**だった（D-197）。
 *
 * いまは `composeSite()` が単一の正で、メニューも・作るページも・写真の依頼も
 * ・sitemap も、すべてここから出る。
 */
export const sitePlan = composeSite(project, analyze(project as any));
export const nav: NavItem[] = navOf(sitePlan).map((p) => ({ href: p.href, label: p.label }));

/**
 * **そのページを作るか。** 各ページの `getStaticPaths()` はこれだけを見る。
 *
 * 「汎用なら作らない」のような条件を `.astro` に書かない。
 * **条件が散ると、メニューには出ているのにページが無い、が起きる。**
 */
export const buildsPage = (id: PageId): boolean => hasPage(sitePlan, id);
/**
 * **そのページを厚くするか**（第6段階）。
 *
 * 厚くする＝新しい内容を作る、ではない。
 * **この会社がすでに持っている材料を、そのページにも降ろす**だけで、
 * 材料が無ければ `composePage` が何も足さない。
 */
export const depthOf = (id: PageId) => pageOf(sitePlan, id)?.depth ?? "standard";

/** 事例の個別ページ。**件数も骨格が持っている** */
export const casePages = sitePlan.pages.filter((p) => p.id === "case");

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

/**
 * **そのページだけの案件データ**（D-301）。
 *
 * 帯の材料を数える（`materialsOf`）とき、ページによって見る範囲が違う。
 * 事例の個別ページの「写真」はその1件の写真であって、工場の写真ではない。
 * 全件で数えると、**代表者の写真が1枚も無い会社で「代表者」の帯が空のまま出る。**
 *
 * **見立て（`analyze`）には渡さない。** 見立ては会社の性格で、ページごとに変わらない。
 * ここで絞るのは材料の数え方だけである。
 */
export const narrowTo = (over: Record<string, unknown>) => ({ ...(project as any), ...over });

/**
 * ページの説明文（`<meta name="description">`）。
 *
 * **ここが全社同じ雛形だった**（`${会社名}の${ページ名}`）。
 * 中身がどれだけ会社ごとに違っても、**検索結果に出る一行が全社同じ**なら、
 * 検索する人から見れば同じサイトである。
 *
 * **創作しない。** 使うのは聞き取った事実だけで、材料が無ければ短いまま出す。
 * 長さは120字前後に収める（それ以上は検索結果で切られる）。
 */
const listOf = (v: unknown, n: number): string =>
  (Array.isArray(v) ? v : []).filter(Boolean).slice(0, n).map(String).join("・");

export function descriptionOf(id: PageId): string {
  const p = project as any;
  const cap = p.capability ?? {};
  const where = project.basics?.address ?? "";
  const trim = (s: string) => (s.length > 120 ? `${s.slice(0, 119)}…` : s);
  switch (id) {
    case "capability": {
      const m = listOf(cap.materials, 4);
      const ways = listOf(cap.processes, 3);
      const cond = [m && `対応材質は${m}`, ways && `加工法は${ways}`, cap.tolerance && `精度は${cap.tolerance}`, cap.leadTime && `納期は${cap.leadTime}`]
        .filter(Boolean).join("、");
      return trim(cond ? `${companyName}（${where}）の対応可能範囲。${cond}。` : `${companyName}の対応材質・加工法・精度・ロット・納期の一覧`);
    }
    case "equipment": {
      const eq = (cap.equipment ?? []).filter((e: any) => e?.maker || e?.model);
      const names = eq.slice(0, 3).map((e: any) => [e.maker, e.model].filter(Boolean).join(" ")).join("・");
      return trim(names ? `${companyName}の保有設備一覧。${names}ほか、全${eq.length}機種のメーカー・型番・台数を掲載しています。` : `${companyName}の保有設備一覧（メーカー・型番・台数）`);
    }
    case "strengths": {
      const st = p.strengths ?? {};
      const one = String(st.wonAfterOthersDeclined ?? st.followUpFindings ?? "").trim();
      return trim(one ? `${companyName}が選ばれている理由。${one}` : `${companyName}が選ばれている理由`);
    }
    case "cases": {
      const titles = (p.cases ?? []).slice(0, 3).map((c: any) => String(c?.title ?? "")).filter(Boolean).join("・");
      return trim(titles ? `${companyName}の${isGeneral ? "実績" : "加工事例"}。${titles}など。` : `${companyName}の${isGeneral ? "実績" : "加工事例"}`);
    }
    case "company":
      return trim([`${companyName}の会社概要`, where && `所在地は${where}`, project.basics?.founded && `創業${project.basics.founded}`].filter(Boolean).join("。") + "。");
    case "recruit":
      return trim(`${companyName}の採用情報。${where}で一緒に働く方を募集しています。`);
    case "message":
      return trim(`${companyName}代表${project.executive?.name ? ` ${project.executive.name}` : ""}からのご挨拶。`);
    case "contact":
      return `${companyName}へのお問い合わせ。お電話・メールで承ります`;
    default:
      return "";
  }
}

/** 事例ページのURL。1始まりで、生成した原稿の slug と合わせる */
export const caseHref = (i: number) => `/cases/${i + 1}/`;
