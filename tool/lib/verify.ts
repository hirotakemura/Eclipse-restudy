/**
 * KOBO — 生成原稿の事実検証
 *
 * **これは機能ではなく安全装置です。**
 * 製造業の技術情報で嘘を書くと、信用を失うだけでなく、顧客と発注元の取引事故になります（D-013）。
 * 「±5μm」と書いたサイトを見て来た発注を、実際は±20μmしか出せなかった——これが起きると、
 * 責任の所在にかかわらず、我々の事業は終わります。
 *
 * 【設計の要点】
 * 生成原稿に現れる事実（数値・型番・認証）が、**案件データに出典を持つか**を機械的に照合します。
 *
 * 【絶対に外してはいけない点】
 * 照合の対象に `unconfirmedNotes` を含めないこと。
 * ここには「ミクロン単位までは可能です」のような、**答えてもらえなかった記録**が入っています。
 * これを出典として認めると、まさに捏造を防ぎたかった項目が素通りします。
 */

import type { Project } from "./schema.ts";
import { BANNED_PHRASES, NEEDS_REVIEW_MARKER } from "./schema.ts";
import { findInternalLanguage } from "./internal-language.ts";

export type Severity = "error" | "warn";

export type FindingKind =
  | "fabricated-tolerance" // 出典のない公差・精度
  | "fabricated-model" // 出典のない型番
  | "fabricated-cert" // 出典のない認証・規格
  | "unverified-number" // 出典のないその他の数値
  | "banned-phrase" // 無内容な表現
  | "unresolved-marker" // {{要確認}} が残っている
  | "internal-language"; // 社内語（作業メモ・確認事項）が本文に入っている

export interface Finding {
  severity: Severity;
  kind: FindingKind;
  /** 見つかった文字列 */
  found: string;
  /** 前後の文脈 */
  context: string;
  message: string;
}

/**
 * 全角の英数字・記号を半角にする。**1文字を1文字に置き換えるので、文字位置が変わらない。**
 *
 * 抽出はこの結果に対して行う。生の原稿にそのまま正規表現をかけると、
 * 全角で書かれた型番（ＸＹＺ９９９）が `[A-Z]` に一致せず素通りする。
 * 位置が保たれるので、見つけた箇所の文脈は元の原稿から取れる。
 */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[±＋]/g, "+")
    .replace(/[－‐‑‒–—―]/g, "-"); // 長音符「ー」は日本語の一部なので変換しない
}

/**
 * 照合用の正規化。空白を除き、大文字に揃える。
 * 「SUS 304」と「ｓｕｓ３０４」を同一視するため。**文字数は変わるので抽出には使わない。**
 */
export function normalize(text: string): string {
  return toHalfWidth(text)
    .replace(/ー/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/**
 * 出典として認める文字列の集合を作る。
 *
 * **`unconfirmedNotes` は絶対に含めない。** 答えてもらえなかった記録であり、事実ではない。
 * 同じ理由で、`unconfirmed` に入っている項目の値も除外する（通常は空だが念のため）。
 */
export function buildSourceText(project: Project): string {
  const unconfirmed = new Set(project.unconfirmed ?? []);
  const parts: string[] = [];

  const walk = (node: unknown, path: string) => {
    if (path === "unconfirmedNotes" || unconfirmed.has(path)) return;
    if (node === null || node === undefined) return;
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(project, "");
  return normalize(parts.join("\n"));
}

interface Rule {
  kind: FindingKind;
  severity: Severity;
  pattern: RegExp;
  message: string;
}

/**
 * 抽出ルール。
 *
 * 公差・型番・認証は **error**（ビルドを止める）。誤ると取引事故になる種類の情報。
 * その他の数値は **warn**（人間が確認する）。「創業から50年以上」のような、
 * データから導けるが文字列としては存在しない表現を拾いすぎないため。
 */
const RULES: Rule[] = [
  {
    kind: "fabricated-tolerance",
    severity: "error",
    pattern: /[±+\-]?\s*\d+(?:\.\d+)?\s*(?:μm|um|㎛|ミクロン|ミリ)/gi,
    message: "公差・精度の値に出典がありません。取材で確認できていない数値を書いてはいけません",
  },
  {
    kind: "fabricated-cert",
    severity: "error",
    pattern: /(?:ISO|JIS|IATF|IEC|EN|AS)\s?-?\s?\d{3,5}(?::\d{4})?/gi,
    message: "認証・規格の番号に出典がありません。取得していない認証を書くと重大な問題になります",
  },
  {
    kind: "fabricated-model",
    severity: "error",
    pattern: /\b[A-Z][A-Za-z]{0,6}-?\d[A-Za-z0-9-]{1,}\b/g,
    message: "型番らしき文字列に出典がありません。設備の型番は銘板で確認したものだけを書きます",
  },
  {
    kind: "unverified-number",
    severity: "warn",
    pattern: /\d+(?:\.\d+)?\s*(?:mm|cm|kg|t|台|名|人|件|個|年|日|時間|%|割|社)/g,
    message: "この数値が案件データに見当たりません。取材記録と照合してください",
  },
];

const contextOf = (text: string, index: number, len: number) =>
  text.slice(Math.max(0, index - 25), Math.min(text.length, index + len + 25)).replace(/\n/g, " ");

/**
 * 生成原稿を検証する。
 *
 * @param draft    生成された原稿
 * @param project  案件データ（出典）
 * @param opts.forPublish 公開ビルドか。true のとき {{要確認}} の残存を error にする
 */
export function verifyDraft(
  draft: string,
  project: Project,
  opts: { forPublish?: boolean } = {},
): Finding[] {
  const findings: Finding[] = [];
  const source = buildSourceText(project);
  const seen = new Set<string>();

  // 抽出は半角化した原稿に対して行う。1文字1文字の対応なので、位置は元の原稿と一致する
  const scanned = toHalfWidth(draft);

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const m of scanned.matchAll(rule.pattern)) {
      const found = m[0].trim();
      const key = `${rule.kind}:${normalize(found)}`;
      if (seen.has(key)) continue;
      if (source.includes(normalize(found))) continue; // 出典あり
      seen.add(key);
      findings.push({
        severity: rule.severity,
        kind: rule.kind,
        found,
        context: contextOf(draft, m.index ?? 0, found.length),
        message: rule.message,
      });
    }
  }

  for (const phrase of BANNED_PHRASES) {
    const i = draft.indexOf(phrase);
    if (i < 0) continue;
    findings.push({
      severity: "error",
      kind: "banned-phrase",
      found: phrase,
      context: contextOf(draft, i, phrase.length),
      message: "無内容な表現です。具体の数字か固有名詞に書き換えてください。この言葉では検索にも引っかかりません",
    });
  }

  if (draft.includes(NEEDS_REVIEW_MARKER)) {
    const i = draft.indexOf(NEEDS_REVIEW_MARKER);
    findings.push({
      severity: opts.forPublish ? "error" : "warn",
      kind: "unresolved-marker",
      found: NEEDS_REVIEW_MARKER,
      context: contextOf(draft, i, NEEDS_REVIEW_MARKER.length),
      message: opts.forPublish
        ? "未確認の箇所が残ったままです。公開できません"
        : "未確認の箇所があります。工場長への確認事項に入れてください",
    });
  }

  /**
   * 社内語。**マークの付け忘れは、マークを探しても見つからない**（D-169）。
   * ここは出典との照合ではない。案件データに書いてあっても、
   * 「現地で銘板と照合して確定させること」は顧客向けの文章ではない。
   */
  for (const hit of findInternalLanguage(draft)) {
    findings.push({
      severity: hit.severity === "block" ? "error" : "warn",
      kind: "internal-language",
      found: hit.found,
      context: contextOf(draft, hit.index, hit.found.length),
      message: hit.why,
    });
  }

  const order = { error: 0, warn: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** error が1件でもあれば、ビルドを通さない */
export const hasBlockingError = (findings: Finding[]): boolean =>
  findings.some((f) => f.severity === "error");
