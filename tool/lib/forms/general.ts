/**
 * KOBO — 汎用フォーム（198,000円の商品）
 *
 * サイトがない中小・零細企業向け。業種を問わない。
 * 製造業フォームが90分・58項目なのに対し、こちらは **30分・24項目**に絞っている。
 *
 * 【なぜ短いのか】
 * この商品は、紹介・商工会議所・自社サイト経由で「向こうから来た」案件の受け皿であり、
 * こちらから売りに行く商品ではない（D-045）。単価が198,000円なので、
 * 90分の取材と10〜15ページ分の原稿執筆は原価的に成立しない。
 *
 * 【それでも捨てないもの】
 * 「原稿は全部こちらが書く」という商品の核心（docs/06 冒頭）は、この商品でも維持する。
 * 短いのは質問の数であって、顧客に書かせるようになるわけではない。
 * だから「選ばれている理由」「よく言われること」といった、
 * 相手が自分では言語化できない部分を引き出す質問は、業種が変わっても残す。
 *
 * 【製造業フォームから意図的に落としたもの】
 * 対応材質・精度・設備型番といった技術項目。これらは製造業の検索を受け止める本体だが、
 * 業種を問わないフォームには置けない。**汎用フォームで製造業の案件を受けない。**
 */

import type { Block } from "../form-definition.ts";

export const BLOCKS: Block[] = [
  // ── A：会社の基本（8分） ─────────────────────────────
  {
    id: "basics",
    scriptBlock: "A",
    title: "会社の基本",
    minutes: 8,
    note:
      "冒頭で必ず伝える：「この30分で、サイトに載せる文章の材料をいただきます。" +
      "この後、原稿を書いていただくことはありません。こちらで全部書いて、確認だけお願いする形です。」",
    fields: [
      { path: "basics.name", label: "会社名・屋号（正式名称）", type: "text", required: true, placeholder: "登記どおりに" },
      { path: "basics.representative", label: "代表者名", type: "text", required: true },
      { path: "basics.founded", label: "創業", type: "text", required: true, placeholder: "西暦と元号の両方を聞く" },
      { path: "basics.employees", label: "従業員数", type: "number", required: true, help: "代表ひとりなら 1 と入れる" },
      { path: "basics.address", label: "所在地", type: "text", required: true },
      { path: "basics.tel", label: "電話番号", type: "text", help: "名刺から取る。取材時間を使わない" },
      { path: "basics.currentUrl", label: "現在のサイトURL", type: "text", help: "無ければ空欄のまま" },
      {
        path: "basics.businessSummary",
        label: "何をやっている会社か",
        type: "textarea",
        required: true,
        help: "初対面の人に一言で説明するとしたら、何と言いますか",
      },
      {
        path: "general.serviceArea",
        label: "対応できる地域",
        type: "text",
        required: true,
        help: "どのあたりまで対応されますか。出張の可否も",
      },
    ],
  },

  // ── B：売っているもの（10分）★ここが本体 ─────────────
  {
    id: "offerings",
    scriptBlock: "B",
    title: "売っているもの・選ばれている理由　★最重要",
    customerTitle: "お取り扱いと、選ばれている理由",
    minutes: 10,
    note:
      "サイトを見た人が知りたいのは「何を、いくらで、誰に、なぜこの会社に頼むのか」の4つだけ。" +
      "会社の理念や沿革は読まれない。ここに時間を使う。",
    followUps: [
      { trigger: "普通のことしかやってない", ask: "その普通のことを、他所さんも同じようにやっていますか" },
      { trigger: "他所で無理と言われた・断られた", ask: "断られた理由を、お客様はどう説明していましたか" },
      { trigger: "褒め言葉が出てこない", ask: "リピートしてくださるお客様は、なぜまた頼んでくださると思いますか" },
      { trigger: "安いから選ばれている", ask: "同じ値段の会社が他にもある中で、それでもここを選ぶ理由は何だと思いますか" },
      { trigger: "対応が早い・丁寧", ask: "具体的にはどのくらいの早さですか。当日ですか、翌日ですか" },
    ],
    fields: [
      {
        path: "general.offerings",
        label: "主なサービス・商品",
        type: "list",
        required: true,
        minItems: 2,
        help: "扱っているものを挙げてください。価格は出せる範囲で構いません",
        itemFields: [
          { path: "name", label: "名前", type: "text" },
          { path: "detail", label: "内容", type: "textarea", help: "どんなものか、初めての人に説明するつもりで" },
          { path: "price", label: "価格・料金の目安", type: "text", help: "「◯円〜」「応相談」でも可。出せないなら空欄" },
        ],
      },
      {
        path: "general.idealCustomer",
        label: "どういうお客様が多いか",
        type: "textarea",
        required: true,
        help: "今のお客様は、どういう方が多いですか。年齢層・業種・お住まいの地域など",
      },
      {
        path: "strengths.wonAfterOthersDeclined",
        label: "他社に断られた仕事で、受けられたもの",
        type: "textarea",
        required: true,
        help: "他所で断られたという相談を受けたことはありますか　← 強みが最も鮮明に出る質問",
      },
      {
        path: "strengths.praiseFromClients",
        label: "お客様からよく言われること",
        type: "textarea",
        required: true,
        help: "お客様から一番よく言われる褒め言葉は何ですか　← 本人の自己認識とズレていることが多く、そのズレが宝",
      },
      {
        path: "general.reasonChosen",
        label: "同業と比べて、どこが違うか",
        type: "textarea",
        required: true,
        help: "同じことをやっている会社は他にもある中で、お客様はなぜここを選んでいると思いますか",
      },
      {
        path: "strengths.followUpFindings",
        label: "追い質問で判明したこと",
        customerLabel: "とくにくわしくうかがった点",
        type: "textarea",
        help:
          "定型質問では出てこなかったが、掘ったら出てきたこと。" +
          "「当たり前だと思ってやっていること」に価値が埋まっている（docs/15）",
      },
    ],
  },

  // ── C：問い合わせの実態（6分） ───────────────────────
  {
    id: "inquiry",
    scriptBlock: "C",
    title: "問い合わせの実態",
    minutes: 6,
    note: "サイトの役割を決めるための質問。数を増やしたいのか、割に合う仕事を選びたいのかで作り方が変わる。",
    fields: [
      {
        path: "inquiry.monthlyInquiries",
        label: "今の問い合わせ件数と経路",
        type: "text",
        required: true,
        help: "今、お問い合わせは月にどのくらいですか。どこから来ていますか",
        placeholder: "答えのとおりに。「月2〜3件、ほぼ紹介」のように",
      },
      {
        path: "inquiry.wantMoreOf",
        label: "もっと増やしたい仕事",
        type: "textarea",
        required: true,
        help: "本当はもっと受けたいのに、今あまり来ていない仕事はありますか",
      },
      {
        path: "inquiry.wantLessOf",
        label: "来てほしくない問い合わせ",
        type: "textarea",
        required: true,
        help: "逆に、来てほしくない問い合わせはありますか　← これが分かるとサイトが選別の装置になる",
      },
      {
        path: "inquiry.goals",
        label: "サイトの役割",
        type: "multiselect",
        required: true,
        options: ["集客", "選別", "採用", "信用構築"],
        help: "上の回答から決める。複数可",
      },
      {
        path: "inquiry.targetKeywords",
        label: "想定検索キーワード",
        customerLabel: "お客様が検索しそうな言葉（こちらの想定）",
        type: "tags",
        required: true,
        help: "お客様が困ったときに何と検索するか。「業種＋地域」だけで終わらせない",
      },
    ],
  },

  // ── D：実績・お客様の声（4分） ───────────────────────
  {
    id: "cases",
    scriptBlock: "D",
    title: "実績・お客様の声",
    minutes: 4,
    note:
      "聞く前に必ず言う：「お客様の名前は一切出しません。" +
      "『ご近所の工務店様』のように書ければ十分に成立します」（docs/06 ブロック4の教訓）。",
    fields: [
      {
        path: "cases",
        label: "実績・事例",
        type: "list",
        required: true,
        minItems: 2,
        help: "印象に残っている仕事を2つ以上。うまくいったものでも、苦労したものでも",
        itemFields: [
          { path: "title", label: "見出し", type: "text" },
          { path: "clientIndustry", label: "お客様の業種・属性", type: "text", placeholder: "社名は不要" },
          { path: "challenge", label: "相談されたときの困りごと", type: "textarea" },
          { path: "solution", label: "どう対応したか", type: "textarea" },
          { path: "result", label: "結果", type: "textarea", help: "数字があれば数字で" },
        ],
      },
    ],
  },

  // ── E：制作条件（2分） ───────────────────────────────
  {
    id: "terms",
    scriptBlock: "E",
    title: "制作条件・クロージング",
    customerTitle: "制作にあたっての条件",
    minutes: 2,
    note: "次のアクション日を明言する：「1週間後に構成案と原稿をお送りします」",
    followUps: [
      {
        trigger: "今のドメインをそのまま使いたい",
        ask: "そのドメインで、メールもお使いですか。info@◯◯ のようなアドレスです",
      },
      {
        trigger: "メールも使っている",
        ask: "どちらでメールを受けておられますか。切替の前に、今の設定をこちらで控えます",
      },
    ],
    fields: [
      {
        path: "terms.ngItems",
        label: "出せない情報（NG）",
        customerLabel: "サイトに出さないとお約束した情報",
        type: "tags",
        required: true,
        help: "取引先名・価格など、載せないでほしいものはありますか"
      },
      { path: "terms.inquiryNotifyEmail", label: "問い合わせの通知先メール", type: "text", required: true },
      { path: "terms.photo.hasExisting", label: "使える写真があるか", type: "boolean", help: "無い場合はスマホでの撮影指示書をこちらで作る" },
      {
        path: "photos",
        label: "お預かりした写真",
        customerLabel: "お預かりした写真",
        type: "photos",
        help:
          "その場でいただけるものはここで預かる。後日でも構わない。" +
          "**先に置き場所を決めてから、必要な枚数だけお願いする。**" +
          "「とりあえず写真をください」と頼むと、使えない画像が大量に届く",
      },
      { path: "terms.domain.existing", label: "既存ドメイン", type: "text" },
      { path: "terms.domain.desired", label: "希望ドメイン（新規取得）", type: "text" },
      {
        path: "terms.domain.registrationDelegated",
        label: "ドメイン取得を代行するか",
        type: "boolean",
        help: "名義と支払いは必ず顧客（D-011）。代行するのは手続きだけ",
      },
      {
        path: "terms.domain.mailInUse",
        label: "そのドメインでメールを使っているか",
        customerLabel: "現在のドメインでメールをお使いか",
        type: "boolean",
        help:
          "既存ドメインがある案件では必ず聞く。info@◯◯ のようなアドレスです。" +
          "**DNSを切り替えるときにMXレコードを引き継がないと、会社のメールが止まります。**" +
          "サイトが数時間見えないより、メールが止まるほうがはるかに重大な事故になります",
      },
      {
        path: "terms.domain.mailProvider",
        label: "メールをどこで受けているか",
        customerLabel: "メールのご利用先",
        type: "text",
        placeholder: "分かる範囲で。現在の業者名・サービス名",
        help: "「前の業者に任せている」で構わない。切替前に必ず現在のDNS設定を控えること",
      },
      { path: "terms.targetLaunchDate", label: "公開希望日", type: "date" },
    ],
  },

  // ── サイトの見た目 ─────────────────────────────────────
  /**
   * **時間の目安を置かない**（D-167）。
   * お客様がここで悩まれるのは自然なことで、急かす場所ではない。
   * 制作条件の中に混ぜていたが、見比べながら決める場面なので独立させた。
   */
  {
    id: "design",
    scriptBlock: "",
    title: "サイトの見た目",
    customerTitle: "サイトの見た目",
    note:
      "画面をお客様に向けて、一緒に選ぶ。まず「型」を押して、そこから気になる軸だけ直す。" +
      "決まらなければ既定のままでよい。後から変えられる。",
    fields: [
      {
        path: "theme",
        label: "サイトの見た目",
        customerLabel: "サイトの見た目",
        type: "theme",
        help:
          "その場で選んでいただく。**見本を見せながら決めるのが一番早い。**" +
          "後から変えられるので、迷ったら既定のままでよい",
      },
    ],
  },
];
