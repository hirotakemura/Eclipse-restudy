/**
 * KOBO — 製造業向けフォーム（980,000円の商品）
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
 * これらはまさに生成側で捏造してはならない項目であり（D-026）、
 * 入力の指示だけを書き、実在しそうな値は置かない。
 */

import type { Block } from "../form-definition.ts";

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
      // 公開の必須条件（build-site.mjs の検査）なのに required が付いていなかった（D-173）
      { path: "basics.tel", label: "電話番号", type: "text", required: true, help: "名刺・現行サイトから取る。取材時間を使わない" },
      { path: "basics.receptionHours", label: "電話の受付時間", type: "text", placeholder: "平日 8:00〜17:00" },
      { path: "basics.currentUrl", label: "現在のサイトURL", type: "text" },
      {
        /**
         * **ロゴ画像に社名が入っているか**（D-462）。
         *
         * ヘッダーではロゴの横に社名を文字で出す（D-460）。図像だけのロゴでは
         * **その図を知らない人に会社名が読めない**ためである。
         * ところが松原精機のロゴには社名が入っており、画面では
         * **「松原精機（画像）＋有限会社 松原精機（文字）」と二重に見えた。**
         * 画像から社名の有無は判定できない（読み取る手段が無い）ので、**人に聞く。**
         * **聞けていないうちは文字を出さない**——二重に見えるほうが害が大きい。
         */
        path: "basics.logoIncludesName",
        label: "ロゴ画像に社名が入っているか",
        type: "boolean",
        help: "入っていなければ、ヘッダーでロゴの横に会社名を文字で出す。ロゴ画像が無い案件では関係ない",
      },
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
    customerTitle: "お仕事の引き合いについて",
    minutes: 20,
    note:
      "ここでサイト全体の設計が決まる。綺麗なサイトを作るのではなく、今足りていない引き合いを取るサイトを作るため。" +
      "「増やしたい仕事」と「来てほしくない仕事」が分かると、サイトの役割が集客から選別に変わる。",
    followUps: [
      { trigger: "大丈夫だと思う・当面は問題ない", ask: "その取引先からの発注量は、来年・再来年も同じくらい続きそうですか" },
      { trigger: "価格で負ける", ask: "では、価格以外で選ばれた仕事はありますか。それは何が決め手でしたか" },
      { trigger: "紹介がほとんど", ask: "紹介してくださった方は、御社の何を評価して紹介されたのでしょうか" },
      { trigger: "（地域の動きに触れない）", ask: "日産の九州生産移管の話が出ていますが、御社に影響はありそうですか" },
    ],
    fields: [
      {
        path: "inquiry.monthlyInquiries",
        label: "月間の問い合わせ件数",
        type: "text",
        required: true,
        help: "今、問い合わせは月に何件ありますか",
        placeholder: "答えのとおりに。「月1〜2件」のような幅のある回答でよい", internal: true },
      { path: "inquiry.channels", label: "問い合わせの流入経路", type: "tags", required: true, help: "どこから来ていますか（紹介／展示会／検索／飛び込み）", internal: true },
      { path: "inquiry.recentNewClientOrigin", label: "直近の新規取引のきっかけ", type: "textarea", required: true, help: "直近で新しく始まった取引は、どうやって始まりましたか", internal: true },
      { path: "inquiry.lostDealReasons", label: "失注の理由", type: "tags", required: true, help: "失注するとき、理由は何が多いですか（価格／納期／技術／信用）", internal: true },
      { path: "inquiry.mostProfitableWork", label: "最も利益率の高い仕事", type: "textarea", required: true, help: "一番利益率の高い仕事は何ですか" },
      { path: "inquiry.wantMoreOf", label: "もっと受けたい仕事", type: "textarea", required: true, help: "本当はもっと受けたいのに、今あまり来ていない仕事はありますか" },
      {
        path: "inquiry.wantLessOf",
        label: "来てほしくない問い合わせ",
        type: "textarea",
        required: true,
        help: "逆に、来てほしくない問い合わせはありますか（小ロット過ぎる、単価が合わない等）" },
      {
        path: "inquiry.goals",
        label: "サイトの役割",
        type: "multiselect",
        required: true,
        options: ["集客", "選別", "採用", "信用構築"],
        help: "上の回答から決める。複数可",
      },
      {
        path: "inquiry.outlookConcern",
        label: "受注の先行きへの不安",
        customerLabel: "今後の受注について気にされていること",
        type: "textarea",
        required: true,
        help: "今のお取引先からの発注量は、来年・再来年も同じくらい続きそうですか。変化の兆しはありますか", internal: true },
      {
        path: "inquiry.targetKeywords",
        label: "想定検索キーワード",
        // お客様の発言ではなく我々の想定。確認画面ではそう分かる言い方にする
        customerLabel: "お客様が検索しそうな言葉（こちらの想定）",
        type: "tags",
        required: true,
        /**
         * **画面には出さない**（D-425）。
         * 検索語を本文に混ぜると、読む人ではなく検索エンジンに向けた文章になる。
         * ここは「お客様が使う言葉で書けているか」を我々が確かめるための欄である
         */
        internal: true,
        help: "商談前調査と取材から確定する。**サイトには出さない**（言葉づかいの確認に使う）"
      },
    ],
  },

  // ── ブロック3：技術・設備（25分）★SEOの本体 ──────────────
  {
    id: "capability",
    scriptBlock: "ブロック3",
    title: "技術・設備　★SEOの本体",
    customerTitle: "技術・設備",
    minutes: 15,
    note:
      "BtoB製造業の検索は「材質×加工法×条件」と「設備の型番」で行われる。" +
      "カタログ的な「高品質・短納期」では一件も検索に引っかからない。" +
      "具体の数字と固有名詞を取り切ることが、そのままSEOになる。",
    followUps: [
      { trigger: "ミクロン単位・けっこう精度は出る", ask: "±何μmくらいでしょうか。即答が難しければ工場長に確認で結構です" },
      { trigger: "急ぎなら◯日でも", ask: "標準だとどのくらいですか。最短と標準の両方をうかがいたいです" },
      { trigger: "現場に聞かないと分からない", ask: "承知しました。工場長さんに30分だけお時間いただけますか。設備の銘板も撮影させてください" },
      { trigger: "最新設備を入れている", ask: "メーカーと型番を教えてください。型番そのもので検索されることがあります" },
      { trigger: "何でもやります", ask: "その中で、いちばん多い材質と加工法は何ですか" },
      { trigger: "（加工法をたくさん挙げた）", ask: "そのうち、自社の設備で行っているのはどれですか。外注に出しているものと分けてうかがえますか　★実案件で45件すべてが自社扱いになっていた" },
    ],
    fields: [
      { path: "capability.materials", label: "対応材質", type: "tags", required: true, help: "**日常的に加工しているものだけ**。実績が数件の材質は入れない（注記を値の中に書かない・D-424）", placeholder: "聞き取ったとおりに。カンマ区切りでまとめて追加できる" },
      {
        path: "capability.processes",
        label: "加工法・工法（自社）",
        type: "tags",
        required: true,
        /**
         * **「どういう加工ができますか」では、外注も混ざる**（D-424）。
         * 実案件で45件すべてが入り、設備2種類の切削会社に鋳造・射出成形・鍛造が並んだ。
         * 聞き方のほうを直す。
         */
        help: "自社の設備で日常的に行っているものだけ。外注に出しているものは次の欄へ",
        placeholder: "聞き取ったとおりに。カンマ区切りでまとめて追加できる",
      },
      {
        path: "capability.outsourcedProcesses",
        label: "協力会社に依頼している工程",
        type: "tags",
        help: "熱処理・表面処理・塗装など。**一括で頼める**ことは選ばれる理由になるので、無理に削らない",
        placeholder: "無ければ空のままでよい",
      },
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
      /**
       * **1つの欄で2つ聞かない**（D-452）。
       * 「標準納期と最短納期の両方を聞く」としていたため、1つの欄に
       * 「標準7日。急ぎの場合は最短3日」と入り、**値ではなく文**になっていた。
       */
      { path: "capability.standardLeadTime", label: "標準納期", type: "text", required: true,
        help: "ふだんの納期。**値だけ**（例：7日）。急ぎの話は次の欄へ", placeholder: "7日" },
      {
        path: "capability.shortestLeadTime",
        label: "最短納期",
        type: "text",
        required: true,
        help: "急ぐときに出せる最短。**値だけ**（例：3日）。即答できない場合は「未確認」を付ける",
        placeholder: "3日",
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
          // 銘板の照合待ちなど、**我々の作業メモが入る欄**。表には出さない（D-169）
          { path: "note", label: "備考（社内メモ）", type: "text", internal: true },
        ],
      },
      { path: "capability.certifications", label: "資格・認証", type: "tags", required: true, help: "ISOのほか、特殊工程の資格などがあれば", placeholder: "聞き取ったとおりに" },
      { path: "capability.operatingHours", label: "稼働体制", type: "text", placeholder: "2交代, 24時間, 土日対応可" },
    ],
  },

  // ── ブロック3後半：強み（10分） ────────────────────────
  {
    id: "strengths",
    scriptBlock: "ブロック3",
    title: "強み（社長が自分では言えない部分）",
    customerTitle: "御社の強み",
    minutes: 10,
    note:
      "社長は自社の強みを自分では言語化できない。この質問群で引き出す。" +
      "特に1問目は、強みが最も鮮明に出る質問。",
    followUps: [
      { trigger: "歪む・反る・暴れる・ビビる", ask: "どうやって押さえているんですか。治具はどこから調達していますか　★モック取材で治具の内製が出た質問" },
      { trigger: "他社が断った", ask: "断られた理由を、お客様はどう説明していましたか" },
      { trigger: "感覚・匙加減・職人技", ask: "その感覚を工程で言い換えると、削る順番や条件はどうされているんですか" },
      { trigger: "普通のことしかやってない", ask: "その普通のことを、よそさんは外注に出したりしませんか" },
      { trigger: "材料が特殊・入りにくい", ask: "その材料はどこから入れているんですか。メーカーとの付き合いはありますか" },
      { trigger: "測るのが難しい", ask: "どうやって測っているんですか。検査データはお客様にお渡しできますか" },
    ],
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
      {
        path: "strengths.followUpFindings",
        label: "追い質問で判明したこと",
        customerLabel: "とくにくわしくうかがった点",
        type: "textarea",
        required: true,
        help: "台本の定型質問では出てこなかったが、追い質問で出てきた強み。"
          + "第1回モック取材では「治具の内製」がここで出た。取材の価値の大半がここにある",
      },
    ],
  },

  // ── ブロック4：加工事例（20分） ────────────────────────
  {
    id: "cases",
    scriptBlock: "ブロック4",
    title: "加工事例　★最も問い合わせに繋がる",
    customerTitle: "加工事例",
    minutes: 20,
    note:
      "事例ページはBtoB製造業サイトで最も読まれ、最も問い合わせに繋がる。最低3本。" +
      "秘密保持で出せない情報は「材質を伏せる」「業界を1段抽象化する」で処理できる。" +
      "「守秘義務があるので事例は出せません」で止めない。粘る。",
    followUps: [
      { trigger: "取引先の名前は出せない", ask: "社名は出しません。『検査装置メーカー様』のように業界だけで十分です" },
      { trigger: "苦労した・何回もやり直した", ask: "何が原因で、最終的に何を変えて解決したんですか" },
      { trigger: "うまくいった（数字が出ない）", ask: "不良率や納期で、before / after を数字で言えるものはありますか" },
      { trigger: "覚えていない・うろ覚え", ask: "工場長さんなら分かりますか。後日うかがっても構いません" },
    ],
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
          /**
           * **「専用治具を作った」で止めない**（D-425）。
           * 実データで、2件の事例が**一字一句同じ解決方法**になっていた。
           * どこを押さえたか・どの順で削ったかまで聞かないと、事例が1件分にしかならない
           */
          { path: "solution", label: "どう解決したか", type: "textarea", help: "**どこを押さえたか・どの順で削ったか**まで。「専用治具を作った」で止めると、ほかの事例と同じ文になる" },
          /**
           * **数字だけ取ると、緩い数字が弱みに見える**（D-425）。
           * 会社の対応精度（±0.01mm）より緩い公差の事例が並ぶと「精度が出ない会社」に読める。
           * 理由まで取れば「薄物は保持の仕方で歪むため広めに設定」という設計判断として読める
           */
          { path: "result", label: "結果", type: "textarea", help: "数字があれば必ず数字で（不良率◯%改善、コスト◯%削減）。**会社の対応精度より緩いときは、その理由も**" },
          { path: "materials", label: "材質", type: "tags" },
          { path: "processes", label: "加工法", type: "tags" },
          // 事例の説得力は、この3つが数字で埋まっているかで決まる（D-172）
          { path: "quantity", label: "数量・ロット", type: "text", placeholder: "試作3個／月200個" },
          { path: "leadTime", label: "納期", type: "text", placeholder: "図面受領から10日" },
          { path: "declinedReason", label: "他社が断った理由", type: "text", help: "反り／割れ／歪み／穴位置／公差。ここが具体的なほど効く" },
          // 社名を出してよいかは、事例ページを作る前に必ず本人に確認が要る。
          // 確認画面で最も見ていただきたい項目のひとつなので、伝わる言い方にする
          { path: "confidentialityNotes", label: "秘密保持のメモ", customerLabel: "掲載してよい範囲", type: "text", internal: true },
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
      { path: "recruitment.recentHireOrigin", label: "直近で採用できた人の流入経路", type: "textarea", help: "直近で採用できた人は、どうやって入ってきましたか", internal: true },
      // **これは我々が採用ページの要否を判断するための欄。答えをそのまま載せない**（D-170）
      { path: "recruitment.retentionNotes", label: "若手の定着状況", type: "textarea", internal: true, help: "若手の定着はどうですか" },
      { path: "recruitment.workplaceAppeal", label: "訴求できる待遇・環境", type: "tags" },
      { path: "executive.vision", label: "5年後のビジョン", type: "textarea", required: true, help: "5年後、会社をどうしていきたいですか" },
      { path: "executive.messageToStaff", label: "社員に伝えたいこと", type: "textarea", help: "社員に一番伝えたいことは何ですか" },
    ],
  },

  // ── 採用の労働条件（取材では聞かない。求人票からの転記）───────
  {
    id: "recruitmentTerms",
    scriptBlock: "",
    title: "募集要項",
    customerTitle: "募集要項",
    note:
      "**この場で社長に思い出していただく項目ではない。** 求人票・就業規則・ハローワークの求人票の"
      + "写しをいただいて、後で転記する。取材の時間を使わない（D-171）。"
      + "ここが空のままなら、採用ページは作らない。**条件の書いていない求人は、応募されない。**",
    fields: [
      { path: "recruitment.terms.employmentType", label: "雇用形態", type: "text", placeholder: "正社員／契約社員／パート" },
      { path: "recruitment.terms.salary", label: "給与", type: "text", help: "求人票の記載をそのまま。幅がある場合は幅で" },
      { path: "recruitment.terms.workingHours", label: "勤務時間", type: "text", placeholder: "8:00〜17:00（休憩60分）" },
      { path: "recruitment.terms.holidays", label: "休日・休暇", type: "text", placeholder: "週休2日／年間休日◯日" },
      { path: "recruitment.terms.allowances", label: "諸手当", type: "tags", placeholder: "通勤／資格／残業／家族" },
      { path: "recruitment.terms.insurance", label: "社会保険", type: "text", placeholder: "健康・厚生年金・雇用・労災" },
      { path: "recruitment.terms.qualifications", label: "応募資格・必要な経験", type: "textarea", help: "未経験可かどうかは必ず。ここで応募数が変わる" },
      { path: "recruitment.terms.selection", label: "選考の流れ", type: "text", placeholder: "書類→面接1回→内定" },
      { path: "recruitment.terms.documents", label: "応募書類", type: "text", placeholder: "履歴書・職務経歴書" },
      { path: "recruitment.terms.contact", label: "採用の問い合わせ先", type: "text", help: "代表電話と違う場合のみ。受付時間も添える" },
      { path: "recruitment.terms.factoryTour", label: "工場見学の可否", type: "text", help: "見学できると書けるだけで応募のハードルが下がる" },
    ],
  },

  // ── ブロック6：制作条件（5分） ─────────────────────────
  {
    id: "terms",
    scriptBlock: "ブロック6",
    title: "制作条件・クロージング",
    customerTitle: "制作にあたっての条件",
    minutes: 5,
    note: "次のアクション日を明言する：「1週間後に構成案と原稿の第1稿をお送りします」",
    followUps: [
      {
        trigger: "写真は用意できていない",
        ask: "外観と社長のお写真だけ、後日スマホで撮って送っていただけますか。この2枚は効きます",
      },
      {
        trigger: "写真はたくさんある",
        ask: "加工したものが写っている写真はありますか。事例のページに載せる写真が、一番問い合わせに繋がります",
      },
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
      { path: "terms.targetLaunchDate", label: "公開希望日", type: "date" },
      {
        path: "terms.ngItems",
        label: "出せない情報（NG）",
        customerLabel: "サイトに出さないとお約束した情報",
        type: "tags",
        required: true,
        help: "取引先名／価格／特定の技術など、出せない情報はありますか"
      },
      { path: "terms.photo.hasExisting", label: "使える既存写真があるか", type: "boolean" },
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
      { path: "terms.inquiryNotifyEmail", label: "問い合わせの通知先メール", type: "text", required: true },
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

