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
  const EXPECT = {
    "a-precision": "precision|numbers:6 technique:4 materials:4 equipment:4 declined:1 people:1 history:1",
    "b-difficulty": "difficulty|declined:7 technique:6 numbers:4 materials:4 people:1 history:1",
    "c-speed": "speed|technique:6 equipment:6 numbers:4 materials:4 declined:3 people:1 history:1",
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

    check(`${name}：山は1ページに1つまで`, peakCount(top) <= 1, `${peakCount(top)}個`);
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
  check("写真0枚でも、山が作れている", peakCount(noPhoto) === 1,
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

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
