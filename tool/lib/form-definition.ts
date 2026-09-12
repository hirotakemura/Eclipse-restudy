/**
 * KOBO — ヒアリングフォームの項目定義
 *
 * docs/06-取材台本.md の構成をそのまま実装したもの。台本が仕様書であり、
 * `help` には台本の質問文を原文どおり入れる（取材中はこれを読み上げる）。
 *
 * 台本を変更したら、このファイルも必ず合わせて変更すること。
 * `path` は lib/schema.ts の Project 型のドットパスと一致させる。
 *
 * 【placeholder に具体的な数値・型番を書かないこと】
 * 精度・納期・設備型番のような「それらしい値」を例示すると、未入力の欄に
 * 値が見えている状態になり、取材中に入力済みと誤認される。
 * これらはまさに生成側で捏造してはならない項目であり（D-013）、
 * 入力の指示だけを書き、実在しそうな値は置かない。
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "tags" // 文字列の配列。カンマ/Enter区切りで追加
  | "select"
  | "multiselect"
  | "date"
  | "boolean"
  | "list"; // オブジェクトの配列

export interface Field {
  /** Project 型のドットパス。例: "basics.name" */
  path: string;
  label: string;
  type: FieldType;
  /** 充足率の分母に含めるか。取材で必ず取るべき項目を true にする */
  required?: boolean;
  /** 取材台本の質問文。取材中はこれをそのまま聞く */
  help?: string;
  placeholder?: string;
  options?: readonly string[];
  /** type: "list" のときの各要素の項目 */
  itemFields?: Field[];
  /** list の要素をいくつ取りたいか（充足率の判定に使う） */
  minItems?: number;
}

export interface Block {
  id: string;
  /** 取材台本のブロック番号 */
  scriptBlock: string;
  title: string;
  minutes: number;
  note?: string;
  fields: Field[];
}

export const BLOCKS: Block[] = [
  // ── ブロック1：会社の基本（10分） ──────────────────────
  {
    id: "basics",
    scriptBlock: "ブロック1",
    title: "会社の基本",
    minutes: 10,
    note:
      "冒頭で必ず伝える：「今日の90分で、サイトに載せる文章の材料を全ていただきます。" +
      "この後、御社に原稿を書いていただくことはありません。こちらで全部書いて、確認だけお願いする形です。」",
    fields: [
      { path: "basics.name", label: "会社名（正式名称）", type: "text", required: true, placeholder: "登記どおりに。「株式会社」の位置まで正確に" },
      { path: "basics.nameKana", label: "会社名（かな）", type: "text" },
      { path: "basics.representative", label: "代表者名", type: "text", required: true },
      { path: "basics.generation", label: "何代目か", type: "text", help: "事業承継の文脈は代表挨拶で効く" },
      { path: "basics.founded", label: "創業", type: "text", required: true, placeholder: "西暦と元号の両方を聞く" },
      { path: "basics.capital", label: "資本金", type: "text" },
      { path: "basics.employees", label: "従業員数", type: "number", required: true },
      { path: "basics.averageAge", label: "平均年齢", type: "number" },
      { path: "basics.address", label: "所在地", type: "text", required: true },
      { path: "basics.tel", label: "電話番号", type: "text", required: true },
      { path: "basics.currentUrl", label: "現在のサイトURL", type: "text" },
      {
        path: "basics.businessSummary",
        label: "主力の事業と売上比率",
        type: "textarea",
        required: true,
        help: "主力の事業は何ですか。売上の比率はどのくらいですか",
      },
      {
        path: "basics.clientIndustries",
        label: "主要取引先の業界",
        type: "tags",
        required: true,
        help: "主要な取引先はどういった業界ですか（社名が出せなくても業界は聞く）",
      },
      {
        path: "basics.history",
        label: "沿革",
        type: "list",
        itemFields: [
          { path: "year", label: "年", type: "text" },
          { path: "event", label: "出来事", type: "text" },
        ],
      },
    ],
  },

  // ── ブロック2：引き合いの実態（20分）★最重要 ────────────
  {
    id: "inquiry",
    scriptBlock: "ブロック2",
    title: "引き合いの実態　★最重要",
    minutes: 20,
    note:
      "ここでサイト全体の設計が決まる。綺麗なサイトを作るのではなく、今足りていない引き合いを取るサイトを作るため。" +
      "「増やしたい仕事」と「来てほしくない仕事」が分かると、サイトの役割が集客から選別に変わる。",
    fields: [
      { path: "inquiry.monthlyInquiries", label: "月間の問い合わせ件数", type: "number", required: true, help: "今、問い合わせは月に何件ありますか" },
      { path: "inquiry.channels", label: "問い合わせの流入経路", type: "tags", required: true, help: "どこから来ていますか（紹介／展示会／検索／飛び込み）" },
      { path: "inquiry.recentNewClientOrigin", label: "直近の新規取引のきっかけ", type: "textarea", required: true, help: "直近で新しく始まった取引は、どうやって始まりましたか" },
      { path: "inquiry.lostDealReasons", label: "失注の理由", type: "tags", required: true, help: "失注するとき、理由は何が多いですか（価格／納期／技術／信用）" },
      { path: "inquiry.mostProfitableWork", label: "最も利益率の高い仕事", type: "textarea", required: true, help: "一番利益率の高い仕事は何ですか" },
      { path: "inquiry.wantMoreOf", label: "もっと受けたい仕事", type: "textarea", required: true, help: "本当はもっと受けたいのに、今あまり来ていない仕事はありますか" },
      {
        path: "inquiry.wantLessOf",
        label: "来てほしくない問い合わせ",
        type: "textarea",
        required: true,
        help: "逆に、来てほしくない問い合わせはありますか（小ロット過ぎる、単価が合わない等）",
      },
      {
        path: "inquiry.goals",
        label: "サイトの役割",
        type: "multiselect",
        required: true,
        options: ["集客", "選別", "採用", "信用構築"],
        help: "上の回答から決める。複数可",
      },
      { path: "inquiry.targetKeywords", label: "想定検索キーワード", type: "tags", required: true, help: "商談前調査と取材から確定する" },
    ],
  },

  // ── ブロック3：技術・設備（25分）★SEOの本体 ──────────────
  {
    id: "capability",
    scriptBlock: "ブロック3",
    title: "技術・設備　★SEOの本体",
    minutes: 15,
    note:
      "BtoB製造業の検索は「材質×加工法×条件」と「設備の型番」で行われる。" +
      "カタログ的な「高品質・短納期」では一件も検索に引っかからない。" +
      "具体の数字と固有名詞を取り切ることが、そのままSEOになる。",
    fields: [
      { path: "capability.materials", label: "対応材質", type: "tags", required: true, help: "対応できる材質を全部挙げてください", placeholder: "ステンレス, チタン, インコネル" },
      { path: "capability.processes", label: "加工法・工法", type: "tags", required: true, placeholder: "5軸加工, ワイヤーカット" },
      { path: "capability.maxSize", label: "対応サイズ（最大）", type: "text" },
      { path: "capability.minSize", label: "対応サイズ（最小）", type: "text" },
      {
        path: "capability.tolerance",
        label: "対応精度",
        type: "text",
        required: true,
        help: "どのくらいの精度まで対応できますか",
        placeholder: "聞き取った数値をそのまま。答えが曖昧なら「未確認」を付ける",
      },
      { path: "capability.lotSize", label: "対応ロット", type: "text", required: true, placeholder: "聞き取った内容をそのまま" },
      {
        path: "capability.shortestLeadTime",
        label: "最短納期",
        type: "text",
        required: true,
        help: "標準納期と最短納期の両方を聞く。即答できない場合は「未確認」を付ける",
        placeholder: "聞き取った内容をそのまま",
      },
      { path: "capability.prototypeRatio", label: "試作と量産の比率", type: "text" },
      {
        path: "capability.equipment",
        label: "保有設備",
        type: "list",
        required: true,
        minItems: 3,
        help: "メーカー名と型番まで。型番そのものが検索される。分からなければ工場長に確認する",
        itemFields: [
          { path: "maker", label: "メーカー", type: "text" },
          { path: "model", label: "型番", type: "text" },
          { path: "count", label: "台数", type: "number" },
          { path: "note", label: "備考", type: "text" },
        ],
      },
      { path: "capability.certifications", label: "資格・認証", type: "tags", required: true, placeholder: "ISO9001, JIS, 特殊工程" },
      { path: "capability.operatingHours", label: "稼働体制", type: "text", placeholder: "2交代, 24時間, 土日対応可" },
    ],
  },

  // ── ブロック3後半：強み（10分） ────────────────────────
  {
    id: "strengths",
    scriptBlock: "ブロック3",
    title: "強み（社長が自分では言えない部分）",
    minutes: 10,
    note:
      "社長は自社の強みを自分では言語化できない。この質問群で引き出す。" +
      "特に1問目は、強みが最も鮮明に出る質問。",
    fields: [
      {
        path: "strengths.wonAfterOthersDeclined",
        label: "他社に断られた案件で、受けられたもの",
        type: "textarea",
        required: true,
        help: "他社に断られた案件で、御社が受けられたものはありますか　← 強みが最も鮮明に出る質問",
      },
      {
        path: "strengths.praiseFromClients",
        label: "顧客からよく言われる褒め言葉",
        type: "textarea",
        required: true,
        help: "お客様から一番よく言われる褒め言葉は何ですか　← 社長の自己認識とのズレが宝",
      },
      { path: "strengths.workOthersAvoid", label: "同業がやりたがらないが得意な仕事", type: "textarea", help: "同業他社がやりたがらない仕事で、御社が得意なものは" },
      { path: "strengths.defectRate", label: "不良率", type: "text", help: "不良率はどのくらいですか（数字が良ければ強力な武器になる）" },
      { path: "strengths.hardestJob", label: "技術的に最も難しかった仕事", type: "textarea", help: "技術的に一番難しかった仕事は何ですか" },
    ],
  },

  // ── ブロック4：加工事例（20分） ────────────────────────
  {
    id: "cases",
    scriptBlock: "ブロック4",
    title: "加工事例　★最も問い合わせに繋がる",
    minutes: 20,
    note:
      "事例ページはBtoB製造業サイトで最も読まれ、最も問い合わせに繋がる。最低3本。" +
      "秘密保持で出せない情報は「材質を伏せる」「業界を1段抽象化する」で処理できる。" +
      "「守秘義務があるので事例は出せません」で止めない。粘る。",
    fields: [
      {
        path: "cases",
        label: "加工事例",
        type: "list",
        required: true,
        minItems: 3,
        itemFields: [
          { path: "title", label: "事例のタイトル", type: "text" },
          { path: "clientIndustry", label: "顧客の業界", type: "text", placeholder: "自動車部品メーカー様" },
          { path: "partDescription", label: "部品・製品の概要", type: "textarea" },
          { path: "challenge", label: "相談されたときの課題", type: "textarea", help: "他社で断られた／精度が出ない／コストが合わない／納期が間に合わない" },
          { path: "solution", label: "どう解決したか", type: "textarea", help: "工程の工夫・治具の内製・材料の提案" },
          { path: "result", label: "結果", type: "textarea", help: "数字があれば必ず数字で（不良率◯%改善、コスト◯%削減）" },
          { path: "materials", label: "材質", type: "tags" },
          { path: "processes", label: "加工法", type: "tags" },
          { path: "confidentialityNotes", label: "秘密保持のメモ", type: "text" },
        ],
      },
    ],
  },

  // ── ブロック5：採用・代表（10分） ──────────────────────
  {
    id: "recruitment",
    scriptBlock: "ブロック5",
    title: "採用・代表挨拶",
    minutes: 10,
    note:
      "中小製造業の本当の悩みは採用であることが非常に多い。" +
      "ここを聞くと、継続的な支援（採用ページの改善・求人記事）に繋がる話が出てくる。",
    fields: [
      { path: "recruitment.isHiring", label: "採用の予定があるか", type: "boolean" },
      { path: "recruitment.neededRoles", label: "不足している職種", type: "tags", help: "今、人は足りていますか。どの職種が足りませんか" },
      { path: "recruitment.recentHireOrigin", label: "直近で採用できた人の流入経路", type: "textarea", help: "直近で採用できた人は、どうやって入ってきましたか" },
      { path: "recruitment.retentionNotes", label: "若手の定着状況", type: "textarea", help: "若手の定着はどうですか" },
      { path: "recruitment.workplaceAppeal", label: "訴求できる待遇・環境", type: "tags" },
      { path: "executive.vision", label: "5年後のビジョン", type: "textarea", required: true, help: "5年後、会社をどうしていきたいですか" },
      { path: "executive.messageToStaff", label: "社員に伝えたいこと", type: "textarea", help: "社員に一番伝えたいことは何ですか" },
    ],
  },

  // ── ブロック6：制作条件（5分） ─────────────────────────
  {
    id: "terms",
    scriptBlock: "ブロック6",
    title: "制作条件・クロージング",
    minutes: 5,
    note: "次のアクション日を明言する：「1週間後に構成案と原稿の第1稿をお送りします」",
    fields: [
      { path: "terms.targetLaunchDate", label: "公開希望日", type: "date" },
      { path: "terms.ngItems", label: "出せない情報（NG）", type: "tags", required: true, help: "取引先名／価格／特定の技術など、出せない情報はありますか" },
      { path: "terms.photo.hasExisting", label: "使える既存写真があるか", type: "boolean" },
      { path: "terms.photo.professionalShootNeeded", label: "プロ撮影が必要か", type: "boolean" },
      { path: "terms.photo.shootDate", label: "撮影日", type: "date" },
      { path: "terms.domain.existing", label: "既存ドメイン", type: "text" },
      { path: "terms.domain.desired", label: "希望ドメイン（新規取得）", type: "text" },
      {
        path: "terms.domain.registrationDelegated",
        label: "ドメイン取得を代行するか",
        type: "boolean",
        help: "名義と支払いは必ず顧客（D-011）。代行するのは手続きだけ",
      },
      { path: "terms.inquiryNotifyEmail", label: "問い合わせの通知先メール", type: "text", required: true },
      { path: "terms.supportPlan", label: "契約した運用プラン", type: "select", options: ["なし", "ベーシック", "グロース", "フル"] },
      { path: "terms.wordpressRequested", label: "WordPress指定あり", type: "boolean", help: "指定時は月額+2万（D-009）" },
    ],
  },
];

/** 全ブロックの想定所要時間。取材台本どおりなら90分 */
export const TOTAL_MINUTES = BLOCKS.reduce((sum, b) => sum + b.minutes, 0);
