/**
 * KOBO — 掲載文の型（D-466）
 *
 * 【なぜ要るか】
 * 取材の言葉は「聞くための欄」の答えで、**画面に出す文ではない**（D-401）。
 * 実測（松原精機）——画面に文を出せる24欄のうち**21欄が取材の言葉のまま**で、
 *   ・事業内容に「売上構成は自動車部品が約6割…」「家族経営として三代目に承継」
 *   ・文体が **です・ます 7欄／である 3欄／1つの欄の中で混在 5欄**
 *   ・「ステンレスの薄物部品」「複数箇所に断られたのち相談を受けた。」のような短すぎる文
 * が画面に出ていた。**直す人がいても、何に合わせて直すかが決まっていなかった。**
 *
 * ここはその「合わせる先」である。**AIへの指示と、機械の検査と、人の確認が同じ表を見る。**
 * 表が1つなので、どれか1つだけ変わってずれる、が起きない（D-197）。
 *
 * 【ここで決めないこと】
 * **事実は足さない・変えない。** 型が決めるのは言い方（文体・長さ・何を載せないか）だけで、
 * 数字や固有名詞の正しさは `verify.ts` の照合が見る（取材の言葉が出典）。
 */
import { WEB_TEXT_PATHS } from "./schema.ts";
import { getTypeRole } from "./design/system/typography.ts";

export type WebTextShape = (typeof WEB_TEXT_PATHS)[number];

export interface WebTextStyle {
  /** 画面のどこに、何として出る文か。**書く人（AIも人も）が最初に読む** */
  role: string;
  /**
   * 全角換算の上限。**越えたら人に見せる**（止めはしない）。
   * 最初の画面・山に出る2欄は、段の上限（`TYPE_ROLES`）から引く——数字を2箇所に書かない。
   * それ以外は**暫定**で、実画面を見て決め直す（撤回の条件は D-466）。
   */
  maxChars: number;
  /** その欄だけで気をつけること（全欄共通のものは `COMMON_RULES`） */
  notes: string[];
}

/** 最初の画面の見出しと、強み・技術の山。**段の上限そのもの**を使う */
const STATEMENT_MAX = getTypeRole("statement").maxChars;

/**
 * **全欄に共通の決まり。** サイト全体で1つの会社が話しているように読めること。
 * `drop` は「載せない話」。取材では聞くが、発注を考えている人には要らない。
 */
export const COMMON_RULES = {
  tone: "です・ます調でそろえる（体言止めは可）",
  facts: "取材の言葉にない数字・固有名詞・実績を足さない。言い換えはしてよいが、事実は変えない",
  exaggeration: "誇張しない（「業界トップ」「最高品質」のような、取材の言葉にない評価を書かない）",
  drop: [
    "売上の構成比や金額",
    "家族・親族の事情（承継・引退・誰が何代目か）",
    "社員個人の名前",
    "社内向けの呼びかけ口調（「お前ら」など）",
    "取材の場のやりとり（「〜と聞いた」「〜とのこと」）",
  ],
} as const;

export const WEB_TEXT_STYLE: Record<WebTextShape, WebTextStyle> = {
  "basics.businessSummary": {
    role: "最初の画面の見出し。**何をしている会社か**を一文で言う",
    maxChars: STATEMENT_MAX,
    notes: ["1文にする", "売上の比率・沿革・社長の経歴はここに書かない（会社概要・代表挨拶が持つ）"],
  },
  "strengths.wonAfterOthersDeclined": {
    role: "強み・技術のページの山。**他社に断られた仕事を受けた**ことを、事実だけで言い切る",
    maxChars: STATEMENT_MAX,
    notes: ["引用（「ビビって割れるから無理」など）は取材の言葉のまま残してよい"],
  },
  "strengths.followUpFindings": {
    role: "強み・技術の「どうやって受けているか」。工程ごとの工夫を説明する",
    maxChars: 400,
    notes: ["【…】の見出しは消さない（画面の箇条書きがこの見出しで組まれている）"],
  },
  "strengths.workOthersAvoid": {
    role: "同業が敬遠する仕事を、当社は受けている、という説明",
    maxChars: 200,
    notes: ["「どうやって受けているか」と同じ文を繰り返さない"],
  },
  "strengths.hardestJob": {
    role: "技術的に最も難しかった仕事。何が難しく、どう解いたか",
    maxChars: 200,
    notes: [],
  },
  "strengths.praiseFromClients": {
    role: "お取引先からいただく言葉。その言葉と、そう言われる理由",
    maxChars: 200,
    notes: ["お客様の言葉は「」で残す"],
  },
  "executive.vision": {
    role: "代表挨拶。5年後にどういう会社でありたいか",
    maxChars: 300,
    notes: ["代表の一人称で書く"],
  },
  "executive.messageToStaff": {
    role: "代表挨拶。社員に伝えていること（社外の人が読む前提で）",
    maxChars: 300,
    notes: ["代表の一人称で書く", "口調の強い引用は、意味を残して言い直す"],
  },
  "general.reasonChosen": {
    role: "選ばれている理由",
    maxChars: 200,
    notes: [],
  },
  "general.idealCustomer": {
    role: "こういう方にご相談いただきたい、という案内",
    maxChars: 200,
    notes: [],
  },
  "general.offerings[].detail": {
    role: "サービス1つの説明",
    maxChars: 150,
    notes: [],
  },
  "cases[].partDescription": {
    role: "加工事例1件の「どんな部品か」。件名の下に出る",
    maxChars: 60,
    notes: ["体言止めでよい", "材質・形状・大きさなど、取材の言葉にある特徴を落とさない"],
  },
  "cases[].challenge": {
    role: "加工事例1件の「ご相談の内容」。何に困っていたか",
    maxChars: 150,
    notes: ["取引先の社名は書かない"],
  },
  "cases[].solution": {
    role: "加工事例1件の「対応した内容」。どう解いたか",
    maxChars: 250,
    notes: ["ほかの事例と同じ文にしない"],
  },
  "cases[].result": {
    role: "加工事例1件の「結果」",
    maxChars: 150,
    notes: ["精度などの数字は取材の言葉のとおりに書く"],
  },
};

/** `cases[2].solution` → その欄の型 */
export const styleOf = (key: string): WebTextStyle | undefined =>
  WEB_TEXT_STYLE[key.replace(/\[\d+\]/g, "[]") as WebTextShape];
