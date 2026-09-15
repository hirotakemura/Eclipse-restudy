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
import path from "node:path";
import { COMPATIBLE as _C } from "./lib/design/system/index.ts";
const COMPAT_OK = (c, ps) => ps.every((p) => (_C[c] ?? []).includes(p));
import {
  TYPE_ROLES, getTypeRole, sizeAt, clampOf, fit,
  WIDTH_FOR, WIDTHS, PRESENTATIONS,
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

console.log("\n━━━ 語彙が、画面に接続されているか ━━━");
{
  /**
   * **Phase 2 では、ここは「まだ接続していないこと」を確かめる試験だった。**
   * 「いつのまにか繋がっていた」を防ぐためで、Phase 4 でこの3件が落ちるのが接続の合図だった。
   * 落ちたので、**逆向き（接続されていること）に入れ替えた。**
   * 空いたままにすると、今度は**外れたことに気づけない。**
   */
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const band = fs.readFileSync("site-template/src/components/Band.astro", "utf8");
  check("site.css が、余白の語彙を受けている", /\.band\[data-density=/.test(css));
  check("site.css が、山の語彙を受けている", /\.band\[data-peak=/.test(css));
  check("site.css が、文字の役割を受けている", /\.band\[data-role\]/.test(css));
  check("Band.astro が、3つとも属性に出している",
    /data-density=/.test(band) && /data-peak=/.test(band) && /data-role=/.test(band));
  /** **山が無い帯には、印を付けない**（HTMLを無駄に太らせない） */
  check("山でない帯には data-peak を出さない", /peak !== "none" \? peak : undefined/.test(band));

  /**
   * **語彙の倍率と、CSSの倍率が同じか**（D-299）。
   *
   * Visual QA は `density.ts` から余白を計算し、お客様が見るのは `site.css` である。
   * **この2つがずれると、検査は緑のまま画面だけが壊れる。**
   * D-295（圧縮に畳まれて動きが死んでいた）と同じ形の事故で、
   * 「書いたものが出荷されていない」に気づけない。**だから突き合わせる。**
   *
   * site.css 自身の注記が「CSSに数字を書き写さない（D-197）」と言っているのに、
   * ここだけ手で書き写されていた。写すなら、**写し間違いを機械で捕まえる。**
   */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
  /** スマホの上書きは後ろにあるので、**最初の1件がPCの指定**である */
  const bare = strip(css);
  for (const d of DENSITIES) {
    const m = new RegExp(`\\.band\\[data-density="${d.id}"\\]\\s*\\{[^}]*padding:\\s*([^;]+);`).exec(bare);
    const want = d.scale === 1 ? "var(--section)" : `calc(var(--section) * ${d.scale})`;
    check(`余白「${d.id}」の倍率が、語彙とCSSで同じ（${d.scale}倍）`,
      !!m && m[1].replace(/\s+/g, " ").trim() === `${want} 0`, m ? m[1].trim() : "CSSに指定が無い");
  }
}


/**
 * ── Phase 3 ───────────────────────────────────────────
 *
 * **汎用プランを「簡易版」にしない**（ご指示§2）。
 *
 * 実測（docs/30）では、汎用でいちばん重要な「何を・いくらで」が
 * `pages/index.astro` に直接書かれており、**可否表も材料条件も Brief も通っていなかった。**
 * `/services/` ページには帯が1つも無く、見立ての8本の筋は全部製造業の言葉だったので、
 * **汎用の会社はほぼ全部0点 → `unknown` → 既定しか出ない**状態だった。
 */
console.log("\n━━━ 汎用の中心が、デザインシステムの中にあるか（D-272）━━━");
{
  const { CONTENTS, COMPATIBLE, getContent, usablePresentations } = await import("./lib/design/system/index.ts");
  const { materialsOf } = await import("./lib/design/materials.ts");

  check("取り扱いが、内容の語彙にある", CONTENTS.some((c) => c.id === "offerings"));
  check("可否表に行がある", Array.isArray(COMPATIBLE.offerings) && COMPATIBLE.offerings.length >= 3,
    JSON.stringify(COMPATIBLE.offerings));
  check("表として出せる（料金は突き合わせて読むもの）", COMPATIBLE.offerings.includes("spec"));

  const gen = JSON.parse(fs.readFileSync(path.join("fixtures", "mock-nakahara", "project.completed.json"), "utf8"));
  const m = materialsOf(gen, "offerings", false);
  check("汎用の案件で、取り扱いの材料が数えられている", m.count >= 1, JSON.stringify(m));
  check("選べる表現が1つ以上ある", usablePresentations("offerings", m).length >= 1,
    usablePresentations("offerings", m).join(","));

  const mfg = JSON.parse(fs.readFileSync(path.join("fixtures", "design-diversity", "a-precision.json"), "utf8"));
  check("製造業の案件では0件（帯が出ない）", materialsOf(mfg, "offerings", false).count === 0);

  /** **構成システムの外に戻っていないこと。** ここが戻ると、また幅も強さも固定になる */
  const indexAstro = fs.readFileSync("site-template/src/pages/index.astro", "utf8");
  check("トップページに、取り扱いが直接書かれていない",
    !/<Band[^>]*heading="取り扱い"/.test(indexAstro));
}

console.log("\n━━━ 製造業の見立てを、1点も動かしていないか ━━━");
{
  const { analyze } = await import("./lib/design/analysis.ts");
  const { sanitizeProject } = await import("./lib/sanitize.ts");
  /**
   * **汎用を足すついでに製造業が動くのが、いちばん怖い。**
   * 基準HTMLでも捕まるが、こちらは**点数そのもの**を留める。
   */
  /**
   * **`people` が 1 → 2 に上がったのは、意図した変更**（D-290）。
   * 代表者の写真に付けていた2点を外し、代表の言葉のほうを 1 → 2 にした。
   * **写真が届いただけで会社の話の順番が変わる**のを止めるための変更で、
   * 順位には影響していない（3社の基準HTMLは1ページも変わらなかった）。
   */
  const EXPECT = {
    "a-precision": "precision|numbers:6 technique:4 materials:4 equipment:4 people:2 declined:1 history:1",
    "b-difficulty": "difficulty|declined:7 technique:6 numbers:4 materials:4 people:2 history:1",
    "c-speed": "speed|technique:6 equipment:6 numbers:4 materials:4 declined:3 people:2 history:1",
  };
  for (const [f, want] of Object.entries(EXPECT)) {
    const p = sanitizeProject(JSON.parse(fs.readFileSync(path.join("fixtures", "design-diversity", `${f}.json`), "utf8")));
    const a = analyze(p);
    const got = `${a.primaryStrength}|${a.strands.map((s) => `${s.id}:${s.score}`).join(" ")}`;
    check(`${f}：見立てが1点も変わっていない`, got === want, `\n      期待 ${want}\n      現在 ${got}`);
  }
  check("汎用だけの筋は、製造業では0点になる", (() => {
    const p = sanitizeProject(JSON.parse(fs.readFileSync(path.join("fixtures", "design-diversity", "a-precision.json"), "utf8")));
    return !analyze(p).strands.some((s) => s.id === "offerings" || s.id === "voice");
  })());
}

console.log("\n━━━ 汎用には、汎用の判断軸があるか（D-273・ご指示§24）━━━");
{
  const { analyze, PRIMARY_STRENGTHS } = await import("./lib/design/analysis.ts");
  const { sanitizeProject } = await import("./lib/sanitize.ts");
  const { PLAYBOOK, LABEL } = await import("./lib/design/playbook.ts");
  const MFG = ["precision", "difficulty", "speed", "range", "engineering", "equipment", "craft"];
  const GEN = ["offering", "price", "reason", "voice", "record", "person"];

  const gen = sanitizeProject(JSON.parse(fs.readFileSync(path.join("fixtures", "mock-nakahara", "project.completed.json"), "utf8")));
  const a = analyze(gen);
  check("汎用の会社が、製造業の語彙で判定されない", !MFG.includes(a.primaryStrength), a.primaryStrength);
  check("汎用の語彙で判定されている", GEN.includes(a.primaryStrength) || a.primaryStrength === "history", a.primaryStrength);
  check("`unknown` に落ちていない（改修前はここだった）", a.primaryStrength !== "unknown");
  check("根拠が言える", typeof a.primaryWhy === "string" && a.primaryWhy.length > 0, a.primaryWhy);

  for (const id of GEN) {
    check(`${id}：手順書と名前がある`, Boolean(PLAYBOOK[id]) && Boolean(LABEL[id]));
    check(`${id}：主役に置く内容が、内容の語彙にある`,
      PLAYBOOK[id].leadPresentations.length === 0
      || (COMPAT_OK(PLAYBOOK[id].lead, PLAYBOOK[id].leadPresentations)),
      `${PLAYBOOK[id].lead} × ${PLAYBOOK[id].leadPresentations.join(",")}`);
  }
  check("語彙の一覧に、汎用のぶんが入っている", GEN.every((id) => PRIMARY_STRENGTHS.includes(id)));
}

console.log("\n━━━ 汎用の型が、簡易版になっていないか（D-274）━━━");
{
  const { directionsFor } = await import("./lib/design/direction.ts");
  const { resolveTheme } = await import("./lib/theme.ts");
  const g = directionsFor("general");
  const m = directionsFor("manufacturing");

  check("汎用の型が、製造業と同じ数以上ある", g.length >= m.length, `汎用 ${g.length} / 製造業 ${m.length}`);
  check("既存の3つを消していない（中原設備が使っている・D-198）",
    ["seikatsu", "shop", "gstandard"].every((id) => g.some((d) => d.id === id)));
  check("製造業の型が、汎用の商談に混ざっていない",
    !g.some((d) => m.some((x) => x.id === d.id)));

  /** **語彙の使い方が、製造業より痩せていないこと。** これが「簡易版にしない」の中身 */
  const V2 = ["editorial", "luxury", "modern", "human", "dynamic", "classic"];
  const richest = Math.max(...m.map((d) => d.layouts.length));
  check("新しい6つは、組み方の候補が2つ以上ある",
    V2.every((id) => g.find((d) => d.id === id).layouts.length >= 2),
    V2.map((id) => `${id}:${g.find((d) => d.id === id).layouts.length}`).join(" "));
  check("読み物・余白の組み方を使う型がある",
    V2.some((id) => g.find((d) => d.id === id).layouts.includes("editorial")));
  check("暗い面を使う型がある", V2.some((id) => g.find((d) => d.id === id).surfaces.includes("dark")));
  check("製造業でいちばん豊かな型と、同等の組み方の幅を持つ型がある",
    V2.some((id) => g.find((d) => d.id === id).layouts.length >= richest), `製造業の最大 ${richest}`);

  /** **型を選んだら、最初の画面も変わること**（D-275） */
  const heroes = new Set(V2.map((id) => resolveTheme({ direction: id }, "general").hero.id));
  check("型によって、最初の画面が変わる", heroes.size >= 2, [...heroes].join(","));
  check("お客様が選んだ最初の画面は、型に上書きされない",
    resolveTheme({ direction: "luxury", hero: "photo" }, "general").hero.id === "photo");
  check("製造業の案件は、いままでどおり",
    resolveTheme({ direction: "technical", hero: "figure" }, "manufacturing").hero.id === "figure");
}


console.log("\n━━━ 商品ごとに、見出しの言葉が違うか（D-276）━━━");
{
  const { headingFor } = await import("./lib/design/sections.ts");
  /** **水まわりの設備工事の会社に「加工事例」と出さない。** 実際に出ていた */
  check("汎用では「加工事例」が「実績」になる", headingFor("加工事例", true) === "実績");
  check("汎用では「他社様で難しいと言われた案件」が「選ばれている理由」になる",
    headingFor("他社様で難しいと言われた案件", true) === "選ばれている理由");
  /**
   * **製造業は1文字も変えない。**
   * 最初は「帯の種類」を鍵にしたため、対応可能範囲のページだけ使っている
   * 「対応できる材質・加工法」を潰し、基準HTMLが3ページ落ちた。
   */
  for (const h of ["加工事例", "他社様で難しいと言われた案件", "対応できる材質", "対応できる材質・加工法", "保有設備一覧", "仕様"]) {
    check(`製造業では「${h}」がそのまま`, headingFor(h, false) === h);
  }
  check("表に無い見出しは、汎用でもそのまま通る", headingFor("これからの5年", true) === "これからの5年");
  check("見出しが無い帯で落ちない", headingFor(undefined, true) === undefined);
}


/**
 * ── Phase 4 ───────────────────────────────────────────
 *
 * **ページ全体を見て決める層が、実際に効いているか。**
 *
 * 実測（docs/30）の出発点：
 *   組み方 1種（stack のみ）／余白 全帯同一／山なし
 */
console.log("\n━━━ ページ全体のリズムと山（D-277）━━━");
{
  const { composeVisual, peakCount } = await import("./lib/design/visual.ts");
  const { composeTop, composePage } = await import("./lib/design/sections.ts");
  const { analyze } = await import("./lib/design/analysis.ts");
  const { sanitizeProject } = await import("./lib/sanitize.ts");
  const { resolveTheme } = await import("./lib/theme.ts");

  const load = (dir, f) => sanitizeProject(JSON.parse(fs.readFileSync(path.join("fixtures", dir, f), "utf8")));
  const CASES = [
    ["a-precision", load("design-diversity", "a-precision.json"), "manufacturing"],
    ["b-difficulty", load("design-diversity", "b-difficulty.json"), "manufacturing"],
    ["c-speed", load("design-diversity", "c-speed.json"), "manufacturing"],
    ["中原設備（汎用）", load("mock-nakahara", "project.completed.json"), "general"],
  ];

  for (const [name, p, plan] of CASES) {
    const a = analyze(p);
    const r = resolveTheme(p.theme, plan);
    const top = composeVisual(composeTop(p, a, { hero: r.hero.id, direction: r.direction, hasProse: false }), p, a, { direction: r.direction });
    const body = top.filter((s) => s.kind !== "hero");

    /**
     * **主役は1つ。終盤の小さな山を入れても2つまで**（第7段階⑤）。
     * 2つ目は「ページが山のあと減衰するだけ」を直すためのもので、
     * **主役と並ぶものではない。** 下の3つで「小さい」ことを縛る。
     */
    check(`${name}：山は1ページに2つまで（主役1つ＋終盤1つ）`, peakCount(top) <= 2, `${peakCount(top)}個`);
    {
      const pk = body.map((s, i) => ({ i, s })).filter((x) => x.s.visual.peak !== "none");
      if (pk.length === 2) {
        const [a1, b1] = pk;
        check(`${name}：2つ目の山は、ページの後半にある`, b1.i >= Math.ceil(body.length / 2), `${b1.i + 1}/${body.length}`);
        check(`${name}：2つの山は2本以上離れている`, b1.i - a1.i >= 2, `${a1.i}→${b1.i}`);
        check(`${name}：2つの山の種類が違う`, a1.s.visual.peak !== b1.s.visual.peak,
          `${a1.s.visual.peak}／${b1.s.visual.peak}`);
        check(`${name}：2つ目の山は、余白も見出しも大きくしない`,
          b1.s.visual.density !== "vast" && b1.s.visual.role === "sectionTitle",
          `${b1.s.visual.density}/${b1.s.visual.role}`);
        check(`${name}：2つ目の山は、写真や工程ではない（画面を占めすぎる）`,
          !["image", "process"].includes(b1.s.visual.peak), b1.s.visual.peak);
      }
    }
    check(`${name}：余白が2種類以上ある（前は全帯同一）`,
      new Set(body.map((s) => s.visual.density)).size >= 2,
      body.map((s) => s.visual.density).join(","));
    check(`${name}：同じ余白が3つ続かない`,
      !body.some((s, i) => i >= 2 && s.visual.density === body[i - 1].visual.density && s.visual.density === body[i - 2].visual.density));
    check(`${name}：組み方が2種類以上ある（前は1種）`,
      new Set(body.map((s) => s.visual.layout)).size >= 2,
      body.map((s) => s.visual.layout).join(","));
    check(`${name}：帯を1つも減らしていない（D-204）`, top.length === composeTop(p, a, { hero: r.hero.id, direction: r.direction, hasProse: false }).length);
    /** **山の種類が、実際に描かれるものと合っているか**（D-278） */
    const peak = body.find((s) => s.visual.peak !== "none");
    if (peak) {
      const { getPeak } = await import("./lib/design/system/index.ts");
      const p2 = getPeak(peak.visual.peak);
      check(`${name}：山「${p2.id}」が、その帯の表現「${peak.presentation}」に合っている`,
        p2.presentations.length === 0 || p2.presentations.includes(peak.presentation));
      check(`${name}：表の山は、幅を使い切る（左が空かない）`,
        p2.id !== "spec" || peak.visual.layout === "stack", peak.visual.layout);
    }
  }

  /** **写真が0枚でも山が作れること**（ご指示§10） */
  const [, gen] = CASES[3];
  const a = analyze(gen);
  const r = resolveTheme(gen.theme, "general");
  const noPhoto = composeVisual(composeTop({ ...gen, photos: [] }, analyze({ ...gen, photos: [] }), { hero: r.hero.id, direction: "editorial", hasProse: false }), { ...gen, photos: [] }, analyze({ ...gen, photos: [] }), { direction: "editorial" });
  check("写真0枚でも、山が作れている", peakCount(noPhoto) >= 1,
    noPhoto.filter((s) => s.visual.peak !== "none").map((s) => `${s.content}:${s.visual.peak}`).join(","));

  /** 下層ページでも効いていること */
  for (const slug of ["strengths", "capability", "equipment"]) {
    const p = CASES[0][1];
    const aa = analyze(p);
    const secs = composeVisual(composePage(slug, p, aa, { direction: "technical" }), p, aa, { direction: "technical" });
    check(`下層 ${slug}：余白が2種類以上`, new Set(secs.map((s) => s.visual.density)).size >= 2,
      secs.map((s) => s.visual.density).join(","));
  }
}

console.log("\n━━━ 文字の値が、語彙から画面へ届いているか ━━━");
{
  const { themeVars } = await import("./lib/theme.ts");
  const { TYPE_ROLES, clampOf } = await import("./lib/design/system/index.ts");
  const vars = themeVars({ palette: "ai", font: "gothic", mood: "futsu" });
  for (const r of TYPE_ROLES) {
    check(`--t-${r.id} が出ている`, vars.includes(`--t-${r.id}:${clampOf(r)}`));
  }
  /** **CSSに数字を書き写していないこと。** 書き写すと語彙と画面がずれる（D-197） */
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const tail = css.slice(css.indexOf("ページ全体のリズムと山"));
  check("Phase 4 のCSSに、文字の実寸を書き写していない",
    !/font-size:\s*clamp\(\d/.test(tail.replace(/clamp\(19px, 1\.6vw, 24px\)/g, "")),
    (tail.match(/font-size:\s*clamp\([^)]*\)/g) ?? []).join(" "));
}


/**
 * ── Phase 6 ───────────────────────────────────────────
 *
 * **写真が届いても、サイトが別物にならないか**（ご指示§10）。
 * 実案件は写真0枚から始まる。あとから届くのが普通である。
 */
console.log("\n━━━ 写真は、骨格ではなくメディアの層か（D-289・D-290）━━━");
{
  const { analyze } = await import("./lib/design/analysis.ts");
  const { sanitizeProject } = await import("./lib/sanitize.ts");
  const { composeTop } = await import("./lib/design/sections.ts");
  const { composeVisual } = await import("./lib/design/visual.ts");
  const { resolveTheme } = await import("./lib/theme.ts");

  const PS = [
    { file: "gaikan.png", category: "外観" }, { file: "kojo-1.png", category: "工場・設備" },
    { file: "daihyo.png", category: "代表者" }, { file: "hataraku-1.png", category: "働く人" },
    { file: "jirei-1.png", category: "加工事例" },
  ];
  const CASES = [
    ["a-precision", path.join("fixtures", "design-diversity", "a-precision.json"), "manufacturing", "technical"],
    ["b-difficulty", path.join("fixtures", "design-diversity", "b-difficulty.json"), "manufacturing", "technical"],
    ["汎用C", path.join("fixtures", "visual-general", "g-c-people.json"), "general", "human"],
  ];
  for (const [name, f, plan, dir] of CASES) {
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const of = (photos) => {
      const p = sanitizeProject({ ...raw, photos });
      const a = analyze(p);
      const r = resolveTheme({ ...p.theme, direction: dir }, plan);
      return composeVisual(composeTop(p, a, { hero: r.hero.id, direction: dir, hasProse: false }), p, a, { direction: dir })
        .filter((s) => s.kind !== "hero" && s.content !== "photos")
        .map((s) => `${s.content}:${s.presentation}`);
    };
    const before = of([]), after = of(PS);
    check(`${name}：写真が届いても、帯が1つも消えない`,
      before.every((x) => after.includes(x)),
      `消えた ${before.filter((x) => !after.includes(x)).join(" ")}`);
    check(`${name}：写真が届いても、帯の順番が入れ替わらない`,
      JSON.stringify(after.filter((x) => before.includes(x))) === JSON.stringify(before.filter((x) => after.includes(x))),
      `${before.join(" ")}\n      → ${after.join(" ")}`);
  }

  /** **写真は見立ての点数を動かさない**（D-286・D-290） */
  const raw = JSON.parse(fs.readFileSync(path.join("fixtures", "visual-general", "g-c-people.json"), "utf8"));
  const s0 = analyze(sanitizeProject({ ...raw, photos: [] }));
  const s1 = analyze(sanitizeProject({ ...raw, photos: PS }));
  check("写真が届いても、最大の強みが変わらない",
    s0.primaryStrength === s1.primaryStrength, `${s0.primaryStrength} → ${s1.primaryStrength}`);
  check("写真が届いても、代表の筋の点数が変わらない",
    (s0.strands.find((x) => x.id === "people")?.score ?? 0) === (s1.strands.find((x) => x.id === "people")?.score ?? 0));
  /** ただし**写真の筋は上がる**（写真の帯を出すため）。0 のままでは足し算にならない */
  check("写真が届いたら、写真の筋は上がる",
    (s1.strands.find((x) => x.id === "photos")?.score ?? 0) > 0);

  /** **いちばん効く写真の区分が、見立てに入っているか**（D-287） */
  const withCase = analyze(sanitizeProject({ ...raw, photos: [{ file: "a.png", category: "加工事例" }] }));
  check("「加工事例」の写真が、見立てに数えられている",
    (withCase.strands.find((x) => x.id === "photos")?.score ?? 0) >= 2);
  const src = fs.readFileSync("lib/design/analysis.ts", "utf8");
  check("存在しない区分（加工品）を探していない", !src.includes('photoOf("加工品")'));
}


/**
 * ── Phase 8 ───────────────────────────────────────────
 *
 * **Desktopだけで成立するデザインは禁止**（ご指示§18）。
 *
 * 新しく効かせた語彙（組み方・余白・山）に、**スマホの姿が定義されているか**を見る。
 * ブラウザは立てない。**定義の漏れ**は、CSSを読めば分かる。
 * 実際の見え方は、キャプチャで人が見る（D-192）。
 */
console.log("\n━━━ スマホの姿が定義されているか（D-294）━━━");
{
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const { LAYOUTS, DENSITIES, PEAKS, TYPE_ROLES, sizeAt, getTypeRole } = await import("./lib/design/system/index.ts");
  /** スマホ向けの指定が入っている塊だけを取り出す */
  const mobile = [...css.matchAll(/@media \([^)]*max-width:\s*(\d+)px[^)]*\)\s*\{/g)]
    .map((m) => { // 対応する閉じ括弧までを取る
      let i = m.index + m[0].length, depth = 1;
      while (i < css.length && depth > 0) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
      return { w: Number(m[1]), body: css.slice(m.index, i) };
    });
  const mobileCss = mobile.filter((x) => x.w <= 900).map((x) => x.body).join("\n");

  check("スマホ向けの指定がある", mobileCss.length > 500, `${mobileCss.length}文字`);
  /** **横に並べる組み方は、必ず畳み方を書く。** 書かないと画面からはみ出す */
  for (const l of ["split", "offset", "editorial"]) {
    check(`組み方「${l}」に、スマホの畳み方がある`, mobileCss.includes(`data-layout="${l}"`));
  }
  /** **余白は振れ幅を標準へ寄せる**（D-271）。`normal` は倍率1なので指定不要 */
  for (const d of DENSITIES.filter((x) => x.id !== "normal")) {
    check(`余白「${d.id}」に、スマホの値がある`, mobileCss.includes(`data-density="${d.id}"`));
  }
  /** 山は、大きくするものによって調整が要るものと要らないものがある */
  for (const id of ["number", "process"]) {
    check(`山「${id}」に、スマホの調整がある`, mobileCss.includes(`data-peak="${id}"`));
  }
  check("指で押すものの最小の高さが決めてある", /--tap:\s*\d+px/.test(css));

  /**
   * **文字の階層が、スマホで潰れないこと**（Phase 1 の実測は 27/24/21 で3px差だった）。
   *
   * 最初は「隣り合う段の差が2px以上」と書いて落ちた。**主張が厳しすぎた。**
   * `body` `technical` `caption` `label` は**大きさではなく太さと字間で分けている**役割で、
   * 15pxと14pxが並ぶのは設計どおりである。
   * 潰れて困るのは**見出しの段**のほうなので、そこだけを見る。
   */
  const HEADINGS = ["display", "heroTitle", "numeric", "statement", "sectionTitle"];
  const at390 = HEADINGS.map((id) => sizeAt(getTypeRole(id), 390));
  const gaps = at390.slice(0, -1).map((v, i) => v - at390[i + 1]);
  check("スマホでも、見出しの段どうしが2px以上離れている", gaps.every((g) => g >= 2), at390.join("/"));
  check("スマホでも、いちばん小さい見出しが本文よりはっきり大きい",
    sizeAt(getTypeRole("sectionTitle"), 390) - sizeAt(getTypeRole("body"), 390) >= 4,
    `${sizeAt(getTypeRole("sectionTitle"), 390)} と ${sizeAt(getTypeRole("body"), 390)}`);

  /** **最初の画面の大きさは、型が決める。`.hero h1` に食われていないこと**（D-292） */
  for (const cls of ["hero-type", "hero-motif", "hero-sub"]) {
    check(`${cls} が、.hero h1 と同じ強さで書かれている`,
      new RegExp(`\\.hero h1\\.${cls}`).test(css), "クラスだけだと .hero h1 に負ける");
  }
  check("その修正に !important を使っていない",
    !/\.hero h1\.hero-[a-z]+[^{]*\{[^}]*!important/.test(css));
}

console.log("\n━━━ 商品ごとの言い換えに、漏れがないか（D-293）━━━");
{
  const { headingFor } = await import("./lib/design/sections.ts");
  /**
   * **製造業の言葉が、汎用の画面にそのまま出ていないか。**
   * 美容室に「工場・設備」と出ていた（実測）。D-276 で直したつもりの表からの漏れ。
   */
  const MFG_WORDS = ["加工事例", "他社様で難しいと言われた案件", "どうやって受けているか",
    "主な設備", "保有設備一覧", "対応できる材質", "対応できる材質・加工法", "工場・設備"];
  for (const w of MFG_WORDS) {
    check(`汎用では「${w}」を使わない`, headingFor(w, true) !== w, headingFor(w, true));
  }
}


/**
 * ── Phase 7 ───────────────────────────────────────────
 *
 * **動きは補助。情報を見せるための必須機能にしない**（ご指示§16）。
 *
 * ここで確かめたいのは「動くこと」ではなく、**動かなくても壊れないこと**である。
 * それと、**書いたものが出荷されているか**（D-295で、圧縮に畳まれて死んでいた）。
 */
console.log("\n━━━ 動きの安全装置（ご指示§16）━━━");
{
  const css = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const motion = css.slice(css.indexOf("/* ── 動き ──"), css.indexOf("/* ── 最初の画面の型"));

  check("動きは「動きを許している環境」の中だけに書いてある",
    /@media \(prefers-reduced-motion: no-preference\)/.test(motion));
  check("対応していないブラウザでは何も起きない（@supports で囲ってある）",
    /@supports \(animation-timeline: view\(\)\)/.test(motion));
  /** **初期状態で本文を隠さない。** `opacity: 0` から始めると、動かない環境で本文が消える */
  check("透明度0から始める指定が無い", !/opacity:\s*0\s*[;}]/.test(motion),
    (motion.match(/opacity:\s*0\s*[;}]/g) ?? []).join(" "));
  check("現れる動きは、見える濃さから始まる", /from\s*\{[^}]*opacity:\s*\.\d/.test(css));
  check("写真の動きは透明度を触らない（効かない環境で薄いままにしない）",
    /@keyframes kobo-reveal\s*\{[^}]*\}[^}]*\}/.test(css) && !/kobo-reveal[\s\S]{0,200}opacity/.test(css));
  check("印刷では動きを止め、必ず見えるようにしてある",
    /@media print[\s\S]{0,200}animation:\s*none[\s\S]{0,80}opacity:\s*1/.test(css));
  check("JavaScriptを使っていない", !/IntersectionObserver|addEventListener\(["\x27]scroll/.test(motion));

  /**
   * **`animation` の一括指定を、`animation-timeline` と並べない**（D-295）。
   *
   * 圧縮が1行に畳み、ブラウザが declaration ごと捨てる。
   * 実測（Chromium）：畳まれた形は `animation-name` が `none` になる。
   * **書いたものが出荷されていない**、という最も質の悪い壊れ方だった。
   */
  check("一括指定（animation:）を使っていない",
    !/\n\s*animation:\s/.test(motion.replace(/@media print[\s\S]*/, "")),
    (motion.match(/animation:\s[^;]*/g) ?? []).join(" / "));
  check("個別指定で書いてある", /animation-name:\s*kobo-/.test(motion));

  /** **謳い文句と実装を揃える**（D-240） */
  const { getMotion } = await import("./lib/design/system/index.ts");
  const note = getMotion("standard").note;
  for (const [word, impl] of [["遅れて現れる", /nth-child\(2\)/], ["線が伸びる", /kobo-grow/], ["覆いが外れる", /kobo-reveal/]]) {
    check(`「${word}」と謳っているなら、実装がある`, !note.includes(word) || impl.test(css), word);
  }
  check("謳っていない動きを、こっそり実装していない",
    !/countUp|parallax/i.test(css));
}

console.log("\n━━━ 山は、画面で本当に大きくなるか（第7段階③）━━━");
{
  /**
   * **語彙の表は「当ててよい」までしか言っていない**（D-357）。
   * 「条件を壁に」が実際に大きくするのは表だけで、札束・札には何も当たらない。
   * ここでは**6社 × 全15型 × 全ページ**を組み直して、
   * 立った山が**その帯で本当に何かを大きくする組み合わせ**であることを見る。
   */
  const cssP = fs.readFileSync("site-template/src/styles/site.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /** CSSの側の事実：`[data-peak="spec"]` が大きくするのは表である */
  check("「条件を壁に」が大きくするのは表である（CSSの側の事実）",
    /\.band\[data-peak="spec"\][^{]*\b(table|th|td)\b/.test(cssP) &&
    !/\.band\[data-peak="spec"\][^{]*\.(cards|chips)\b/.test(cssP));

  const { analyze: an8, PRIMARY_STRENGTHS: PS8 } = await import("./lib/design/analysis.ts");
  const { composeTop: top8, composePage: page8 } = await import("./lib/design/sections.ts");
  const { composeVisual: vis8 } = await import("./lib/design/visual.ts");
  const { sanitizeProject: san8 } = await import("./lib/sanitize.ts");
  const { DIRECTIONS: D8 } = await import("./lib/design/direction.ts");
  const FIX8 = [
    ["design-diversity", "a-precision.json"], ["design-diversity", "b-difficulty.json"],
    ["design-diversity", "c-speed.json"], ["visual-general", "g-a-service.json"],
    ["visual-general", "g-b-brand.json"], ["visual-general", "g-c-people.json"],
  ];
  const PG8 = ["strengths", "capability", "equipment", "cases", "case", "company", "message", "recruit", "contact"];
  const dead = [];
  const tops = [];
  let many = 0;
  for (const [d, f] of FIX8) {
    const pj = san8(JSON.parse(fs.readFileSync(path.join("fixtures", d, f), "utf8")));
    const a = an8(pj);
    for (const dir of D8) {
      const sets = [["index", top8(pj, a, { direction: dir.id, hasProse: false })],
        ...PG8.map((pg) => { try { return [pg, page8(pg, pj, a)]; } catch { return [pg, []]; } })];
      for (const [nm, secs] of sets) {
        if (!secs.length) continue;
        const v = vis8(secs, pj, a, { direction: dir.id }).filter((x) => x.kind !== "hero");
        const pk = v.filter((x) => x.visual.peak !== "none");
        if (pk.length > 2) many++;
        for (const x of pk) {
          /** **札束・札の帯に「条件を壁に」を立てない**——画面が1pxも変わらない */
          if (x.visual.peak === "spec" && x.presentation !== "spec") dead.push(`${dir.id}/${nm} ${x.content}/${x.presentation}`);
        }
        if (nm === "index") tops.push({ dir: dir.id, f, n: pk.length });
      }
    }
  }
  check("画面が変わらない山を立てていない（6社 × 全15型 × 全ページ）", dead.length === 0,
    `${dead.length}件 ${dead.slice(0, 3).join(" / ")}`);
  check("山が3つ以上のページが無い", many === 0, `${many}ページ`);
  /** **どの型でも、トップには山が1つ以上立つ**（汎用9方向を含む） */
  const noPeak = tops.filter((t) => t.n === 0);
  check("全15型・6社とも、トップに山が1つ以上ある", noPeak.length === 0,
    noPeak.map((t) => `${t.f}/${t.dir}`).join(" "));
}

console.log("\n━━━ 帯の幅（第7段階②）━━━");
{
  /**
   * **4段あるのに、画面では2段しか出ていなかった**（実測：narrow 81本／normal 1本／
   * wide 80本／full 6本、しかも normal・wide・full は同じ 1070px に潰れていた）。
   * 幅は**見せ方から決める**ようにしたので、ここで3つを見る。
   *   ① 表と実寸が食い違っていないか（D-197。余白で3度やった）
   *   ② 4段が本当に4つの別の幅になるか
   *   ③ 同じ見せ方が、いつでも同じ幅になるか
   */
  const css7 = fs.readFileSync("site-template/src/styles/site.css", "utf8");
  const { analyze: an7, PRIMARY_STRENGTHS: PS7 } = await import("./lib/design/analysis.ts");
  const { composeTop: top7, composePage: page7 } = await import("./lib/design/sections.ts");
  const { sanitizeProject: san7 } = await import("./lib/sanitize.ts");
  const FIX7 = [
    ["design-diversity", "a-precision.json"], ["design-diversity", "b-difficulty.json"],
    ["design-diversity", "c-speed.json"], ["visual-general", "g-a-service.json"],
    ["visual-general", "g-b-brand.json"], ["visual-general", "g-c-people.json"],
  ];
  const PG7 = ["strengths", "capability", "equipment", "cases", "case", "company", "message", "recruit", "contact"];
  const bare = css7.replace(/\/\*[\s\S]*?\*\//g, "");
  /** **スマホの規則も同じ形で書いてある**ので、全部拾ってつなぐ（最初の1件だけ見ない） */
  const cap = (w) => [...bare.matchAll(new RegExp(`\\.band\\[data-width="${w}"\\]\\s*>\\s*\\.inner\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(" ");
  const px = (w) => { const m = /max-width:\s*(\d+)px/.exec(cap(w)); return m ? Number(m[1]) : 0; };
  check("すべての見せ方に幅が決まっている",
    PRESENTATIONS.every((p) => WIDTHS.includes(WIDTH_FOR[p.id])),
    PRESENTATIONS.filter((p) => !WIDTHS.includes(WIDTH_FOR[p.id])).map((p) => p.id).join(" "));
  /** 上限が**使える幅の内側**にあること。外にあると、段として効かない */
  check("「狭い」と「標準」の上限が、使える幅の内側にある",
    px("narrow") > 0 && px("normal") > 0 && px("narrow") < px("normal") && px("normal") < 1070,
    `narrow ${px("narrow")} / normal ${px("normal")}`);
  /** `full` は上限ではなく、**左右の余白を捨てて帯の端まで届く** */
  check("「全幅」は左右の余白を捨てている",
    /max-width:\s*none/.test(cap("full")) && /padding-left:\s*0/.test(cap("full")), cap("full").trim());
  check("「広い」に上限を書いていない（既定が使える幅いっぱい）", cap("wide") === "", cap("wide"));
  /**
   * **余白を捨てた帯は、はみ出したものを切る**（D-353）。
   * 写真が現れる動きは 1.02 倍から戻るので、左右に 1% ずつ出る。余白があるうちは
   * 余白が飲んでいたが、`full` では**そのまま横スクロールになった。**
   * 「余白を捨てる」と「切る」は**必ず一緒**でなければならないので、ここで一緒に見る。
   */
  check("「全幅」は、はみ出したものを帯の端で切っている",
    /overflow-x:\s*clip/.test(cap("full")), cap("full").trim());
  /**
   * **端まで届くのは写真であって、言葉ではない**（D-354）。
   * 実測では、見出しも写真の説明書きも画面の端（左 0px）に貼り付いていた。
   * さらに、戻し方が `padding` だと**見出しの左罫（`padding-left: 14px`）を打ち消す**ので、
   * 罫だけが画面の端に残る。だから `margin` でなければならない。ここは両方を見る。
   */
  {
    const words = [...bare.matchAll(/([^{}]*\.band\[data-width="full"\][^{}]*h2[^{}]*)\{([^}]*)\}/g)]
      .filter((m) => !m[1].includes("data-layout"));
    check("「全幅」の帯でも、言葉には左右の余白がある", words.length > 0,
      words.map((m) => m[2].trim()).join(" | ") || "規則が無い");
    check("その余白は margin で戻している（padding だと見出しの飾りを打ち消す）",
      words.length > 0 && words.every((m) => /margin-left:/.test(m[2]) && !/padding-left:/.test(m[2])),
      words.map((m) => m[2].trim()).join(" | "));
  }

  /**
   * **同じ見せ方なら、いつでも同じ幅。**
   * 6社 × 全15勝ち筋で組み直して、見せ方ごとに幅が1種類であることを見る。
   */
  const seen = new Map();
  for (const [d, f] of FIX7) {
    const pj = san7(JSON.parse(fs.readFileSync(path.join("fixtures", d, f), "utf8")));
    const a0 = an7(pj);
    for (const st of PS7) {
      const a = { ...a0, primaryStrength: st };
      for (const secs of [top7(pj, a), ...PG7.map((pg) => { try { return page7(pg, pj, a); } catch { return []; } })]) {
        for (const x of secs) {
          if (x.kind === "hero") continue;
          (seen.get(x.presentation) ?? seen.set(x.presentation, new Set()).get(x.presentation)).add(x.width);
        }
      }
    }
  }
  const mixed = [...seen.entries()].filter(([, v]) => v.size > 1);
  check("同じ見せ方は、いつでも同じ幅（6社 × 全15勝ち筋）", mixed.length === 0,
    mixed.map(([k, v]) => `${k}:${[...v].join("/")}`).join(" "));
  /** 表のとおりに出ているか */
  const wrong = [...seen.entries()].filter(([k, v]) => ![...v][0] || [...v][0] !== WIDTH_FOR[k]);
  check("出てくる幅が、表のとおりである", wrong.length === 0,
    wrong.map(([k, v]) => `${k}: ${[...v].join("/")} ≠ ${WIDTH_FOR[k]}`).join(" "));
  /** **4段とも実際に使われているか。** 定義しただけで使われない段は、無いのと同じ */
  const used = new Set([...seen.values()].flatMap((v) => [...v]));
  check("4段とも実際に使われている", WIDTHS.every((w) => used.has(w)),
    WIDTHS.filter((w) => !used.has(w)).join(" ") || [...used].join(","));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
