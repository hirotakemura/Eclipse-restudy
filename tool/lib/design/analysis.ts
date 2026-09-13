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
}

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
      // 型番まで分かっている設備が、設備ページの価値をつくる
      score: (cap.equipment ?? []).filter((e: any) => text(e?.model) && text(e?.maker)).length * 2,
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

  return {
    strands: rank(strands),
    figures,
    seeking,
    avoiding,
    profitable: text(p.inquiry?.mostProfitableWork),
    hasRealPhotos,
  };
}
