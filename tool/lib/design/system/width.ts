/**
 * KOBO — 帯の幅の語彙（Width）
 *
 * **4段ある。が、実際には2段しか使われていなかった**（第7段階の実測）。
 *
 *   narrow 81本 ／ normal **1本** ／ wide 80本 ／ full 6本（全15型・168帯）
 *
 * しかも `wide`（1440px）と `full`（1680px）は、**どちらも使える幅より大きい。**
 * 画面1280pxで脇のメニューを引くと中身に使えるのは1070pxなので、
 * `normal` `wide` `full` の3つが**同じ1070pxに潰れていた。**
 * 実効的には `760` と `1070` の2段である。
 *
 * 【幅は「何を見せるか」で決まる】
 * 帯の種類（`Section.kind`）ごとに手で書いていたため、
 * **同じ見せ方なのに帯によって幅が違う**ことが起きていた
 * （工程は事例ページで760px・強みページで760px・トップで782px…）。
 * ここでは**見せ方（`PresentationId`）から決める。**
 * 同じ見せ方なら必ず同じ幅になる——**目が「この幅はこういう話」と覚えられる。**
 *
 * 【型ごとの偏りは、ここでは作らない】
 * 「精密加工は広め、職人は狭め」は、**型が選ぶ見せ方の偏りとして自然に出る**
 * （`PLAYBOOK` が型ごとに違う見せ方を好むため）。
 * 幅の表に型を持ち込むと、同じ見せ方が型によって違う幅になり、**覚えられなくなる。**
 */

import type { PresentationId } from "./presentation.ts";

export type WidthId =
  | "narrow" // 読む幅。1行が長くなりすぎない
  | "normal" // 読む＋見る。箇条書き・工程・札
  | "wide"   // 突き合わせて読む。表・カード
  | "full";  // 見る。写真・大きな数字。帯の端まで届く

export const WIDTHS: WidthId[] = ["narrow", "normal", "wide", "full"];

/**
 * 見せ方ごとの幅。**ここが単一の正**（`site.css` の実寸と `width.test` が突き合わせる）。
 *
 *   narrow … 文章と引用と年表。**縦に読むもの**
 *   normal … 箇条書き・札・工程・対比。**読むが、横にも少し広がるもの**
 *   wide   … 表とカード。**突き合わせて読むもの**は幅が要る
 *   full   … 写真と大きな数字。**見るもの**は端まで届かせる
 */
export const WIDTH_FOR: Record<PresentationId, WidthId> = {
  prose: "narrow",
  longform: "narrow",
  quote: "narrow",
  timeline: "narrow",
  /**
   * **工程は「縦に読むもの」である。**
   * 番号 → 題 → 本文 が上から下に続くので、横へ広げても読む距離が伸びるだけ。
   * ここを `normal` にしたら、**組み方まで横置きに変わって見出しが項目名に落ちた**
   * （`visual.ts` は「狭い帯は積む」で組み方を決めている）。幅の変更で組み方を動かさない。
   */
  process: "narrow",
  list: "normal",
  chips: "normal",
  comparison: "normal",
  spec: "wide",
  cardGrid: "wide",
  largeNumber: "full",
  fullWidth: "full",
};

export const widthFor = (p: PresentationId | undefined): WidthId =>
  (p && WIDTH_FOR[p]) || "normal";
