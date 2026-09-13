/**
 * KOBO — ヒアリング項目の定義（単一の正）
 *
 * このファイルから、フォームUI・バリデーション・原稿生成プロンプト・
 * Astroテンプレートの型がすべて導出される。仕様を二重管理しないこと。
 *
 * 出典: docs/06-取材台本.md の6ブロック構成に対応する。
 * 台本を変更したら、このファイルも必ず合わせて変更する。
 */

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
  currentUrl?: string;
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
  /** 加工法・工法。例: 5軸加工, ワイヤーカット */
  processes: string[];
  maxSize?: string;
  minSize?: string;
  /** 対応精度。例: ±5μm */
  tolerance?: string;
  /** 対応ロット。例: 1個〜 */
  lotSize?: string;
  /** 最短納期 */
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
  /** 秘密保持で伏せる必要がある項目のメモ */
  confidentialityNotes?: string;
}

// ── ブロック5：採用・代表 ──────────────────────────────────

export interface Recruitment {
  isHiring: boolean;
  /** 不足している職種 */
  neededRoles: string[];
  /** 直近で採用できた人の流入経路 */
  recentHireOrigin?: string;
  /** 若手の定着状況 */
  retentionNotes?: string;
  /** 訴求できる待遇・環境 */
  workplaceAppeal?: string[];
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
   * サイトの見た目。配色・書体・雰囲気・レイアウトを案件データとして持つ。
   *
   * **テンプレートは1つしか持たない**（D-096）ので、見た目の違いはここで出す。
   * 選択肢の中身は `lib/theme.ts`（単一の正）。
   */
  theme?: { palette: string; font: string; mood: string; layout: string };

  /**
   * お預かりした写真。
   *
   * **写真が無くてもサイトは建つ**（D-099）。ただし「事業所や社長の写真は載せたい」は
   * 必ず言われる。**写真待ちで公開を止めない構造は保ったまま、置き場所だけ先に決めておく。**
   */
  photos?: SitePhoto[];

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

  /** 取材の録音・文字起こしへの参照。原稿生成の補助素材 */
  transcriptPath?: string;
  /** 商談前調査の結果。提案書の「現状診断」にも使う */
  research?: {
    keywordRankings: { keyword: string; volume?: number; rank?: number | null }[];
    competitors: { name: string; url: string; note?: string }[];
    currentSiteIssues: string[];
  };
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
