/**
 * KOBO — 生成ビジュアルの注文書（Generated Visual Brief）
 *
 * **画像を増やすための仕組みではない**（docs/31 原則①・docs/36）。
 * ここが持つのは「**何のために生成するのか**」だけで、1サイト2〜4枚を上限とする。
 *
 * 【証拠には絶対に届かない】
 * `source` と `intent` を**リテラル型で固定**してあり、`subject` は**描ける5つ**しか取れない。
 * 加工品・設備・外観・人・現場・商品を主題にできないので、
 * **「工場写真の代用品」を書こうとしても型が通らない**（`library.ts` と同じ思想）。
 *
 * 【画像が無いときが既定】
 * `status` の既定は `brief`——**注文書はあるが絵は無い**。この状態では
 * サイトはいままでと1ピクセルも変わらない。絵が届いて `ready` になって初めて効く。
 *
 * 【来歴を必ず持つ】
 * どこで作った絵なのか分からない画像をサイトに載せない。
 * `provider` は**人が入れる欄**で、こちらが勝手に埋めない。
 */

import type { AssetRole, AssetSubject } from "./asset.ts";
import { DRAWABLE } from "./asset.ts";
import type { VisualLanguageId } from "./visual-language.ts";

/** 何のために生成するか。**この4つ以外を作らない**（全帯に入れない・ご指示） */
export type GeneratedPurpose = "firstView" | "strength" | "company" | "peak";
export const GENERATED_PURPOSES: GeneratedPurpose[] = ["firstView", "strength", "company", "peak"];

/** 1サイトあたりの上限。**原則2〜4枚**（ご指示） */
export const MAX_GENERATED = 4;

export type GeneratedStatus = "brief" | "ready" | "failed" | "skipped";

export interface GeneratedPlacement {
  /** どのページか。`index` / `strengths` / `company` … */
  page: string;
  /** どこに置くか。最初の画面か、その内容の帯か */
  slot: "hero" | string;
  role: AssetRole;
}

/** モバイルで意味が消えないための指定（ご指示）。**desktopだけ綺麗な画像を作らせない** */
export interface GeneratedMobile {
  /** 焦点。0〜1。切り取られても残すべき中心 */
  focalPoint: { x: number; y: number };
  /** 縦長に切っても成立する比 */
  cropSafe: string;
  /** 文字が乗る側。**そこは空けて描かせる** */
  textSafeArea: "left" | "right" | "top" | "bottom" | "none";
}

export interface GeneratedProvenance {
  /** どの生成サービスで作ったか。**人が入れる。こちらが騙らない** */
  provider?: string;
  generatedAt?: string;
  /** 商用利用の可否。**空のまま公開しない** */
  commercialUse?: string;
  /** `projects/<ID>/generated/` の中のファイル名 */
  file?: string;
}

export interface GeneratedVisual {
  /** 会社データの印＋用途。**同じ入力なら同じID**＝作り直さない鍵 */
  visualId: string;
  purpose: GeneratedPurpose;
  /** **リテラル固定。** ここを広げない限り、生成以外の出所にはならない */
  source: "generated";
  /** **リテラル固定。** 証拠には型として届かない */
  intent: "atmosphere";
  subject: AssetSubject;
  direction: string;
  language: VisualLanguageId;
  mood: string;
  composition: string;
  material: string;
  lighting: string;
  aspectRatio: string;
  placement: GeneratedPlacement;
  mobile: GeneratedMobile;
  prompt: string;
  negativePrompt: string;
  provenance: GeneratedProvenance;
  status: GeneratedStatus;
  /** なぜこの絵を頼むのか。**人が読む欄**（検査はしない） */
  why?: string;
}

/**
 * **プロンプトに書かせない言葉**（ご指示）。
 *
 * 実在しない設備・製品・人・認証・数値を**絵の中に作らせない**ための歯止めである。
 * 生成サービスに渡す `negativePrompt` に入れると同時に、
 * **`prompt` の側にこれらが混ざっていないかを検査する**（両方やる。片方だけに頼らない）。
 */
export const FORBIDDEN_IN_PROMPT = [
  "logo", "brand", "trademark", "signage", "text", "letters", "numbers",
  "worker", "person", "people", "portrait", "hands",
  "factory floor", "workshop interior", "machine", "machinery", "equipment", "cnc",
  "product photo", "stock photo", "certificate", "award", "specification",
];

/** 毎回そのまま渡す打ち消し。**会社ごとに変えない**（禁止は会社によらない） */
export const NEGATIVE_PROMPT = [
  "photorealistic factory interior", "generic corporate illustration", "stock photo look",
  "any machinery or equipment", "any product resembling a real manufactured good",
  /** **支持を描かせるときの歯止め**（第9段階③）。関係だけを描かせ、治具そのものを描かせない */
  "jigs, fixtures, clamps, tooling, mounts, mechanical hardware",
  "people, workers, hands, faces", "logos, brand marks, signage",
  "text, letters, numbers, measurements, certificates",
  "fake technical specification", "watermark", "3d render clichés, lens flare, bokeh overload",
].join(", ");

/**
 * **登録の時点で弾く。** 表を持っているだけでは守られない（`assertLibrary` と同じ）。
 * 案件データから読んだ注文書にも、作った直後の注文書にも、同じものを当てる。
 */
export function assertGenerated(list: GeneratedVisual[]): void {
  const seen = new Set<string>();
  if (list.length > MAX_GENERATED) {
    throw new Error(`Generated: 1サイト ${MAX_GENERATED} 枚までです（${list.length}枚）`);
  }
  for (const x of list) {
    if (seen.has(x.visualId)) throw new Error(`Generated: visualId が重複しています（${x.visualId}）`);
    seen.add(x.visualId);
    if (x.source !== "generated" || x.intent !== "atmosphere") {
      throw new Error(`Generated: 出所と意図は固定です（${x.visualId}）`);
    }
    /** **実写でしか撮れない主題を、生成の主題にしない**（これがこの仕組みの要である） */
    if (!DRAWABLE.includes(x.subject)) {
      throw new Error(`Generated: 「${x.subject}」は生成の主題にできません（${x.visualId}）。実写でしか撮れないものは、お客様に依頼する`);
    }
    if (!GENERATED_PURPOSES.includes(x.purpose)) {
      throw new Error(`Generated: 用途が語彙にありません（${x.visualId}：${x.purpose}）`);
    }
    if (!x.prompt.trim()) throw new Error(`Generated: prompt が空です（${x.visualId}）`);
    if (!x.negativePrompt.trim()) throw new Error(`Generated: negativePrompt が空です（${x.visualId}）`);
    /** **禁じた言葉が注文書の側に混ざっていないか。** 打ち消しに書くだけでは足りない */
    const lower = x.prompt.toLowerCase();
    for (const w of FORBIDDEN_IN_PROMPT) {
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) {
        throw new Error(`Generated: prompt に「${w}」が入っています（${x.visualId}）。実在しないものを事実として描かせない`);
      }
    }
    if (x.mobile.focalPoint.x < 0 || x.mobile.focalPoint.x > 1 || x.mobile.focalPoint.y < 0 || x.mobile.focalPoint.y > 1) {
      throw new Error(`Generated: focalPoint は 0〜1 です（${x.visualId}）`);
    }
    if (!x.mobile.cropSafe.trim()) throw new Error(`Generated: cropSafe が空です（${x.visualId}）`);
    /** **絵が届いているなら、来歴が埋まっていること**（どこから来た画像か分からない状態を作らない） */
    if (x.status === "ready") {
      for (const k of ["provider", "generatedAt", "commercialUse", "file"] as const) {
        if (!x.provenance[k]?.trim()) {
          throw new Error(`Generated: 画像があるのに provenance.${k} が空です（${x.visualId}）`);
        }
      }
      if (/[/\\]/.test(x.provenance.file!)) {
        throw new Error(`Generated: file は projects/<ID>/generated/ の中のファイル名だけです（${x.visualId}）`);
      }
    }
  }
}

/** 使う側が持つ、生成画像への参照。**描くのに要る2つだけ**（`LibraryRef` と同じ形） */
export interface GeneratedRef {
  id: string;
  path: string;
  /** 焦点を CSS の言い方にしたもの（例 `"72% 45%"`）。**切り取られても中心が残る** */
  focal: string;
  /**
   * 文章が乗る側（`mobile.textSafeArea` をそのまま運ぶ・第9段階④）。
   *
   * **新しい語彙ではない。** 注文書はもともとこの値を持っていたのに、
   * ここで捨てていたので**CSSに届いていなかった**——
   * 「左3分の1を空ける」と注文した絵を、帯の全面に敷いていた。
   *
   * 使うのは**最初の画面だけ**である。帯のほうは `.inner` の外側（袖）と
   * 帯自身の上下の余白を使う——**そこは構造上かならず文字が無い。**
   * この値は絵を描かせるための指定で、帯の実レイアウトを見て決めた値ではなく、
   * 実測では strength が「下に文章」なのに**実際の文章は上79%**にあった。
   */
  safe: GeneratedMobile["textSafeArea"];
}

/** 書き出されたサイトから見た場所 */
export const generatedPath = (file: string): string => `/generated/${file}`;

/** その注文書が、いま画面に出せる状態か */
export const isReady = (x: GeneratedVisual): boolean =>
  x.status === "ready" && Boolean(x.provenance.file);
