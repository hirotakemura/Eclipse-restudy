/**
 * KOBO — 掲載文の検査（D-466）
 *
 * 掲載文（AIの下書きでも、人が書いた文でも）を、**出す前に機械で見る。**
 *
 *   error（止める） … 取材の言葉にない数字・型番・認証・社内語（`verify.ts` と同じ照合）
 *   warn（人に見せる）… 文体の混在・字数の超過・社外に出す必要のない話
 *
 * **事実の照合は `verify.ts` をそのまま使う。** ページ本文の生成と、欄の掲載文とで
 * 照合の仕方が別々だと、片方だけ直ってずれる（D-197）。
 * 出典は `buildSourceText(project)`——**掲載文そのものは出典に入っていない**（D-401⑦）ので、
 * 掲載文が掲載文を根拠にすることはできない。
 *
 * warn を止めないのは、**機械では言い切れない**からである。
 * 「先代」は代表挨拶では正当に出てくるし、体言止めは事例の件名では正しい。
 * **誤検知で止まる道具は、いずれ切られる**（`internal-language.ts` と同じ考え）。
 */
import type { Project } from "./schema.ts";
import { verifyDraft, type Finding } from "./verify.ts";
import { styleOf, COMMON_RULES } from "./webtext-style.ts";

/**
 * **です・ます以外の文末。**「〜である」「〜した」「〜いる」などで終わる文。
 * 体言止め（「〜の部品。」）はここに当たらない——事例の件名では正しい書き方なので止めない。
 */
const PLAIN_ENDING = /(である|だ|した|する|している|いる|ある|ない|った|れた|せた|いた|えた|きた|できる|なる|なった|られる)[」』）]?$/;
/**
 * **先に、です・ますの文を外す。**
 * ★最初はこれが無く、「〜ました」「〜でした」を末尾の「した」で拾って、
 * **です・ます調の文を「である調」と数えていた**（松原精機で4件の誤検知）。
 */
const POLITE_ENDING = /(です|ます|ました|ません|でした|ましょう|ください|ございます)[」』）]?$/;
/**
 * **「」の中は数えない。** お客様や代表の言葉の引用は、話されたとおりが正しい
 * （「図面に書いてないところに気づいてくれる」を、です・ますに直すと引用でなくなる）。
 */
const unquote = (s: string): string => s.replace(/「[^」]*」/g, "「」").replace(/『[^』]*』/g, "『』");

/** 社外に出す必要のない話。**言葉で拾うので、人が最後に見る**（warn） */
const OFF_SITE: [RegExp, string][] = [
  [/売上(の)?(構成|比率|比)|約?\d+割/, "売上の構成比"],
  [/家族経営|承継|引退|親族/, "家族・親族の事情"],
  [/お前ら|お前たち/, "社内向けの呼びかけ口調"],
  [/とのこと|と聞い(た|て)/, "取材の場のやりとり"],
];

const sentencesOf = (text: string): string[] =>
  text.split(/(?<=[。！？])/).map((s) => s.replace(/【[^】]*】/g, "").trim()).filter(Boolean);

const contextOf = (text: string, found: string): string => {
  const i = text.indexOf(found);
  return i < 0 ? found : text.slice(Math.max(0, i - 12), i + found.length + 12);
};

export function checkWebText(key: string, text: string, project: Project): Finding[] {
  const findings: Finding[] = [...verifyDraft(text, project, { forPublish: true })];
  const style = styleOf(key);

  /** 文体。**です・ますの文が1つでもある欄で、である調が混じる**のを拾う */
  const sentences = sentencesOf(text.replace(/\n+/g, ""));
  const plain = sentences.filter((s) => {
    const body = unquote(s).replace(/[。！？]$/, "");
    return !POLITE_ENDING.test(body) && PLAIN_ENDING.test(body);
  });
  if (plain.length) {
    findings.push({
      severity: "warn", kind: "tone", found: plain[0]!.slice(-16),
      context: plain[0]!, message: `${COMMON_RULES.tone}。である調の文が ${plain.length}つあります`,
    });
  }

  /** 字数。**全角換算**（空白と【見出し】は数えない） */
  const len = [...text.replace(/【[^】]*】/g, "").replace(/\s+/g, "")].length;
  if (style && len > style.maxChars) {
    findings.push({
      severity: "warn", kind: "length", found: `${len}字`,
      context: text.slice(0, 30), message: `この欄は ${style.maxChars}字までが目安です（${style.role}）`,
    });
  }

  for (const [re, what] of OFF_SITE) {
    const m = re.exec(text);
    if (!m) continue;
    findings.push({
      severity: "warn", kind: "off-site-topic", found: m[0],
      context: contextOf(text, m[0]), message: `社外に出す必要のない話かもしれません（${what}）`,
    });
  }
  return findings;
}
