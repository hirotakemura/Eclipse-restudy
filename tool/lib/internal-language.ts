/**
 * KOBO — 社内語の検出
 *
 * **なぜ要るのか。**
 * `verify.ts` が見ているのは「生成した原稿が、案件データから外れていないか」だけだ。
 * つまり検証の向きが一方向で、**案件データそのものが顧客に出せる文章か**は誰も見ていない。
 *
 * 第1回のレビューで、公開してよいと判定したサイトに次が出ていた：
 *   設備一覧　「ABC123」「型番は社長の口頭記憶のため、現地で銘板と照合して確定させること」
 *   設備一覧　「メーカー・型番とも未確認」
 *   強み・技術「具体的な数値は工場長に要確認。」
 *
 * いずれも `{{要確認}}` が付いていない。だから公開前の関所を素通りした。
 * **付け忘れたマークは、マークを探しても見つからない。** 言葉のほうを見る（D-169）。
 *
 * 止める（block）のは、顧客向けの文章に出た時点で確実に事故になるものだけにする。
 * 迷うものは warn にして、人間に見せる。**誤検知で止まる道具は、いずれ切られる。**
 */

export type InternalSeverity = "block" | "warn";

export interface InternalHit {
  severity: InternalSeverity;
  found: string;
  why: string;
  index: number;
}

interface InternalRule {
  severity: InternalSeverity;
  pattern: RegExp;
  why: string;
}

const RULES: InternalRule[] = [
  // ── 確実に事故になるもの ───────────────────────────
  {
    severity: "block",
    pattern: /\{\{[^}]*\}\}/g,
    why: "テンプレートの穴が埋まっていません",
  },
  {
    severity: "block",
    pattern: /(?:要確認|未確認|確認中|確認待ち)/g,
    why: "社内の確認メモです。お客様のサイトに出す言葉ではありません",
  },
  {
    severity: "block",
    pattern: /(?:口頭記憶|銘板と照合|取材メモ|聞き取りメモ|文字起こし)/g,
    why: "取材の作業メモが本文に混ざっています",
  },
  {
    severity: "block",
    pattern: /(?:確認|照合|確定|記載|追記|差し替え|反映|修正)(?:させる|して|した上で|のうえ|の上)?こと(?:。|、|\s|$)/g,
    why: "社内向けの作業指示（「〜すること」）です",
  },
  {
    severity: "block",
    pattern: /(?:確認後に|確認のうえ|確認の上)(?:記載|追記|反映|差し替え)|(?:後日|追って)(?:記載|確認|追記|連絡|差し替え)|記載予定|後で(?:直す|書く|埋める)/g,
    why: "制作の進行メモです。公開する文章ではありません",
  },
  {
    severity: "block",
    pattern: /\b(?:TODO|TBD|FIXME|WIP|N\/A)\b/gi,
    why: "作業用の書き置きが残っています",
  },
  {
    severity: "block",
    pattern: /(?:ダミー|プレースホルダ|サンプルテキスト|差し替え前提|仮の(?:画像|写真|文言|数値|型番|テキスト|社名|原稿))/g,
    why: "仮のものが本番として出ています",
  },
  {
    severity: "block",
    pattern: /lorem\s+ipsum/gi,
    why: "仮のものが本番として出ています",
  },
  {
    severity: "block",
    // 仮置きの型番。ABC123 / XYZ-99 のたぐい
    pattern: /\b(?:ABC|XYZ|AAA|ZZZ|SAMPLE|DUMMY|TEST|FOO|BAR)-?\d{2,}\b/gi,
    why: "仮置きの型番に見えます。設備の型番は銘板で確認したものだけを書きます",
  },
  {
    severity: "block",
    pattern: /[○◯〇△]{2,}/g,
    why: "伏字が残っています",
  },

  // ── 人間に見せる（止めはしない） ─────────────────────
  {
    severity: "warn",
    pattern: /未定/g,
    why: "「未定」がお客様のサイトに出ています。書かないか、埋めるかのどちらかです",
  },
  {
    severity: "warn",
    pattern: /(?:と述べ(?:ている|た)|と話し(?:ている|た)|との回答|との認識|とのこと)/g,
    why: "取材メモの地の文（第三者が報告する書き方）のまま出ている可能性があります",
  },
  {
    severity: "warn",
    pattern: /(?:工場長|社長|先方|現場)に(?:聞く|確認|問い合わせる)/g,
    why: "社内で誰に聞くかの話が、本文に残っている可能性があります",
  },
];

/** 前後25文字を添える。どこの話か分からない指摘は直せない */
const contextOf = (text: string, index: number, len: number) =>
  text
    .slice(Math.max(0, index - 25), Math.min(text.length, index + len + 25))
    .replace(/\s+/g, " ");

/**
 * 文章に含まれる社内語を返す。
 *
 * @param text 調べる文章（HTMLならタグを落としてから渡す）
 */
export function findInternalLanguage(text: string): InternalHit[] {
  const hits: InternalHit[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const found = m[0];
      const key = `${rule.why}:${found}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        severity: rule.severity,
        found,
        why: rule.why,
        index: m.index ?? 0,
      });
    }
  }
  return hits.sort((a, b) => (a.severity === b.severity ? a.index - b.index : a.severity === "block" ? -1 : 1));
}

/** HTMLから、人の目に見える文字だけを取り出す */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
}

export const contextFor = contextOf;
