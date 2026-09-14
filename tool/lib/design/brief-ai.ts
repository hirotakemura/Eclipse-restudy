/**
 * KOBO — AI版の Design Brief
 *
 * **AIに自由にデザインさせるための仕組みではない**（ご指示）。
 * AIが決めるのは「何を出すか」ではなく、
 * **「何を主役にするか」「どの情報を先に見せるか」「どの表現を優先するか」**だけである。
 *
 * 【この関数の約束】
 * ① **例外を投げない。** 鍵が無くても、通信が切れても、429でも、
 *    規則版に落として**最後まで書き出せる**（ご指示）。
 * ② **AIの判断を、検査より先に信頼しない。**
 *    形 → 語彙 → 可否 → 材料 → 情報量 のどこで落ちても、規則版に戻す。
 * ③ **情報を削らせない。** 規則版が出す内容が1つでも欠けていたら、その判断は丸ごと捨てる。
 *    **帯の取捨だけでなく、表現の選び方でも削らせない**（D-204／D-259）。
 * ④ **出所を偽らせない。** `source` は AI が書く欄ではなく、こちらが付ける。
 *
 * 【AIを呼ぶ場所】
 * **ここだけ。** Astro のビルド中には絶対に呼ばない。
 * ビルドは、保存済みの Brief を読むだけで動く（ネットワーク不要・再現性あり）。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import { materialsOf } from "./materials.ts";
import { keepsLess, getPresentation, type ContentId } from "./system/index.ts";
import {
  validateBrief, type BriefProblem, type DesignBrief, type StoredBrief,
} from "./brief.ts";
import { ruleBrief, sameDecision, stored, type BriefContext } from "./brief-rules.ts";
import { composeTop } from "./sections.ts";
import { SYSTEM, userPrompt } from "./brief-prompt.ts";

/** Claude Opus 5。原稿生成と同じ（D-019） */
const DEFAULT_MODEL = "claude-opus-5";

/** AIに問い合わせる関数。**試験では作り物を差し込む**（APIは叩かない） */
export type Ask = (system: string, user: string) => Promise<string>;

export interface DecideOptions {
  /** 既定は false。**実案件の既定は規則版のまま**（ご指示） */
  useAI?: boolean;
  ask?: Ask;
  model?: string;
  onProgress?: (message: string) => void;
}

/** AIが返してよいキー。**これ以外が1つでもあれば、1段目で落とす** */
const AI_KEYS = new Set(["primaryStrength", "secondaryStrength", "blocks"]);

/** ```json …``` で包まれていても読めるようにする。**それ以外の緩和はしない** */
function unfence(text: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (m ? m[1]! : text).trim();
}

/**
 * AIの返答を、規則版の Brief に**重ねる**。
 *
 * 重ねるのは3つだけ（`primaryStrength` / `secondaryStrength` / `blocks`）。
 * 最初の画面・地紋・動きの強さは**規則版のまま**で、AIには触らせない。
 */
function overlay(rules: DesignBrief, ai: Record<string, unknown>): DesignBrief {
  return {
    ...rules,
    primaryStrength: ai.primaryStrength as DesignBrief["primaryStrength"],
    secondaryStrength: ai.secondaryStrength as DesignBrief["secondaryStrength"],
    blocks: ai.blocks as DesignBrief["blocks"],
  };
}

/**
 * AIの返答を検査する。**問題の一覧を返す。空なら合格。**
 *
 * `validateBrief` の4段の前に、**AIの返答そのものの形**を見る段を足す。
 * 合成したあとの Brief を見るだけでは、
 * 「AIが `html` という欄を返した」ことに気づけない（規則版の値で上書きされてしまう）。
 */
export function checkAIResponse(
  text: string, project: Project, a: Analysis, rules: DesignBrief,
): { brief: DesignBrief | null; problems: BriefProblem[] } {
  const problems: BriefProblem[] = [];
  const bad = (stage: BriefProblem["stage"], where: string, message: string) =>
    problems.push({ stage, where, message });

  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch (err) {
    bad("form", "全体", `JSONとして読めません：${(err as Error).message}`);
    return { brief: null, problems };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    bad("form", "全体", "JSONのオブジェクトではありません");
    return { brief: null, problems };
  }
  const ai = raw as Record<string, unknown>;
  for (const k of Object.keys(ai)) {
    if (!AI_KEYS.has(k)) bad("form", k, `返してよい項目ではありません：${k}`);
  }
  if (!Array.isArray(ai.blocks)) {
    bad("form", "blocks", "配列ではありません");
    return { brief: null, problems };
  }
  /**
   * **情報を削って差を作らせない**（D-204）。
   *
   * 「他社と同じ情報だから削る」という判断はしない、が我々の方針である。
   * 規則版が出す内容が1つでも欠けていたら、その判断は**丸ごと捨てる。**
   * 順番と見せ方は変えてよいが、取捨は変えさせない。
   */
  const given = new Set(ai.blocks.map((b: any) => b?.content));
  for (const b of rules.blocks) {
    if (!given.has(b.content)) bad("form", `blocks/${b.content}`, `規則版が出す内容が消えています：${b.content}`);
  }
  if (problems.length) return { brief: null, problems };

  const brief = overlay(rules, ai);
  // ここから先は既存の4段検査（形 → 語彙 → 可否 → 材料）にそのまま通す
  const materials = (c: ContentId) => materialsOf(project, c, a.hasRealPhotos);
  /** **規則版が現に描いている組を、検査が否定しない**（D-262） */
  const drawn = new Set(rules.blocks.map((b) => `${b.content}:${b.presentation}`));
  problems.push(...validateBrief(brief, materials, drawn));
  if (problems.length) return { brief: null, problems };

  /**
   * **5段目：情報量**（D-259）。
   *
   * 可否も材料も満たしているのに、**画面に出る情報が減る**乗り換えがある。
   * 実測では、AIが変えた5箇所が5箇所とも情報の少ないほうへ動き、
   * 設備の帯からメーカー名（ブラザー工業・ミツトヨ）と一覧への導線が消えた。
   * 4段検査は「問題なし」で通した。可否も材料も、確かに満たしていたからである。
   *
   * **情報を削らせない**（D-204）を、帯の取捨だけでなく**表現の選び方にも当てる。**
   * 規則版と同じか、より多く出す表現なら通る。**強さ（emphasis）は制限しない。**
   */
  for (const r of rules.blocks) {
    const y = brief.blocks.find((z) => z.content === r.content);
    if (!y || !keepsLess(r.presentation, y.presentation)) continue;
    bad("information", `blocks/${r.content}`,
      `「${getPresentation(y.presentation).label}」は「${getPresentation(r.presentation).label}」より画面に出る情報が少なくなります（${r.content}）`);
  }
  return { brief: problems.length ? null : brief, problems };
}

/** 本物のAPI呼び出し。**ここ以外からAnthropicを呼ばない** */
async function askAnthropic(system: string, user: string, model: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: 4000,
    // **選択肢の中から選ぶ仕事なので、原稿生成ほどの思考は要らない。** 費用も下がる
    output_config: { effort: "low" },
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: user }],
  } as any);
  return (message as any).content
    .filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}

/**
 * Brief を決める。**必ず Brief を返す。投げない。**
 *
 * 返るものは3通り。
 *   rules       … AIを使っていない（実案件の既定）
 *   ai          … AIの判断が4段検査を通り、採用された
 *   ai-fallback … AIを呼んだが通らなかった／呼べなかった。**規則版で最後まで書き出す**
 */
export async function decideBrief(
  project: Project, a: Analysis, ctx: BriefContext, opts: DecideOptions = {},
): Promise<StoredBrief> {
  const { useAI = false, model = DEFAULT_MODEL, onProgress = () => {} } = opts;
  const rules = ruleBrief(project, a, ctx);
  if (!useAI) return stored(rules, "rules", true);

  const ask: Ask = opts.ask ?? ((s, u) => askAnthropic(s, u, model));
  let text: string;
  try {
    onProgress("  情報の優先順位をAIに判断させます（語彙のIDだけを返させます）");
    /**
     * **効かない場所を判断させない**（D-260）。
     *
     * Brief が効くのはトップページだけ（D-225）。ところがたたき台は
     * 下層ページの帯まで並べており、**AIが変えた5箇所のうち4箇所は、
     * そもそも画面に出ない場所だった**（実測）。費用を払って、効かない判断をさせていた。
     * **内容の一覧からは外さない**（外すと「その内容は無い」と思って順位をつける・D-224）。
     * どれがトップに出るかを、その場で伝える。
     */
    const onTop = new Set(
      composeTop(project, a, ctx).filter((s) => s.kind !== "hero").map((s) => s.content),
    );
    text = await ask(SYSTEM, userPrompt(project, a, rules, onTop));
  } catch (err) {
    /**
     * **止めない。**
     * 鍵が無い・通信が切れた・429。どれも「サイトが書き出せない」理由にはしない。
     */
    const why = (err as any)?.status ? `API ${(err as any).status}` : ((err as Error)?.message ?? String(err));
    onProgress(`  AIを呼べませんでした（${why}）。規則版で続けます`);
    return stored(rules, "ai-fallback", true, [{ stage: "form", where: "API", message: why }]);
  }

  const { brief, problems } = checkAIResponse(text, project, a, rules);
  if (!brief) {
    onProgress(`  AIの判断は検査で落ちました（${problems.length}件）。規則版で続けます`);
    for (const p of problems) onProgress(`    ${p.stage}　${p.where}　${p.message}`);
    return stored(rules, "ai-fallback", true, problems);
  }
  const agreed = sameDecision(rules, brief);
  onProgress(agreed
    ? "  AIの判断は規則版と同じでした（規則で足りるところで、余計な変更をしていません）"
    : "  AIの判断を採用します");
  return stored(brief, "ai", agreed);
}
