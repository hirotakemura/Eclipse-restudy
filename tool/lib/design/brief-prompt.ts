/**
 * KOBO — AIに渡すもの
 *
 * **`project.json` 全体は渡さない。**
 * 渡せば「本文を書く」余地が生まれ、数字を言い直す余地が生まれる。
 * 渡すのは**判断に必要な事実だけ**で、返させるのは**語彙のIDだけ**である（D-200）。
 *
 * ここが渡すのは4つ。
 *   1. 見立ての結果（点数と根拠つき）
 *   2. 内容ごとの材料の量（件数・長さ・短い値の有無…）
 *   3. **選べる表現の一覧**（可否表と材料を先に通したもの）
 *   4. 規則版の Brief（たたき台）
 *
 * **3が肝心である。** 選べないものを見せて「選ぶな」と書くより、見せないほうが確実。
 */

import type { Project } from "../schema.ts";
import type { Analysis } from "./analysis.ts";
import { PRIMARY_STRENGTHS } from "./analysis.ts";
import type { ContentId } from "./system/index.ts";
import { getContent, getPresentation } from "./system/index.ts";
import { materialsOf } from "./materials.ts";
import { LABEL } from "./playbook.ts";
import { candidatesFor } from "./brief-rules.ts";
import { EMPHASES, type DesignBrief } from "./brief.ts";

export const SYSTEM = `あなたは、BtoB製造業のウェブサイトの**情報設計**を判断します。

【あなたが決めること】
・その会社の最大の強み（primaryStrength）と2番目（secondaryStrength）を、候補から選ぶ
・どの情報を先に見せるか（blocks の並び順）
・それぞれの情報を、どの表現で見せるか（presentation）
・それぞれの情報の強さ（emphasis）

【あなたが決めないこと】
・文章を書くこと
・数字を言い直すこと、まとめること、四捨五入すること
・情報を減らすこと（**渡された内容は必ず全部 blocks に入れる**）
・新しい表現や新しい語彙を作ること
・HTMLやCSSを書くこと

【守ること】
・返すのは**JSONひとつだけ**。説明も前置きも書かない
・値は、渡された一覧の中の**IDそのまま**。言い換えない
・presentation は、その内容の「選べる表現」に**載っているものだけ**
・blocks は、渡された内容を**ひとつ残らず**含める。順番だけ入れ替える
・emphasis は ${EMPHASES.join(" / ")} の3つだけ
・**規則版と同じ判断でよいなら、そのままでよい。** 変えること自体は目的ではない

【返す形】
{"primaryStrength":"...","secondaryStrength":"...","blocks":[{"content":"...","presentation":"...","emphasis":"..."}]}`;

/** 材料の量を、判断できる日本語にする。**生データは渡さない** */
function materialLine(project: Project, a: Analysis, content: ContentId): string {
  const m = materialsOf(project, content, a.hasRealPhotos);
  const bits = [`件数${m.count}`, `文字数${m.length}`];
  if (m.hasShortValue) bits.push("短く言い切れる値あり");
  if (m.hasPair) bits.push("対になる2値あり");
  if (m.hasQuote) bits.push("鍵括弧つきの発言あり");
  if (m.hasSteps) bits.push("順序のある記述あり");
  if (m.hasRealPhotos) bits.push("実写あり");
  return bits.join("・");
}

export function userPrompt(
  project: Project, a: Analysis, rules: DesignBrief, onTop?: Set<ContentId>,
): string {
  const contents = rules.blocks.map((b) => b.content);
  const cands = candidatesFor(project, a, contents);
  const lines: string[] = [];

  lines.push("## この会社の見立て（聞き取りから機械的に出したもの）\n");
  lines.push(`最大の強み（規則版の判定）：${rules.primaryStrength}（${LABEL[rules.primaryStrength]}）… ${a.primaryWhy}`);
  lines.push(`2番目（規則版の判定）：${rules.secondaryStrength}（${LABEL[rules.secondaryStrength]}）… ${a.secondaryWhy}`);
  lines.push("");
  lines.push("何で見せる会社か（強い順・0点のものは材料が無い）：");
  for (const s of a.strands) lines.push(`  ${String(s.score).padStart(3)}  ${s.id}　${s.why}`);
  lines.push("");
  lines.push(`最大の強みに選べる候補：${PRIMARY_STRENGTHS.join(" / ")}`);
  lines.push("**根拠が無いものは選ばないこと。根拠が無ければ unknown を選ぶ。**");
  lines.push("");

  lines.push("## 出す内容と、選べる表現\n");
  lines.push("**選べる表現は、可否表と材料の両方を通したものだけを載せています。**");
  lines.push("ここに無い表現は選べません（選んでも検査で落ちて、規則版に戻ります）。\n");
  for (const c of cands) {
    /**
     * **どれがトップページに出るか**（D-260）。
     * 判断が効くのはトップだけ（D-225）。効かない場所に手を入れさせても費用が増えるだけ。
     */
    const where = !onTop ? "" : onTop.has(c.content) ? "　【トップページに出ます】" : "　【下層ページのみ】";
    lines.push(`### ${c.content}（${getContent(c.content).label}）${where}`);
    lines.push(`　材料：${materialLine(project, a, c.content)}`);
    if (c.usable.length === 0) {
      lines.push("　選べる表現：（材料が足りないため、規則版に任せます）");
    } else {
      for (const p of c.usable) lines.push(`　・${p}　${getPresentation(p).label}：${getPresentation(p).note}`);
    }
    lines.push("");
  }

  lines.push("## 規則版のたたき台\n");
  lines.push("```json");
  lines.push(JSON.stringify({
    primaryStrength: rules.primaryStrength,
    secondaryStrength: rules.secondaryStrength,
    blocks: rules.blocks.map((b) => ({ content: b.content, presentation: b.presentation, emphasis: b.emphasis })),
  }, null, 2));
  lines.push("```\n");
  lines.push("この会社にとって**何が重要か**を考えて、必要なら順番・表現・強さを変えてください。");
  lines.push("**内容は減らさないでください。** 変える必要がなければ、たたき台のまま返して構いません。");
  if (onTop) {
    lines.push("");
    lines.push("**【下層ページのみ】と書かれた内容への判断は、画面には出ません。**");
    lines.push("そのページには、そのページ自身の筋があるためです。**たたき台のまま返してください。**");
  }
  /**
   * **情報の少ない表現に乗り換えない**（D-259）。
   * 実測では、AIが変えた5箇所が5箇所とも情報の少ないほうへ動いた。
   * 検査でも止めるが、**先に伝えておけば、落ちる判断を作らせずに済む。**
   */
  lines.push("");
  lines.push("**画面に出る情報が減る乗り換えは、検査で落ちます。**");
  lines.push("たとえば、設備を「カードの格子」から「箇条書き」に変えるとメーカー名が消え、");
  lines.push("「大きな数字」に変えると総台数の1語になり、型番が残りません。");
  lines.push("**強さ（emphasis）を下げるのは構いません。** 制限しているのは表現のほうです。");
  lines.push("JSONだけを返してください。");
  return lines.join("\n");
}
