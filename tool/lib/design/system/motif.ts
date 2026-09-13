/**
 * KOBO — グラフィック・モチーフ
 *
 * **「工場っぽい歯車アイコン」を機械的に入れない**（ご指示§7）。
 * 聞き取ったデータに裏づけのあるものだけを選ぶ。
 * 材料が無ければ `none`。**無いものを飾りで補わない。**
 *
 * 描き方はすべてCSS（線・グラデーション）。画像を足さない。
 */

export type MotifId = "none" | "dimension" | "grid" | "process" | "section" | "grain";

export interface Motif {
  id: MotifId;
  label: string;
  note: string;
  /** これを選んでよい根拠。案件データのどこに材料があるか */
  needs: string;
}

export const MOTIFS: Motif[] = [
  { id: "none", label: "なし", note: "既定。材料が無ければ付けない", needs: "—" },
  { id: "dimension", label: "寸法線", note: "数値の両端に寸法線を引く。精度で選ばれる会社に", needs: "capability.tolerance" },
  { id: "grid", label: "方眼・座標", note: "図面の下地。設計・技術が強みの会社に", needs: "strengths.followUpFindings（設計・図面の話）" },
  { id: "process", label: "工程線", note: "工程のつながりを線で示す。段取りが強みの会社に", needs: "strengths.followUpFindings（工程の工夫）" },
  { id: "section", label: "断面", note: "薄い形状を断面で示す。難加工・薄物の会社に", needs: "strengths.wonAfterOthersDeclined" },
  { id: "grain", label: "素材の目", note: "材質の違いを地紋で示す。材質の幅が強みの会社に", needs: "capability.materials（3種類以上）" },
];

export const getMotif = (id: string | undefined): Motif =>
  MOTIFS.find((m) => m.id === id) ?? MOTIFS[0]!;
