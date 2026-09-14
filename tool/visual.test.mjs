/**
 * KOBO — Visual Composition の語彙の試験（Phase 2）
 *
 * **ここで確かめたいのは「段が足りているか」。**
 *
 * 書き出した画面を測った結果が出発点である（docs/30）。
 *   1440px … 55 / 35 / 27 / 21 / 19 / 17　　← 3段しか効いていない
 *   390px  … 27 / 24 / 21 / 20 / 16　　　　 ← 最初の画面と見出しの差が3px
 *
 * **小さい画面で階層が消えないこと**が、この語彙のいちばんの要件である。
 * 大きい画面だけ立派になる語彙なら、作る意味がない。
 *
 * この段階では画面に接続していない（Phase 2）。**接続していないことも確かめる。**
 */
import fs from "node:fs";
import {
  TYPE_ROLES, getTypeRole, sizeAt, clampOf, fit,
  DENSITIES, getDensity, paddingOf,
  PEAKS, getPeak, canPeak,
  CTAS, getCta, canCta,
} from "./lib/design/system/index.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { console.log(`  ✓ ${name}`); ok++; }
  else { console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); ng++; }
};

console.log("\n━━━ 文字の段が、小さい画面でも残るか ━━━");
{
  /** いまの実測値。ここより良くなっていなければ、作った意味がない */
  const NOW_MOBILE = 5;   // 27 / 24 / 21 / 20 / 16
  const NOW_DESKTOP = 6;  // 55 / 35 / 27 / 21 / 19 / 17

  for (const [w, floor] of [[390, NOW_MOBILE], [1440, NOW_DESKTOP]]) {
    const sizes = TYPE_ROLES.map((t) => sizeAt(t, w));
    const steps = new Set(sizes).size;
    check(`${w}px：段が ${steps}段（いまは ${floor}段）`, steps > floor, sizes.join(" / "));
  }

  /** **順序が崩れないこと。** 大きい画面で逆転する語彙は、段として使えない */
  for (const w of [360, 390, 768, 1024, 1440, 1920]) {
    const sizes = TYPE_ROLES.map((t) => sizeAt(t, w));
    const sorted = [...sizes].sort((a, b) => b - a);
    check(`${w}px：上から下へ、必ず小さくなる`,
      JSON.stringify(sizes) === JSON.stringify(sorted), sizes.join(" / "));
  }

  check("最初の画面と帯の見出しが、スマホでも離れている",
    sizeAt(getTypeRole("heroTitle"), 390) - sizeAt(getTypeRole("sectionTitle"), 390) >= 6,
    `${sizeAt(getTypeRole("heroTitle"), 390)} と ${sizeAt(getTypeRole("sectionTitle"), 390)}（いまは 27 と 24 で 3px）`);

  check("すべての役割で、下限 < 上限", TYPE_ROLES.every((t) => t.min < t.max),
    TYPE_ROLES.filter((t) => t.min >= t.max).map((t) => t.id).join(","));
  check("clamp() の形が作れる", clampOf(getTypeRole("display")) === "clamp(40px, 8vw, 104px)", clampOf(getTypeRole("display")));
  check("知らない名前は本文に落ちる", getTypeRole("なにか").id === "body");
}

console.log("\n━━━ 長い文字列を、巨大に組まないか（D-251の再発防止）━━━");
{
  check("短い値は、値のまま", fit("numeric", "±0.005mm").id === "numeric");
  check("「案件により相談」は値として組まない",
    fit("numeric", "案件により相談です。詳しくはお問い合わせください").id !== "numeric",
    fit("numeric", "案件により相談です。詳しくはお問い合わせください").id);
  check("長い一文は、山として組まない",
    fit("display", "他社から「ビビって割れるから無理」と断られた案件を複数回受注しています").id !== "display");
  check("落ちた先も、必ず語彙の中",
    TYPE_ROLES.some((t) => t.id === fit("display", "あ".repeat(300)).id));
  check("上限のない役割は、どれだけ長くても落ちない",
    fit("body", "あ".repeat(500)).id === "body");
  check("空文字でも落ちない", fit("display", "").id === "display");
}

console.log("\n━━━ 余白に段があるか ━━━");
{
  const scales = DENSITIES.map((d) => d.scale);
  check("4段あり、上から下へ必ず大きくなる",
    scales.length === 4 && scales.every((v, i) => i === 0 || v > scales[i - 1]), scales.join(" / "));
  check("既定は「標準」で、いまと同じ倍率（画面を変えない）",
    getDensity(undefined).id === "normal" && getDensity(undefined).scale === 1.0);
  /**
   * **スマホでは、標準（1.0）のほうへ寄せる。**
   *
   * 最初は「スマホの倍率は必ず小さい」と書いたが、試験が落ちて考え直した。
   * それだと `tight` は**もっと詰まる**ことになる。スマホの `--section` は 40px で、
   * 0.6倍なら 24px。ここをさらに詰めると**帯どうしがくっついて見える。**
   *
   * 絞りたいのは「広げるほう」である。1440pxの 88×2.4 = 211px をそのまま当てると
   * **画面の4分の1が空になる。** つまり正しい言い方は
   * **「上にも下にも、振れ幅を standard へ寄せる」**である。
   */
  check("スマホでは、振れ幅を標準へ寄せてある",
    DENSITIES.every((d) => Math.abs(d.mobileScale - 1) <= Math.abs(d.scale - 1)),
    DENSITIES.map((d) => `${d.id} ${d.scale}→${d.mobileScale}`).join(" / "));
  check("スマホでも差は残る（全部同じにしない）",
    new Set(DENSITIES.map((d) => d.mobileScale)).size === 4,
    DENSITIES.map((d) => d.mobileScale).join(","));
  check("実測の 88px から、4種類の余白が出る",
    new Set(DENSITIES.map((d) => paddingOf(d, 88))).size === 4,
    DENSITIES.map((d) => `${d.id}:${paddingOf(d, 88)}px`).join(" "));
  check("実測の 40px（スマホ）でも、4種類出る",
    new Set(DENSITIES.map((d) => paddingOf(d, 40, true))).size === 4,
    DENSITIES.map((d) => `${d.id}:${paddingOf(d, 40, true)}px`).join(" "));
}

console.log("\n━━━ 写真が0枚でも、山が作れるか（ご指示§10）━━━");
{
  const usable = PEAKS.filter((p) => p.id !== "none" && !p.needsPhoto);
  check("写真の要らない山が4つ以上ある", usable.length >= 4, usable.map((p) => p.id).join(","));
  check("既定は「山を作らない」（画面を変えない）", getPeak(undefined).id === "none");
  check("写真の要る山は、写真が無いと選べない",
    !canPeak(getPeak("image"), "photos", false) && canPeak(getPeak("image"), "photos", true));
  check("「山を作らない」は、山として選ばれない", !canPeak(getPeak("none"), "conditions", true));
  check("値の山は、条件の帯にしか当たらない",
    canPeak(getPeak("number"), "conditions", false) && !canPeak(getPeak("number"), "history", false));
  check("一言の山は、写真0枚でも当たる",
    canPeak(getPeak("statement"), "declined", false));
  /** **山の文字の役割は、必ず語彙の中** */
  check("どの山も、文字の役割が語彙の中にある",
    PEAKS.every((p) => TYPE_ROLES.some((t) => t.id === p.role)),
    PEAKS.filter((p) => !TYPE_ROLES.some((t) => t.id === p.role)).map((p) => p.id).join(","));
}

console.log("\n━━━ 問い合わせ導線の型 ━━━");
{
  check("6種類ある", CTAS.length === 6, CTAS.map((c) => c.id).join(","));
  check("既定は「標準」＝いまの見え方（画面を変えない）", getCta(undefined).id === "standard" && getCta(undefined).on === "accent");
  check("写真の要る型は1つだけ", CTAS.filter((c) => c.needsPhoto).length === 1);
  check("写真が無くても5種類使える",
    CTAS.filter((c) => canCta(c, false)).length === 5);
  check("どの型も、文字の役割が語彙の中にある",
    CTAS.every((c) => TYPE_ROLES.some((t) => t.id === c.role)));
  /** 地の色は、コントラスト検査が見ている名前と同じ組でなければならない */
  check("地の色の名前が、面の語彙と揃っている",
    CTAS.every((c) => ["accent", "bg", "bgSoft", "ink"].includes(c.on)));
}

console.log("\n━━━ Phase 2 では、まだ画面に接続していないか ━━━");
{
  /**
   * **語彙を作った段階で画面が動いていたら、それは Phase 2 ではない。**
   * 接続は Phase 4（`composeVisual()`）で行う。ここで確かめておくと、
   * 「いつのまにか繋がっていた」が起きない。
   */
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const band = fs.readFileSync("site-template/src/components/Band.astro", "utf8");
  const sections = fs.readFileSync("lib/design/sections.ts", "utf8");
  for (const [name, src] of [["site.css", css], ["Band.astro", band], ["sections.ts", sections]]) {
    check(`${name} は、まだ新しい語彙を使っていない`,
      !/data-density|data-peak|data-cta|data-type-role|typography\.ts|density\.ts|peak\.ts|cta\.ts/.test(src));
  }
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
