/**
 * KOBO — 会社の見立て（Company Analysis）
 *
 * **この会社は、何で見せる会社か。**
 *
 * これまで、取材で聞いた74項目のうち27項目はサイトに一切届いていなかった。
 * とくにブロック2「引き合いの実態」（★最重要・20分）の9項目のうち、
 * サイトに届いていたのは `inquiry.goals` の1つだけだった（docs/21）。
 *
 * ここはその橋渡しをする。**聞いた内容から、見せ方の順番を決める。**
 *
 * 【段階1では、判定に Claude を使わない】
 * 理由は2つ。
 * ①**機械で決まることに生成を挟むと、捏造の入口が増える。**
 *   「精度で見せる」は判断だが、「±5μmで見せる」は捏造。値を作る余地を残さない。
 * ②規則なら試験が書ける。何を入れたら何が出るかを、毎回同じように確かめられる。
 *
 * **ここが出してよいのは「どのデータを、どの順で、どう見せるか」だけ。**
 * 文章も数値も作らない。値は必ず案件データから取る。
 */

import type { Project } from "../schema.ts";
import type { MotifId } from "./system/index.ts";

/** 何で見せる会社か */
export type ShowBy =
  | "declined" // 他社が断った仕事を受けている
  | "technique" // 工程・治具などの技術
  | "numbers" // 条件の数字（ロット・納期）
  | "materials" // 対応材質の幅
  | "equipment" // 設備
  | "photos" // 現場の写真
  | "people" // 人・代表
  | "history"; // 歴史

export interface Strand {
  id: ShowBy;
  /** 強さ。0 は材料が無いので使わない */
  score: number;
  /** なぜそう判断したか。**画面にも出して、社長に説明できるようにする** */
  why: string;
}

export interface Figure {
  label: string;
  value: string;
}

export interface Analysis {
  /** 強い順。score が 0 のものは含めない */
  strands: Strand[];
  /** 判断に使える数字。**大きく出す価値があるものだけ** */
  figures: Figure[];
  /** もっと受けたい仕事（`inquiry.wantMoreOf`） */
  seeking: string;
  /** 減らしたい問い合わせ（`inquiry.wantLessOf`） */
  avoiding: string;
  /** 最も利益率の高い仕事（`inquiry.mostProfitableWork`） */
  profitable: string;
  /** 実写の写真があるか。仮の画像しか無い案件で「写真で見せる」を選ばせない */
  hasRealPhotos: boolean;
  /**
   * 敷いてよい地紋。**聞き取りに裏づけのあるものだけ**（ご指示§7）。
   * 「工場っぽい歯車アイコン」を機械的に入れないための歯止め。
   */
  motifs: MotifId[];
  /**
   * 最初の画面に「1つだけ」大きく出す数字。
   *
   * **本文の中に埋めない**（ご指示§5）。精度 → 納期 → ロットの順で、
   * いちばん判断に効くものを選ぶ。無ければ null（そのときは数字のHeroを選ばせない）。
   */
  heroFigure: Figure | null;
  /**
   * この会社は**何で選ばれているか**。
   *
   * **推測で決めない**（D-205）。値ごとに根拠となる聞き取り項目を決めてあり、
   * どれにも当てはまらなければ `unknown`。
   * 製造業で「精度が強みだろう」と勝手に判断すると、**事実確認の思想と正面から衝突する。**
   * 公差を聞き取れていないのに精度で売る構成にするのは、嘘をつくのと同じ。
   */
  primaryStrength: PrimaryStrength;
  /** なぜそう判定したか。根拠を言えないものは採用しない */
  primaryWhy: string;
  /**
   * 2番目の強み。**1番と同じ規則で、根拠のあるものだけ。**
   *
   * 使い道は1つだけで、**AI版が「主役を入れ替えてよいか」を判断する材料**にする。
   * 2番が無い（根拠が1つしかない）会社で主役を入れ替えるのは、必ず推測になる。
   */
  secondaryStrength: PrimaryStrength;
  secondaryWhy: string;
}

/**
 * 最大の強み。**取材データに根拠がある強みだけを採る。**
 * 根拠が弱ければ `unknown` とし、規則版の安全な構成へ落とす（D-205）。
 */
export type PrimaryStrength =
  | "precision"   // 精度・公差
  | "difficulty"  // 難加工
  | "speed"       // 短納期・対応力
  | "range"       // 対応範囲の広さ
  | "engineering" // 設計対応
  | "equipment"   // 設備
  | "craft"       // 職人性
  | "history"     // 歴史
  | "unknown";

/**
 * 語彙の実体。**ここが単一の正**（D-197）。
 *
 * `brief.ts` にも同じ並びを書き写していたため、**中身がずれていた**（`response`
 * `coverage` `design` `heritage` という、`analyze()` が一度も返さない値が
 * 検査表に入っていた）。書き写した表は、必ずいつかずれる。
 */
export const PRIMARY_STRENGTHS: PrimaryStrength[] = [
  "precision", "difficulty", "speed", "range",
  "engineering", "equipment", "craft", "history", "unknown",
];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** 上位 n 件を、順位が同じなら定義順で返す */
const rank = (strands: Strand[]): Strand[] =>
  strands.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

export function analyze(project: Project): Analysis {
  const p = project as any;
  const cap = p.capability ?? {};
  const st = p.strengths ?? {};
  const basics = p.basics ?? {};
  const photos: any[] = p.photos ?? [];

  /**
   * 仮の画像（プレースホルダ）を写真として数えない。
   * 第1回は仮のSVGが9枚あり、**枚数の上では埋まって見えていた**（D-174）。
   */
  const real = photos.filter((x) => x?.file && !/\.svg$/i.test(String(x.file)));
  const hasRealPhotos = real.length > 0;
  const photoOf = (c: string) => real.some((x) => x.category === c);

  const strands: Strand[] = [
    {
      id: "declined",
      score: (text(st.wonAfterOthersDeclined) ? 3 : 0) + (text(st.workOthersAvoid) ? 1 : 0) + (text(st.hardestJob) ? 1 : 0),
      why: "他社様で断られた案件を受けた記録がある",
    },
    {
      id: "technique",
      score: (text(st.followUpFindings) ? 3 : 0) + (text(st.praiseFromClients) ? 1 : 0),
      why: "工程の工夫が、取材の追い質問で言葉になっている",
    },
    {
      id: "numbers",
      score: (text(cap.lotSize) ? 2 : 0) + (text(cap.shortestLeadTime) ? 2 : 0) + (text(cap.tolerance) ? 2 : 0),
      why: "ロット・納期・精度が数字で聞き取れている",
    },
    {
      id: "materials",
      score: len(cap.materials) >= 3 ? 2 : len(cap.materials) ? 1 : 0,
      why: "対応材質に幅がある",
    },
    {
      id: "equipment",
      /**
       * 型番まで分かっている設備が、設備ページの価値をつくる。
       *
       * **ただし上限を付ける（D-268）。**
       * ここだけ台数に比例して青天井で、ほかの見立ては全部 6点以下に収まっていた。
       * その結果、**設備の台数が分かっただけで、会社の物語より設備が前に出た。**
       * 実測：第2回取材で型番の確定した設備が2件→5件になった案件で、
       * 設備が 4点→10点に跳ね、**「他社様で難しいと言われた案件」を抜いて先頭に立った。**
       * その会社の話は「他社が断ったものを受ける」なのに、機械の一覧から始まる画面になる。
       *
       * **2台分かっているのは意味があるが、10台は5倍の意味を持たない。**
       * 上限はほかの見立ての最大（`numbers` の6点）に揃える。
       */
      score: Math.min((cap.equipment ?? []).filter((e: any) => text(e?.model) && text(e?.maker)).length * 2, 6),
      why: "メーカー・型番まで分かっている設備がある",
    },
    {
      id: "photos",
      score: (photoOf("工場・設備") ? 2 : 0) + (photoOf("外観") ? 1 : 0) + (photoOf("加工品") ? 2 : 0),
      why: "現場の写真を預かっている",
    },
    {
      id: "people",
      score: (text(p.executive?.vision) ? 1 : 0) + (photoOf("代表者") ? 2 : 0) + (photoOf("働く人") ? 1 : 0),
      why: "人を出せる材料がある",
    },
    {
      id: "history",
      // 沿革は2件では年表にならない。**薄い年表は、無いより悪い**
      score: (len(basics.history) >= 3 ? 2 : 0) + (text(basics.founded) && text(basics.generation) ? 1 : 0),
      why: "沿革と代替わりが聞き取れている",
    },
  ];

  /**
   * 引き合いの実態で、見せ方の順番を動かす。
   *
   * **ここで動かすのは順番だけ。文章は作らない。**
   * 「減らしたい問い合わせ」の中身（例：「中国・ベトナムと比較されると勝てない」）は、
   * **我々が判断するための情報であって、お客様のサイトに出す言葉ではない。**
   * 出すのではなく、**難易度で選ばれる構成にする**ことで応える。
   */
  const avoiding = text(p.inquiry?.wantLessOf);
  const seeking = text(p.inquiry?.wantMoreOf);
  const bump = (id: ShowBy, n: number, why: string) => {
    const s = strands.find((x) => x.id === id);
    if (s && s.score > 0) { s.score += n; s.why += `／${why}`; }
  };
  if (avoiding) {
    // 価格で比べられる仕事を減らしたい会社は、**難しさで選ばれる構成**にする
    bump("declined", 2, "価格で比べられる引き合いを減らしたいとのことなので前に出す");
    bump("technique", 2, "同上");
  }
  if (seeking) {
    // 増やしたい分野に実績が無くても、**対応材質と工法は近づける手がかりになる**
    bump("materials", 2, "増やしたい仕事があるので、対応できる範囲を前に出す");
  }

  /**
   * 大きく出す数字。**作らない。聞き取れているものだけ。**
   * 「従業員28名」のような規模の数字は、ここでは出さない。
   * 調達担当者が見ているのは「自分の案件を受けられるか」であって、会社の大きさではない。
   */
  const figures: Figure[] = [
    ["対応ロット", text(cap.lotSize)],
    ["最短納期", text(cap.shortestLeadTime)],
    ["対応精度", text(cap.tolerance)],
    ["対応材質", (cap.materials ?? []).join("・")],
  ]
    .filter(([, v]) => v)
    .map(([label, value]) => ({ label: label as string, value: value as string }));

  /**
   * 地紋の材料。**根拠の無い地紋は敷かない。**
   * 公差が聞けていないのに寸法線を引くのは、絵として嘘になる。
   */
  const motifs: MotifId[] = [];
  if (text(cap.tolerance)) motifs.push("dimension");
  if (text(st.followUpFindings)) { motifs.push("grid"); motifs.push("process"); }
  if (text(st.wonAfterOthersDeclined)) motifs.push("section");
  if (len(cap.materials) >= 3) motifs.push("grain");

  /**
   * **一言で言い切れる値でなければ、大きく出さない。**
   *
   * 松原精機の最短納期は「標準7日。急ぎの場合は最短3日」で、これを画面いっぱいに
   * 出すと**数字ではなく長い文**になる（実際にそうなった・D-203）。
   * 短く言い直すのは**こちらが値を作ること**になるので、しない（D-181）。
   * 短い値が聞き取れていなければ、この型は選ばない。
   */
  const ranked = rank(strands);

  /**
   * 最大の強みを決める。
   *
   * **点数は「その主張の根拠がどれだけ強いか」で付ける。**
   * 見立ての点数を流用すると、たとえば設備の記録が揃っているだけで
   * 「設備が強み」になり、**短納期の会社が設備の会社にされてしまう**（実際になった）。
   * 主張ごとに、その主張を支える聞き取りを直接見る。
   */
  const lead = text(cap.shortestLeadTime);
  const candidates: { id: PrimaryStrength; score: number; why: string }[] = [];
  const add = (id: PrimaryStrength, score: number, why: string) => {
    if (score > 0) candidates.push({ id, score, why });
  };

  add("precision", text(cap.tolerance) ? 5 : 0, "対応精度を聞き取れている");
  add("difficulty",
    (text(st.wonAfterOthersDeclined) ? 5 : 0) + (text(st.workOthersAvoid) ? 1 : 0),
    "他社様で断られた案件を受けた記録がある");
  add("speed",
    /最短|翌日|即日|当日/.test(lead) ? 5 : (lead && text(cap.lotSize) ? 3 : 0),
    "最短納期を聞き取れている");
  add("range",
    len(cap.materials) >= 5 ? 4 : (len(cap.materials) >= 3 && len(cap.processes) > 0 ? 3 : 0),
    "対応材質と加工法の幅を聞き取れている");
  add("engineering", /設計|図面/.test(text(st.followUpFindings)) ? 4 : 0,
    "設計・図面に関わる工夫を聞き取れている");
  add("equipment",
    (() => {
      const named = (cap.equipment ?? []).filter((e: any) => text(e?.maker) && text(e?.model)).length;
      return named >= 3 ? 4 : named >= 1 ? 2 : 0;
    })(),
    "メーカー・型番まで分かっている設備がある");
  add("craft", text(st.followUpFindings) && text(st.praiseFromClients) ? 3 : 0,
    "工程の工夫と、お客様の言葉の両方がある");
  add("history", text(basics.founded) && len(basics.history) >= 3 ? 3 : 0,
    "創業年と沿革3件以上を聞き取れている");

  // 同点のときは、見立ての点数で決める（既存の設計をそのまま使う）
  const strandFor: Record<string, ShowBy> = {
    precision: "numbers", difficulty: "declined", speed: "numbers", range: "materials",
    engineering: "technique", equipment: "equipment", craft: "technique", history: "history",
  };
  candidates.sort((a, b) =>
    b.score - a.score
    || (ranked.find((x) => x.id === strandFor[b.id])?.score ?? 0)
     - (ranked.find((x) => x.id === strandFor[a.id])?.score ?? 0));
  const primary = candidates[0];
  const primaryStrength: PrimaryStrength = primary?.id ?? "unknown";
  const primaryWhy = primary?.why ?? "根拠のある強みが聞き取れていないため、安全な構成にします";
  /** 2番目。**無ければ unknown。無いものを2番に繰り上げない** */
  const second = candidates[1];
  const secondaryStrength: PrimaryStrength = second?.id ?? "unknown";
  const secondaryWhy = second?.why ?? "2番目に挙げられる根拠はありません";

  /**
   * 最初の画面に「1つだけ」大きく出す数字。
   *
   * **その会社の強みに合った数字を選ぶ**（D-214）。
   * 短納期が強みの会社で「対応ロット 1個から」を大きく出しても、売りにならない。
   * 順番は強みで変える。**短く言い切れる値が無ければ null**（D-203）。
   */
  /**
   * **大きく出す数字は、その会社の強みそのものであること**（D-214）。
   *
   * 短納期が強みの会社で「対応ロット 1個から」を大きく出しても売りにならない。
   * 難加工が強みの会社で「最短納期 案件により相談」を大きく出すのは、もっと悪い。
   * **強みが数字で言える会社のときだけ**この型を使い、それ以外は null にして
   * 最初の画面を次の候補へ落とす（`resolveHero`）。
   *
   * 条件は2つ：**短く言い切れること**（D-203）と、**数字を含むこと。**
   */
  const short = (v: string) => v.length > 0 && v.length <= 14 && !/[。、]/.test(v) && /\d/.test(v);
  const FIGURE_OF: Partial<Record<PrimaryStrength, [string, string]>> = {
    precision: ["対応精度", text(cap.tolerance)],
    speed: ["最短納期", text(cap.shortestLeadTime)],
    range: ["対応ロット", text(cap.lotSize)],
  };
  const own = FIGURE_OF[primaryStrength];
  const heroFigure: Figure | null = own && short(own[1]) ? { label: own[0], value: own[1] } : null;

  return {
    strands: ranked,
    primaryStrength,
    primaryWhy,
    secondaryStrength,
    secondaryWhy,
    motifs,
    heroFigure,
    figures,
    seeking,
    avoiding,
    profitable: text(p.inquiry?.mostProfitableWork),
    hasRealPhotos,
  };
}
