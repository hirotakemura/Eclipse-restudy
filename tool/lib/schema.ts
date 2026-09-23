/**
 * KOBO — ヒアリング項目の定義（単一の正）
 *
 * このファイルから、フォームUI・バリデーション・原稿生成プロンプト・
 * Astroテンプレートの型がすべて導出される。仕様を二重管理しないこと。
 *
 * 出典: docs/06-取材台本.md の6ブロック構成に対応する。
 * 台本を変更したら、このファイルも必ず合わせて変更する。
 */

// 見た目の型は `lib/theme.ts` が正。**ここに書き写さない**（D-197）
import type { Theme } from "./theme.ts";
// 同じ理由で、Design Brief の型も本体から取る
import type { StoredBrief } from "./design/brief.ts";

// ── 共通型 ────────────────────────────────────────────────

/** サイトの役割。ブロック2の回答から決まり、生成するページ構成を左右する */

export type SiteGoal =
  | "集客" // 問い合わせの絶対数を増やす
  | "選別" // 割に合う仕事だけを呼び込む（来てほしくない問い合わせを減らす）
  | "採用" // 求職者向け
  | "信用構築"; // 既存の商談で「会社を調べられたとき」に効かせる

/**
 * 各フィールドは「誰が見ても同じ意味になる」粒度で持つ。
 * 自由記述は原稿生成の素材、構造化データは表やSEOの素材になる。
 */

// ── ブロック1：会社の基本 ──────────────────────────────────

export interface CompanyBasics {
  /** 正式名称。「株式会社」の位置まで正確に */
  name: string;
  nameKana?: string;
  representative: string;
  /** 何代目か。事業承継の文脈は代表挨拶で効く */
  generation?: string;
  founded: string;
  capital?: string;
  employees: number;
  averageAge?: number;
  address: string;
  tel: string;
  /** 電話の受付時間。BtoBは電話で相談が来る（D-173） */
  receptionHours?: string;
  currentUrl?: string;
  /**
   * **ロゴ画像に社名が入っているか**（D-462）。
   * 入っていなければ、ヘッダーでロゴの横に会社名を文字で出す（D-460）。
   * **聞けていないうちは出さない**——入っているロゴで出すと、社名が二重に見える。
   */
  logoIncludesName?: boolean;
  /** 主力事業と売上比率。自由記述 */
  businessSummary: string;
  /** 主要取引先の「業界」。社名が出せなくても業界は聞く */
  clientIndustries: string[];
  history?: { year: string; event: string }[];
}

// ── ブロック2：引き合いの実態 ★サイト設計の根拠 ─────────────

export interface InquiryReality {
  /** 現在の月間問い合わせ件数。「月1〜2件」のような幅のある回答をそのまま持つ */
  monthlyInquiries: string;
  /** 流入経路。実態を聞く */
  channels: string[];
  /** 直近の新規取引がどう始まったか */
  recentNewClientOrigin: string;
  /** 失注理由。価格/納期/技術/信用 のどれが多いか */
  lostDealReasons: string[];
  /** 最も利益率の高い仕事。本当に増やしたい仕事が分かる */
  mostProfitableWork: string;
  /** もっと受けたいのに来ていない仕事 */
  wantMoreOf: string;
  /** 来てほしくない問い合わせ。サイトを「選別」装置にするための核心 */
  wantLessOf: string;
  /**
   * 受注の先行きへの不安。代表挨拶とトップページで効く。
   * 一般的に聞いても出てこない。地域の具体的な動きを調べて、こちらから振ること（docs/06）
   */
  outlookConcern: string;

  /** 上記から決まるサイトの役割。複数可 */
  goals: SiteGoal[];
  /** 想定検索キーワード。商談前調査と取材から確定する */
  targetKeywords: string[];
}

// ── ブロック3：技術・設備 ★SEOの本体 ───────────────────────

export interface Equipment {
  /** メーカー名。例: DMG MORI */
  maker: string;
  /** 型番。例: NTX2000。型番そのものが検索される */
  model: string;
  count: number;
  note?: string;
}

export interface Capability {
  /** 対応材質。例: ステンレス, チタン, インコネル */
  materials: string[];
  /**
   * 加工法・工法。**自社の設備で行っているものだけ**。例: 5軸加工, ワイヤーカット
   *
   * **外注と混ぜない**（D-424）。実案件で45件すべてが並び、切削の会社の対応可能範囲に
   * 鋳造・射出成形・鍛造まで出ていた。設備一覧はマシニングとNC旋盤の2種類なので、
   * **書いてあることと、できることが合っていなかった。**
   */
  processes: string[];
  /**
   * 協力会社に依頼している工程。**空でよい。**
   *
   * 載せる価値はある——「熱処理と表面処理まで一括で頼める」はBtoBの判断材料である。
   * ただし**自社設備と同じ行に置かない。** 同じ行に置くと、設備を持っていると読める。
   */
  outsourcedProcesses?: string[];
  maxSize?: string;
  minSize?: string;
  /** 対応精度。例: ±5μm */
  tolerance?: string;
  /** 対応ロット。例: 1個〜 */
  lotSize?: string;
  /**
   * 標準納期。**最短と分けて持つ**（D-452）。
   *
   * 1つの欄で「標準納期と最短納期の両方を聞く」としていたため、
   * 「標準7日。急ぎの場合は最短3日」という**2つの値が1つの文**で入っていた。
   * その結果、値が「短く言い切れるもの」と判定されず、
   * **大きな数字の帯も、最初の画面の数字も出なかった。**
   * 機械で選ぼうとすると「最短納期」の札に「標準7日」が出る（実測）。**欄のほうを分ける。**
   */
  standardLeadTime?: string;
  /** 最短納期。**最短だけ**を入れる（標準は `standardLeadTime`） */
  shortestLeadTime?: string;
  /** 試作と量産の比率 */
  prototypeRatio?: string;
  equipment: Equipment[];
  /** 認証・資格。例: ISO9001, JIS, 特殊工程 */
  certifications: string[];
  /** 稼働体制。例: 2交代, 24時間, 土日対応可 */
  operatingHours?: string;
}

/** 強みは社長が自分では言語化できない。質問で引き出したものをそのまま持つ */
export interface Strengths {
  /** 他社に断られた案件で、受けられたもの。強みが最も鮮明に出る */
  wonAfterOthersDeclined: string;
  /** 顧客からよく言われる褒め言葉。社長の自己認識とのズレが宝 */
  praiseFromClients: string;
  /** 同業がやりたがらないが、得意な仕事 */
  workOthersAvoid?: string;
  /** 不良率。数字が良ければ強力な武器 */
  defectRate?: string;
  /** 技術的に最も難しかった仕事 */
  hardestJob?: string;

  /**
   * 台本の定型質問では出てこなかったが、追い質問で判明した強み。
   * 第1回モック取材では「治具の内製」がここで出た。取材の価値の大半がここにある（docs/15）
   */
  followUpFindings?: string;
}

// ── ブロック4：加工事例 ★最も問い合わせに繋がる ─────────────

export interface CaseStudy {
  title: string;
  /** 顧客の業界。社名が出せなくても「自動車部品メーカー様」でよい */
  clientIndustry: string;
  /** 部品・製品の概要 */
  partDescription: string;
  /** 相談されたときの課題。他社で断られた/精度が出ない/コストが合わない等 */
  challenge: string;
  /** どう解決したか。工程の工夫・治具の内製・材料の提案 */
  solution: string;
  /** 結果。数字があれば必ず数字で */
  result: string;
  materials?: string[];
  processes?: string[];
  /** 数量・ロット。「試作3個」「月200個」（D-172） */
  quantity?: string;
  /** 納期。「図面受領から10日」（D-172） */
  leadTime?: string;
  /** 他社が断った理由。反り／割れ／歪み／穴位置／公差（D-172） */
  declinedReason?: string;
  /** 秘密保持で伏せる必要がある項目のメモ。**社内向け**（D-170） */
  confidentialityNotes?: string;
}

// ── ブロック5：採用・代表 ──────────────────────────────────

export interface Recruitment {
  isHiring: boolean;
  /** 不足している職種 */
  neededRoles: string[];
  /** 直近で採用できた人の流入経路 */
  recentHireOrigin?: string;
  /**
   * 若手の定着状況。**社内向け**（採用ページを作るべきかの判断材料）。
   * そのままサイトに載せない（D-170）
   */
  retentionNotes?: string;
  /** 訴求できる待遇・環境 */
  workplaceAppeal?: string[];
  /** 労働条件。求人票・就業規則から転記する（D-171） */
  terms?: RecruitmentTerms;
}

/**
 * 労働条件。**取材の場で口頭で取る項目ではない。**
 * ここが空のまま採用ページを作ると、求人として成立しない。
 */
export interface RecruitmentTerms {
  employmentType?: string;
  salary?: string;
  workingHours?: string;
  holidays?: string;
  allowances?: string[];
  insurance?: string;
  qualifications?: string;
  selection?: string;
  documents?: string;
  contact?: string;
  factoryTour?: string;
}

export interface ExecutiveMessage {
  /** 5年後、会社をどうしていきたいか */
  vision: string;
  /** 社員に一番伝えたいこと */
  messageToStaff?: string;
}

// ── ブロック6：制作条件 ────────────────────────────────────

export interface ProductionTerms {
  /** 公開希望日 */
  targetLaunchDate?: string;
  /** 出せない情報。取引先名/価格/特定の技術など */
  ngItems: string[];
  photo: {
    /** 既存の使える写真があるか */
    hasExisting: boolean;
    /** プロ撮影の要否 */
    professionalShootNeeded: boolean;
    shootDate?: string;
  };
  /** ドメイン。顧客名義で取得する方針（docs/10 第2章） */
  domain: {
    /** 既存ドメインの有無 */
    existing?: string;
    /** 新規取得する場合の希望 */
    desired?: string;
    /** 名義は必ず顧客。代行の要否だけ持つ */
    registrationDelegated: boolean;
    /**
     * そのドメインでメールを使っているか。
     * **DNS切替でMXを引き継ぎ損ねると、会社のメールが止まる。**
     * サイトが数時間見えないことより重大な事故になる
     */
    mailInUse?: boolean;
    /** メールをどこで受けているか。分かる範囲で */
    mailProvider?: string;
  };
  /** 問い合わせの通知先メールアドレス */
  inquiryNotifyEmail: string;
  /**
   * 【2026-09-13 廃止】運用プラン（月額5/10/15万）と WordPress 指定。
   *
   * 月額の保守料をいただかない方針に変えたため、運用プランという概念自体が無くなった（D-056）。
   * WordPress も現段階では対応しない方針（D-085）。
   * 取材で聞く必要がなくなったので、フォームからも外した。
   */
}

// ── 写真 ──────────────────────────────────────────────────

/**
 * 写真の置き場所。**先に置き場所を決めてから集める。**
 *
 * 「とりあえず写真をください」と頼むと、何に使うか分からないまま
 * 撮りためた画像が大量に届き、結局どれも使えない。
 * サイトのどこに出るかを決めてから、必要な枚数だけお願いする。
 */
export type PhotoCategory =
  | "外観" //       事業所・社屋。トップと会社概要に出る
  | "代表者" //     代表挨拶・会社概要
  | "工場・設備" // 設備一覧・強み。設備の現物は信用に直結する
  | "加工事例" //   各事例ページ。**最も問い合わせに繋がる**
  | "働く人" //     採用ページ
  | "ロゴ" //       ヘッダー
  | "その他";

export interface SitePhoto {
  /** projects/<案件ID>/photos/ の中のファイル名 */
  file: string;
  category: PhotoCategory;
  /** 写真に添えるひとこと。無くてよい */
  caption?: string;
  /**
   * category が「加工事例」のときだけ使う。何件目の事例の写真か（1始まり）。
   * 確認画面でお客様に見せている「N件目」と同じ番号
   */
  caseNo?: number;
}

// ── 案件データ全体 ────────────────────────────────────────

/**
 * 汎用フォーム（198,000円の商品）で使う項目。
 * 製造業フォームの capability / strengths に相当するものを、業種を問わない形に置き換えたもの。
 */
export interface GeneralBusiness {
  /** 対応できる地域。出張の可否を含む */
  serviceArea: string;
  /** 主なサービス・商品 */
  offerings: { name: string; detail: string; price?: string }[];
  /** どういう顧客が多いか */
  idealCustomer: string;
  /** 同業と比べてどこが違うか */
  reasonChosen: string;
}

export interface Project {
  /** 案件ID。ディレクトリ名になる */
  id: string;

  /**
   * どのフォームで聞き取るか。案件の商品を決める。
   * 省略時は製造業向けとして扱う（既存案件との互換のため）。
   *
   * **汎用フォームで製造業の案件を受けないこと。** 対応材質・精度・設備型番といった
   * 製造業の検索を受け止める項目が汎用フォームには無く、技術ページが作れない（D-035）。
   */
  formSet?: "manufacturing" | "general";
  /** 入力の進捗。対面で埋めるため、途中保存できることが前提 */
  status: "hearing" | "generating" | "reviewing" | "published" | "archived";
  hearingDate?: string;
  contractedAt?: string;
  /** 聞き取り内容をお客様に確認いただいた日時 */
  reviewedAt?: string;

  /**
   * 第2回取材（工場・技術のご担当）の予定と実績。
   *
   * **取材は2回に分ける**（D-147）。第1回で埋まらない項目があるのは前提で、
   * 「いつ・誰に」を決めないまま第1回を終えると、そのまま止まる。
   */
  secondVisit?: { date?: string; attendees?: string };

  /**
   * 未確認の項目を、誰にいつ聞くか。キーは項目のパス。
   *
   * **取材は2回に分ける（D-147）。** 第1回で埋まらない項目が出るのは前提で、
   * それを第2回までに誰へ聞くかを決めておくのが工程。
   * マークを押せるだけで、後日の確認を支える仕組みが無かった（D-150）。
   */
  unconfirmedPlan?: Record<string, string>;

  /**
   * サイトの見た目。配色・書体・雰囲気・型（方向性）を案件データとして持つ。
   *
   * **テンプレートは1つしか持たない**（D-096）ので、見た目の違いはここで出す。
   * 選択肢の中身は `lib/theme.ts`（単一の正）。
   *
   * **ここは `lib/theme.ts` の `Theme` をそのまま使う**（D-197）。
   * 以前はこの場所に `{ palette, font, mood, layout }` と**書き写して**いたため、
   * D-141 で `layout` を `nav`＋`hero` に分けたあとも古い型が残り、
   * `textSize` `sections` `headings` `tables` `direction` は型に無いままだった。
   * 書き写した型は、必ず本体から遅れる。
   */
  theme?: Partial<Theme>;

  /**
   * 情報の見せ方の判断（Design Brief）。**あれば使い、無ければ規則版で決まる。**
   *
   * ここに保存しておくことで、**書き出しの最中にAIを呼ばなくて済む**。
   * 工場のWi-Fiが切れていても、同じデータからは毎回同じサイトが建つ。
   *
   * **型は `lib/design/brief.ts` が単一の正。ここに書き写さない**（D-197）。
   */
  designBrief?: StoredBrief;

  /**
   * お預かりした写真。
   *
   * **写真が無くてもサイトは建つ**（D-099）。ただし「事業所や社長の写真は載せたい」は
   * 必ず言われる。**写真待ちで公開を止めない構造は保ったまま、置き場所だけ先に決めておく。**
   */
  photos?: SitePhoto[];
  /**
   * 生成ビジュアルの方針と注文書（第9段階・`npm run visual`）。
   * **書き出しでは作らない。** 保存されたものを読むだけで、画像が無ければ何も起きない。
   */
  visualPlan?: import("./design/generated-brief.ts").StoredVisualPlan;

  basics: CompanyBasics;
  inquiry: InquiryReality;
  capability: Capability;
  strengths: Strengths;
  cases: CaseStudy[];
  /** 汎用フォームの案件でのみ使う */
  general?: GeneralBusiness;
  recruitment?: Recruitment;
  executive?: ExecutiveMessage;
  terms: ProductionTerms;

  /**
   * 取材で聞いたが、その場で確認できなかった項目のパス（例: "capability.tolerance"）。
   * 単なる未入力と明確に区別する。
   *
   * ここに入っている項目について、生成側は数値・型番・固有名詞を絶対に補完してはならない。
   * 必ず NEEDS_REVIEW_MARKER を残し、人間が確認するまでビルドを通さない（D-013）。
   */
  unconfirmed?: string[];

  /**
   * 未確認項目について、社長が実際に何と言ったかのメモ（パス → 生の発言）。
   *
   * 第1回モック取材で、精度を聞いたところ「ミクロン単位ですね」という答えだった。
   * これは公差値ではないので値としては記録できないが、**この発言自体は捨ててはいけない。**
   * 工場長への確認時に「社長はミクロン単位とおっしゃっていました」と言えるかどうかで、
   * 確認の精度が変わる。
   *
   * なお、ここに入った発言を原稿に転記してはならない。「ミクロン単位の精度」は
   * BANNED_PHRASES と同種の無内容な表現であり、検索でも一件も拾われない。
   */
  unconfirmedNotes?: Record<string, string>;

  /**
   * **Web掲載用の文章**（第10段階①）。キーは項目のドットパス。
   * **既存の文章欄（＝取材原文）とは別物**で、無ければ原文がそのまま出る。
   */
  webText?: Record<string, WebText>;

  /** 取材の録音・文字起こしへの参照。原稿生成の補助素材 */
  transcriptPath?: string;
  /** 商談前調査の結果。提案書の「現状診断」にも使う */
  research?: {
    keywordRankings: { keyword: string; volume?: number; rank?: number | null }[];
    competitors: { name: string; url: string; note?: string }[];
    currentSiteIssues: string[];
  };
}

// ── 掲載用の文章（第10段階①）──────────────────────────────

/**
 * 取材原文とは別に持つ、**Web掲載用の文章**。
 *
 * 【なぜ要るか】
 * 取材入力欄の値は、**取材記録であると同時に掲載文章**だった。1つの欄が2役を負っているので、
 * **整えると記録が消え、記録を守ると走り書きが公開される。**
 * 実測：書き出したページに「…電話を受けてから1時間以内に着けることが多い**とのこと**。」
 * という取材メモの地の文が出ていた（`build-site.mjs` が `△` で拾うが、止めてはいない）。
 *
 * 【どう分けるか】
 * **既存の欄は1文字も変えない。** それが取材原文（raw）であり、単一の正である。
 * 掲載文はここに**ドットパスをキーにして**別に持つ。
 * `{raw, web}` の形にしない——既存の案件・試験データ・設計層のコードが
 * すべて「その欄は文字列である」ことを前提にしており、型を変えると全部が壊れる。
 *
 * 【どこまで効くか】
 * **表示だけ。** 構成・型・モチーフ・素材・山の位置・ページの有無を決める層は、
 * 常に raw を読む（`analysis` / `materials` / `motif` / `architecture` / `sections` /
 * `generated-brief`）。**掲載文を直しても、サイトの組み立ては1つも動かない。**
 */
export interface WebText {
  /** 掲載する文章。**空なら無いのと同じ** */
  text: string;
  /** 誰が書いたか。**AI整形はまだ無い**（第10段階②以降） */
  source?: "human" | "ai";
  /** 読んだ人。**こちらが埋めない** */
  reviewedBy?: string;
  /**
   * 読んだ日時。**ここが空なら、掲載文があっても raw を出す。**
   * 「人が確認するまで公開しない」を、判定ではなく**読み出しの既定**で守る（D-381と同じ考え方）。
   */
  reviewedAt?: string;
}

/**
 * **掲載文を持ってよい欄。**
 *
 * ここに無いパスが `webText` にあれば、読み込みで落とす（`assertWebText`）。
 * **事実の欄を掲載文で上書きさせないため**である——`capability.tolerance` に
 * 掲載文を置けてしまうと、公差を「読みやすく」書き換える道ができる。
 * 許すのは**説明の文章だけ**で、数値・型番・認証・連絡先は1つも入っていない。
 *
 * 配列の要素は `cases[].challenge` のように書く。実際のキーは `cases[0].challenge`。
 */
export const WEB_TEXT_PATHS = [
  "basics.businessSummary",
  "strengths.wonAfterOthersDeclined",
  "strengths.followUpFindings",
  "strengths.workOthersAvoid",
  "strengths.hardestJob",
  "strengths.praiseFromClients",
  "executive.vision",
  "executive.messageToStaff",
  "general.reasonChosen",
  "general.idealCustomer",
  "general.offerings[].detail",
  "cases[].partDescription",
  "cases[].challenge",
  "cases[].solution",
  "cases[].result",
] as const;

/** `cases[0].challenge` → `cases[].challenge`。**添字を消して表と突き合わせる** */
export const webTextShape = (key: string): string => key.replace(/\[\d+\]/g, "[]");

/**
 * **登録の時点で弾く**（`assertLibrary` / `assertGenerated` と同じ思想）。
 * 表を持っているだけでは守られない。案件データを読んだところで当てる。
 */
export function assertWebText(project: unknown): void {
  const map = (project as any)?.webText;
  if (map === undefined || map === null) return;
  if (typeof map !== "object" || Array.isArray(map)) {
    throw new Error("webText: 項目のパスをキーにした表で持ってください");
  }
  const allowed = new Set<string>(WEB_TEXT_PATHS as readonly string[]);
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    if (!allowed.has(webTextShape(key))) {
      throw new Error(`webText: 「${key}」に掲載文は持てません。掲載文を持ってよいのは説明の文章だけで、数値・型番・認証・連絡先の欄は対象外です`);
    }
    const v = value as WebText;
    if (!v || typeof v !== "object" || typeof v.text !== "string") {
      throw new Error(`webText: 「${key}」の text が文字列ではありません`);
    }
    if (v.source !== undefined && v.source !== "human" && v.source !== "ai") {
      throw new Error(`webText: 「${key}」の source は human か ai です`);
    }
    /** **読んだ印があるのに中身が空**、を通さない。空を公開してしまう */
    if (v.reviewedAt?.trim() && !v.text.trim()) {
      throw new Error(`webText: 「${key}」は確認済みなのに掲載文が空です`);
    }
  }
}

// ── 生成の安全装置 ────────────────────────────────────────

/**
 * 原稿に書いてよい事実は、project.json に出典があるものだけ。
 * 生成後にここで定義した値と機械的に突き合わせ、出典のない数値・型番・
 * 認証名を検出して警告する（docs/11 第6章）。
 *
 * 製造業の技術情報で嘘を書くと、信用の失墜だけでなく取引事故になる。
 * これは機能ではなく安全装置であり、v1 から必ず有効にする。
 */
export function collectFactTokens(p: Project): string[] {
  const tokens: string[] = [];
  const push = (...vals: (string | number | undefined)[]) => {
    for (const v of vals) if (v !== undefined && v !== "") tokens.push(String(v));
  };

  push(p.basics.name, p.basics.representative, p.basics.founded, p.basics.capital);
  push(p.basics.employees, p.basics.averageAge, p.basics.address, p.basics.tel);
  tokens.push(...p.basics.clientIndustries);
  for (const h of p.basics.history ?? []) push(h.year, h.event);

  const c = p.capability;
  tokens.push(...c.materials, ...c.processes, ...c.certifications);
  push(c.maxSize, c.minSize, c.tolerance, c.lotSize, c.shortestLeadTime, c.operatingHours);
  for (const e of c.equipment) push(e.maker, e.model, e.count);

  push(p.strengths.defectRate);

  for (const cs of p.cases) {
    push(cs.clientIndustry, cs.result);
    tokens.push(...(cs.materials ?? []), ...(cs.processes ?? []));
  }

  return tokens;
}

/**
 * 無内容な表現の禁止語。製造業の調達担当者・技術者が読む前提で、
 * 形容ではなく具体の数字で書かせる（docs/11 第6章）。
 * 生成後に検出したら書き直させる。
 */
export const BANNED_PHRASES = [
  // 「ミクロン単位」は、答えてもらえなかったときの常套句であり、かつ無内容。
  // 調達担当者は「±5μm」で検索するので、この言葉では一件も拾われない（docs/15 罠1）
  "ミクロン単位",
  "高品質",
  "高い技術力",
  "豊富な実績",
  "きめ細やかな",
  "お客様第一",
  "安心と信頼",
  "最新設備を多数",
  "多種多様な",
  "ワンストップ",
] as const;

/**
 * 生成側で埋められなかった箇所に残すマーカー。
 * これが1つでも残っている限り、ビルドを通さない。
 */
export const NEEDS_REVIEW_MARKER = "{{要確認}}";
