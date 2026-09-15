/**
 * KOBO — 動き
 *
 * **動きは補助。情報を見せるための必須機能にしない**（ご指示③）。
 *
 * 【実装原則・例外なし】
 *   1. JSが動かなくても本文は読める
 *   2. **初期状態を opacity:0 にして本文を隠さない**
 *   3. 動きが無くても情報構造が成立する
 *   4. `prefers-reduced-motion` に対応する
 *   5. 印刷時にも本文が消えない
 *   6. 重いアニメーションライブラリを使わない
 *
 * 実現方法：動きは `@media (prefers-reduced-motion: no-preference)` の**中だけ**に書く。
 * 素のHTMLは最初から見えている。検査でも `opacity:0` の焼き込みを見る。
 */

export type MotionId = "none" | "subtle" | "standard";

export interface Motion {
  id: MotionId;
  label: string;
  note: string;
}

export const MOTIONS: Motion[] = [
  { id: "none", label: "動かさない", note: "印刷物に近い見せ方。動きを嫌うお客様に" },
  { id: "subtle", label: "控えめ", note: "既定。スクロールで静かに現れる程度" },
  /**
   * **「数字が数え上がる」は取り下げた**（D-240）。
   * 我々が大きく出す値は「±0.005mm」「標準7日。急ぎの場合は最短3日」のような
   * **文字列**で、数として数え上げられない。数えられる形に言い直すのは
   * こちらが値を作ることになる（D-181）。**謳っていて実装が無い状態を残さない。**
   */
  /**
   * **謳い文句と、実装を揃える**（D-240）。ここに書いたものは、必ず実装がある。
   * ①並んだものが少しずつ遅れて現れる ②工程の線が伸びる
   * ③写真は覆いが外れる形で現れる ④画面の山だけ、少し長く現れる
   */
  { id: "standard", label: "標準", note: "並んだものが少しずつ遅れて現れる・工程の線が伸びる・写真は覆いが外れる。**意味のある動きだけ**" },
];

export const getMotion = (id: string | undefined): Motion =>
  MOTIONS.find((m) => m.id === id) ?? MOTIONS[1]!;
