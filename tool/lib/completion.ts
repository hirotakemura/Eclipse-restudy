/**
 * KOBO — ヒアリングの充足率を計算する
 *
 * 2つの数字を分けて出すことが重要（docs/03 第2章の計測指標）。
 *
 *   充足率(filled)  : 実際に値が入っている必須項目の割合
 *                     → 指標1「取材90分で埋まった項目の割合」（目標85%以上）
 *   消化率(covered) : 値が入っている＋「未確認」マークを付けた必須項目の割合
 *                     → 聞き漏らしがゼロか（目標100%）
 *
 * 「答えてもらえなかった」と「そもそも聞き忘れた」は全く別の問題であり、
 * 前者は生成側で {{要確認}} を残せばよいが、後者は取材のやり直しになる。
 */

import type { Block, Field } from "./form-definition.ts";

export interface BlockStat {
  id: string;
  title: string;
  requiredTotal: number;
  filled: number;
  covered: number;
  filledPct: number;
  coveredPct: number;
}

export interface Completion {
  requiredTotal: number;
  filled: number;
  covered: number;
  filledPct: number;
  coveredPct: number;
  /** 未確認マークが付いている項目のパス */
  unconfirmed: string[];
  /** 必須なのに、値も未確認マークも無い項目のパス（＝聞き漏らし） */
  missing: string[];
  byBlock: BlockStat[];
}

/** "a.b.c" 形式のドットパスで値を取り出す */
export function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** "a.b.c" 形式のドットパスに値を書き込む（途中のオブジェクトは作る） */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    const next = cur[key];
    if (next === null || typeof next !== "object") cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = value;
}

/** その項目に実質的な値が入っているか */
export function isFilled(value: unknown, field: Field): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    const min = field.minItems ?? 1;
    if (value.length < min) return false;
    // list 型は、各要素が空オブジェクトでないことまで見る
    if (field.type === "list") {
      const nonEmpty = value.filter(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          Object.values(item as Record<string, unknown>).some(
            (v) => v !== undefined && v !== null && String(v).trim() !== "",
          ),
      );
      return nonEmpty.length >= min;
    }
    return true;
  }
  return false;
}

export function computeCompletion(
  project: unknown,
  blocks: Block[],
  unconfirmedPaths: string[] = [],
): Completion {
  const unconfirmed = new Set(unconfirmedPaths);
  const byBlock: BlockStat[] = [];
  const missing: string[] = [];
  let requiredTotal = 0;
  let filled = 0;
  let covered = 0;

  for (const block of blocks) {
    let bTotal = 0;
    let bFilled = 0;
    let bCovered = 0;

    for (const field of block.fields) {
      if (!field.required) continue;
      bTotal++;
      const ok = isFilled(getByPath(project, field.path), field);
      if (ok) {
        bFilled++;
        bCovered++;
      } else if (unconfirmed.has(field.path)) {
        bCovered++;
      } else {
        missing.push(field.path);
      }
    }

    requiredTotal += bTotal;
    filled += bFilled;
    covered += bCovered;
    byBlock.push({
      id: block.id,
      title: block.title,
      requiredTotal: bTotal,
      filled: bFilled,
      covered: bCovered,
      filledPct: bTotal === 0 ? 100 : Math.round((bFilled / bTotal) * 100),
      coveredPct: bTotal === 0 ? 100 : Math.round((bCovered / bTotal) * 100),
    });
  }

  return {
    requiredTotal,
    filled,
    covered,
    filledPct: requiredTotal === 0 ? 0 : Math.round((filled / requiredTotal) * 100),
    coveredPct: requiredTotal === 0 ? 0 : Math.round((covered / requiredTotal) * 100),
    unconfirmed: [...unconfirmed],
    missing,
    byBlock,
  };
}
