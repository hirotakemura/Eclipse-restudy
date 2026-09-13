/**
 * カードを何列で並べるか。
 *
 * **端数の行に1枚だけ残さない。**
 * 枠線と左の縦線を持つカードが、次の行の左に1枚だけ残ると壊れて見える（D-176）。
 * 2列と3列のうち、**余りの少ない（できれば割り切れる）ほう**を選ぶ。
 *
 *   2件 → 2列　3件 → 3列　4件 → 2列　5件 → 3列（3+2）　6件 → 3列
 *
 * 5件のように、どちらでも割り切れないときは、**余りが多いほう**を選ぶ。
 * 3列の「3+2」は、2列の「2+2+1」より落ち着いて見える。
 */
export function columnsFor(count: number): number {
  if (count <= 1) return 1;
  const score = (cols: number) => {
    const rest = count % cols;
    return rest === 0 ? Infinity : rest;
  };
  return score(3) >= score(2) ? 3 : 2;
}

/**
 * 端数がどうしても1枚になるとき（7件の3列など）は、
 * **最後の1枚を行いっぱいに広げる。** 左に取り残すよりは、そう置いたように見える。
 */
export function cardGrid(count: number): { cols: number; orphan: boolean } {
  const cols = columnsFor(count);
  return { cols, orphan: cols > 1 && count % cols === 1 };
}
