/**
 * KOBO — 掲載文の下ごしらえ（第10段階②）
 *
 * **「欄が埋まっている」と「画面に出してよい文が書けている」は、別のことである。**
 *
 * 第2回取材のデータで実際に起きたこと——
 *
 * | KOBOの表示 | 画面に出たもの |
 * | --- | --- |
 * | 入力 100% | 最初の画面の `<h1>` が137字（売上構成・創業年・社長の経歴入り） |
 * | 事例 4件 | うち2件の「どう解いたか」が**一字一句同じ文** |
 * | 代表挨拶 入力済み | 「5年後には先代（会長）が完全に引退している見込み」 |
 *
 * どれも欄としては埋まっている。埋まっていないのは**文のほう**である。
 *
 * 【なぜ起きたか】
 * `basics.businessSummary` の欄名は「**主力の事業と売上比率**」で、
 * 取材台本の質問は「主力の事業は何ですか。売上の比率はどのくらいですか」。
 * **聞くための欄**である。それが、そのまま最初の画面の見出しになっている。
 * **聞いた言葉と、出す文は、別のものである。**
 *
 * 掲載文の仕組み（`webText`・D-401）は作ってあった。
 * だが**書き出す道具が無かったので、43案件すべてで一度も使われていない**（実測）。
 * 仕組みがあるだけでは使われない。ここは、その道具の中身である。
 *
 * 【ここでは文章を書かない】
 * 直すのは人である。この層がするのは
 *   ① 掲載文が用意されていない欄を**名指しする**
 *   ② 画面に出る文（掲載文があればそれ、無ければ取材原文）を見て、
 *      **機械で確実に言えることだけ**を指摘する
 * の2つだけで、**言い換えも要約もしない**。
 */
import { WEB_TEXT_PATHS, webTextShape } from "./schema.ts";
import { getFormSet, type FormSetId, type Field } from "./form-definition.ts";
import { findInternalLanguage, type InternalHit } from "./internal-language.ts";

export interface WebTextField {
  /** 実際のキー。`cases[1].solution` のように添字が入る */
  key: string;
  /** 表と突き合わせる形。`cases[].solution` */
  shape: string;
  /** 取材で聞いた欄の名前。**ここで表を作らない**——フォーム定義から引く（D-197） */
  label: string;
  /** 取材台本の質問文。何を聞かれて答えた言葉なのかが、書き直すときの手がかりになる */
  help?: string;
  /** 取材で入力された言葉 */
  raw: string;
  /** 画面に出る文。掲載文に人の印があればそれ、無ければ取材原文 */
  published: string;
  /** 掲載文が用意され、人が読んだ印があるか */
  reviewed: boolean;
}

const at = (obj: any, path: string) =>
  path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/** フォーム定義から欄の名前と質問文を引く。**同じ表を2つ持たない**（D-197） */
function fieldOf(shape: string, formSet?: FormSetId): { label: string; help?: string } {
  const blocks = getFormSet(formSet).blocks;
  const all: Field[] = blocks.flatMap((b) => b.fields);
  if (!shape.includes("[]")) {
    const f = all.find((x) => x.path === shape);
    return { label: f?.label ?? shape, help: f?.help };
  }
  const [arrPath, name] = shape.split("[].") as [string, string];
  const outer = all.find((x) => x.path === arrPath);
  const inner = (outer?.itemFields ?? []).find((x) => x.path === name);
  return {
    label: [outer?.label, inner?.label].filter(Boolean).join("：") || shape,
    help: inner?.help ?? outer?.help,
  };
}

/**
 * 掲載文を持ってよい欄のうち、**中身が入っているものだけ**を並べる。
 *
 * 空欄は出さない。「書けていない」と「聞いていない」は別の話で、
 * 聞いていない欄は充足率（KOBO側）の仕事である。
 */
export function webTextFields(project: any, formSet?: FormSetId): WebTextField[] {
  const map = (project?.webText ?? {}) as Record<string, { text?: string; reviewedAt?: string }>;
  const out: WebTextField[] = [];
  const push = (key: string, raw: unknown) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const w = map[key];
    const reviewed = Boolean(w?.reviewedAt?.trim() && w?.text?.trim());
    const shape = webTextShape(key);
    const { label, help } = fieldOf(shape, formSet ?? project?.formSet);
    out.push({ key, shape, label, help, raw, published: reviewed ? w!.text!.trim() : raw, reviewed });
  };
  for (const shape of WEB_TEXT_PATHS) {
    if (!shape.includes("[]")) { push(shape, at(project, shape)); continue; }
    const [arrPath, name] = shape.split("[].") as [string, string];
    const rows = at(project, arrPath);
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, i) => push(`${arrPath}[${i}].${name}`, row?.[name]));
  }
  return out;
}

/** 掲載文がまだ無い欄。**取材の言葉がそのまま画面に出ている欄**である */
export const rawFields = (fields: WebTextField[]): WebTextField[] => fields.filter((f) => !f.reviewed);

/**
 * 文のまとまりに割る。
 *
 * 段落（空行）と句点で割り、【見出し】と空白を落としてから比べる。
 * **改行の入れ方が違うだけの同じ文を、別物と数えないため。**
 */
const SAME_MIN = 20;
/**
 * **20字**。「最終図面の確定に至りました。」（14字）のような結びの一文は、
 * 別々の事例で自然に一致する。そこまで拾うと誤検知で止まる道具になる（`internal-language.ts` と同じ考え）。
 * 【撤回の条件】20字未満の一致が実案件で問題になったとき、または
 * 20字以上の一致で「直しようがない正当な重複」が出たときは、ここを見直す。
 */
const blocksOf = (text: string): string[] =>
  text
    .split(/\n{2,}|(?<=。)/)
    .map((s) => s.replace(/【[^】]*】/g, "").replace(/\s+/g, ""))
    .filter((s) => s.length >= SAME_MIN);

export interface DuplicateBlock {
  /** 重なっている文 */
  text: string;
  /** その文を持っている欄（2つ以上） */
  keys: string[];
}

/**
 * **同じ文が、複数の欄に入っていないか。**
 *
 * 事例が4件あるように見えて、「どう解いたか」は2件とも一字一句同じ——
 * これは構成の重複（Owner / Reference・D-410〜D-415）では消えない。
 * **データの側に、1件分しか書かれていない。**
 *
 * 見るのは**画面に出る文**である。片方を掲載文として書き直せば、この指摘は消える。
 * 「指摘を消すために掲載文を書く」が、そのまま正しい直し方になるようにしてある。
 */
export function duplicateBlocks(fields: WebTextField[]): DuplicateBlock[] {
  const seen = new Map<string, Set<string>>();
  for (const f of fields) {
    for (const b of blocksOf(f.published)) {
      if (!seen.has(b)) seen.set(b, new Set());
      seen.get(b)!.add(f.key);
    }
  }
  return [...seen]
    .filter(([, keys]) => keys.size >= 2)
    .map(([text, keys]) => ({ text, keys: [...keys] }));
}

/** その欄の文に残っている社内語。**表はここで作らない**（`internal-language.ts` を使う） */
export const internalIn = (f: WebTextField): InternalHit[] => findInternalLanguage(f.published);
