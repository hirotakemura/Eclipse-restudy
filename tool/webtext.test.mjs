/**
 * KOBO — 取材原文とWeb掲載文の分離（第10段階①）
 *
 * **確かめたいのは「掲載文が出るか」だけではない。**
 *   ① 掲載文が無い既存データで、**画面が1バイトも変わらない**こと
 *   ② 人が読んだ印が無ければ、**取材原文が出る**こと
 *   ③ 印があれば、掲載文が出ること
 *   ④ 掲載文を足しても、**構成・型・モチーフ・素材が1つも動かない**こと（いちばん重要）
 *   ⑤ 掲載文を足しても、**案件データの印（`projectHashOf`）が変わらない**こと
 *   ⑥ 持ってよい欄の表に無いパスは、読み込みで落ちること
 *   ⑦ 掲載文が、**事実検証の出典に入っていない**こと
 */
import fs from "node:fs";
import childProcess from "node:child_process";
import { analyze } from "./lib/design/analysis.ts";
import { composeTop, composePage } from "./lib/design/sections.ts";
import { composeVisual } from "./lib/design/visual.ts";
import { composeAssets } from "./lib/design/assets.ts";
import { materialsOf } from "./lib/design/materials.ts";
import { composeSite } from "./lib/design/architecture.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { projectHashOf } from "./lib/design/brief.ts";
import { buildSourceText, verifyDraft } from "./lib/verify.ts";
import { writerView } from "./lib/generate/writer-view.ts";
import { planGeneratedVisuals } from "./lib/design/generated-brief.ts";
import { assertWebText, WEB_TEXT_PATHS, webTextShape } from "./lib/schema.ts";
import { webTextFields, duplicateBlocks } from "./lib/webtext-review.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); }
};
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const FIXTURES = [
  ["A 精度", "fixtures/design-diversity/a-precision.json"],
  ["B 難加工", "fixtures/design-diversity/b-difficulty.json"],
  ["C 短納期", "fixtures/design-diversity/c-speed.json"],
  ["汎用A", "fixtures/visual-general/g-a-service.json"],
  ["汎用B", "fixtures/visual-general/g-b-brand.json"],
  ["汎用C", "fixtures/visual-general/g-c-people.json"],
];
const PAGES = ["strengths", "capability", "equipment", "cases", "company", "contact"];
const REVIEWED = "2026-09-17T00:00:00.000Z";

/** 同じ段落を2つの欄に入れた案件データ（松原精機で実際に起きた形） */
const twiceRaw = (p) => ({ ...p, strengths: { ...p.strengths,
  workOthersAvoid: "支持点を変えた専用の押さえ治具を製作し、荒取りと仕上げの間に休ませる時間を取りました。",
  hardestJob: "支持点を変えた専用の押さえ治具を製作し、荒取りと仕上げの間に休ませる時間を取りました。" } });

/** 掲載文を「まったく違う文章」で全欄に入れる。**違いが出るなら、必ずここで出る** */
const withWeb = (p, reviewedAt = REVIEWED) => {
  const webText = {};
  const put = (path, v) => { if (v) webText[path] = { text: `【掲載文】${path}`, source: "human", reviewedBy: "検査", reviewedAt }; };
  put("basics.businessSummary", p.basics?.businessSummary);
  for (const k of ["wonAfterOthersDeclined", "followUpFindings", "workOthersAvoid", "hardestJob", "praiseFromClients"]) {
    put(`strengths.${k}`, p.strengths?.[k]);
  }
  put("executive.vision", p.executive?.vision);
  put("executive.messageToStaff", p.executive?.messageToStaff);
  put("general.reasonChosen", p.general?.reasonChosen);
  put("general.idealCustomer", p.general?.idealCustomer);
  (p.general?.offerings ?? []).forEach((o, i) => put(`general.offerings[${i}].detail`, o?.detail));
  (p.cases ?? []).forEach((c, i) => {
    for (const k of ["partDescription", "challenge", "solution", "result"]) put(`cases[${i}].${k}`, c?.[k]);
  });
  return { ...p, webText };
};

console.log("\n━━━ ④ 掲載文を足しても、サイトの組み立てが1つも動かない ━━━");
{
  /**
   * **この段のいちばん重要な検査である。**
   * 掲載文は表示だけのもので、**構成・型・モチーフ・素材・ページの有無を決める層は
   * いっさい通らない**——通ってしまうと、文章を直すたびにレイアウトが動く。
   */
  let moved = 0, checked = 0;
  const diffs = [];
  for (const [name, f] of FIXTURES) {
    const rawP = sanitizeProject(load(f));
    const webP = sanitizeProject(withWeb(load(f)));
    const a1 = analyze(rawP), a2 = analyze(webP);
    checked++;
    if (JSON.stringify(a1) !== JSON.stringify(a2)) { moved++; diffs.push(`${name}/analyze`); }
    if (JSON.stringify(composeSite(rawP, a1)) !== JSON.stringify(composeSite(webP, a2))) { moved++; diffs.push(`${name}/composeSite`); }
    for (const c of ["declined", "technique", "praise", "executive", "cases", "people"]) {
      if (JSON.stringify(materialsOf(rawP, c, a1.hasRealPhotos)) !== JSON.stringify(materialsOf(webP, c, a2.hasRealPhotos))) {
        moved++; diffs.push(`${name}/materials:${c}`);
      }
    }
    if (JSON.stringify(planGeneratedVisuals(rawP, a1, "standard")) !== JSON.stringify(planGeneratedVisuals(webP, a2, "standard"))) {
      moved++; diffs.push(`${name}/generated`);
    }
    for (const d of DIRECTIONS) {
      for (const page of ["index", ...PAGES]) {
        const base = (p, a) => page === "index" ? composeTop(p, a, { direction: d.id }) : composePage(page, p, a, { direction: d.id });
        const of = (p, a) => composeAssets(composeVisual(base(p, a), p, a, { direction: d.id }), p, a, { direction: d.id, page });
        checked++;
        if (JSON.stringify(of(rawP, a1)) !== JSON.stringify(of(webP, a2))) { moved++; diffs.push(`${name}/${d.id}/${page}`); }
      }
    }
  }
  check(`掲載文を全欄に入れても、見立て・構成・帯・型・モチーフ・素材・注文書が1つも動かない（${checked}通り）`,
    moved === 0, diffs.slice(0, 5).join(" "));
}

console.log("\n━━━ ⑤ 案件データの印が変わらない ━━━");
{
  /**
   * 変わると `visualId` が変わり、**届いている絵の `ready` が引き継げなくなる**（D-369）。
   * 掲載文を直しただけで画像が消える、という壊れ方をする。
   */
  const bad = [];
  for (const [name, f] of FIXTURES) {
    const before = projectHashOf(load(f));
    const after = projectHashOf(withWeb(load(f)));
    if (before !== after) bad.push(`${name}: ${before} → ${after}`);
  }
  check("掲載文を足しても projectHashOf が変わらない", bad.length === 0, bad.join(" "));
}

console.log("\n━━━ ⑦ 掲載文は、事実検証の出典にならない ━━━");
{
  /**
   * 認めると、**掲載文に混ざった数値が自分自身を出典にして通る。**
   * `unconfirmedNotes` を外しているのと同じ理由である。
   */
  const p = load(FIXTURES[0][1]);
  const withFake = { ...p, webText: { "strengths.hardestJob": { text: "公差は ±0.0003μm まで対応します", source: "human", reviewedBy: "検査", reviewedAt: REVIEWED } } };
  check("掲載文の中身が、出典の文字列に入っていない",
    !buildSourceText(withFake).includes("0.0003"));
  const f = verifyDraft("公差は ±0.0003μm まで対応します", withFake);
  check("掲載文にある数値でも、原稿に書けば出典なしとして捕まる",
    f.some((x) => x.severity === "error"), f.map((x) => x.kind).join(" "));
  /** **原稿を書くAIにも渡していない**（渡すと、画面に出ている文章を散文で書き直す） */
  check("原稿を書く側に、掲載文を渡していない", writerView(withFake).webText === undefined);
}

console.log("\n━━━ ⑥ 持ってよい欄の表 ━━━");
{
  check("表は15パス", WEB_TEXT_PATHS.length === 15, `${WEB_TEXT_PATHS.length}パス`);
  /** **事実の欄に掲載文を置けない。** 置けると、公差を「読みやすく」書き換える道ができる */
  const FACTS = ["capability.tolerance", "capability.lotSize", "basics.tel", "basics.address",
    "capability.equipment[].model", "strengths.defectRate", "recruitment.terms.salary"];
  check("公差・型番・連絡先などの事実の欄が、表に1つも入っていない",
    FACTS.every((x) => !WEB_TEXT_PATHS.includes(x)));
  /** **社内向けの欄が入っていない**（掲載文の形で社内の本音を出す道を作らない） */
  const INTERNAL = ["inquiry.wantLessOf", "inquiry.wantMoreOf", "inquiry.mostProfitableWork",
    "inquiry.outlookConcern", "recruitment.retentionNotes", "cases[].confidentialityNotes"];
  check("社内向けの欄が、表に1つも入っていない",
    INTERNAL.every((x) => !WEB_TEXT_PATHS.includes(x)));
  check("添字は表と突き合わせる前に落ちる", webTextShape("cases[12].challenge") === "cases[].challenge");

  const throws = (webText) => { try { assertWebText({ webText }); return false; } catch { return true; } };
  check("表に無いパスは落ちる", throws({ "capability.tolerance": { text: "±1μm", reviewedAt: REVIEWED } }));
  check("表に無い配列のパスも落ちる", throws({ "cases[0].title": { text: "x", reviewedAt: REVIEWED } }));
  check("text が文字列でないと落ちる", throws({ "executive.vision": { text: 3 } }));
  check("source が語彙外だと落ちる", throws({ "executive.vision": { text: "x", source: "robot" } }));
  check("確認済みなのに中身が空だと落ちる", throws({ "executive.vision": { text: "   ", reviewedAt: REVIEWED } }));
  check("表にあるパスは通る", !throws({ "cases[3].solution": { text: "x", source: "human", reviewedAt: REVIEWED } }));
  check("掲載文が無いデータは通る", !throws(undefined));
}

console.log("\n━━━ 未確認の項目は、掲載文の側も落とす ━━━");
{
  /** 値を消して掲載文だけ残ると、**聞けていない項目が文章としてだけ生き残る** */
  const p = load(FIXTURES[0][1]);
  const x = sanitizeProject({
    ...p, unconfirmed: ["strengths.hardestJob"],
    webText: { "strengths.hardestJob": { text: "掲載文", reviewedAt: REVIEWED } },
  });
  check("未確認にした項目の掲載文が、落ちている", x.webText?.["strengths.hardestJob"] === undefined);
}

console.log("\n━━━ ①②③ 画面（書き出したHTML）━━━");
{
  /**
   * **実際に書き出して比べる。** 読み出し関数の単体では、
   * 「テンプレートのどこかが直参照のまま」を見逃す（D-197）。
   */
  const dir = "projects/_webtext-test";
  /**
   * **前の実行が途中で止まっていたら、その残骸から始めない。**
   * 後始末は最後に1回しかしないので、実行が中断されると次の実行に残る。
   * 検査が**前回の残りに左右される**状態にしない
   */
  fs.rmSync(dir, { recursive: true, force: true });
  const site = `${dir}/site`;
  const base = sanitizeProject(load("fixtures/design-diversity/b-difficulty.json"));
  const build = (project) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/project.json`, JSON.stringify(project, null, 2));
    const r = childProcess.spawnSync("node", ["build-site.mjs", "_webtext-test"], { encoding: "utf8" });
    const out = fs.existsSync(site) ? site : `${dir}/site-draft`;
    const html = {};
    if (fs.existsSync(out)) {
      for (const f of fs.readdirSync(out, { recursive: true })) {
        if (String(f).endsWith(".html")) html[String(f)] = fs.readFileSync(`${out}/${f}`, "utf8");
      }
    }
    return { html, log: r.stdout + r.stderr };
  };

  const before = build(base);
  const none = build({ ...base, webText: {} });
  const pending = build(withWeb(base, ""));          // 印なし
  const live = build(withWeb(base));                 // 印あり

  check(`掲載文の欄が空でも、HTMLが1バイトも変わらない（${Object.keys(before.html).length}ページ）`,
    Object.keys(before.html).length > 0
    && Object.keys(before.html).every((k) => none.html[k] === before.html[k]),
    Object.keys(before.html).filter((k) => none.html[k] !== before.html[k]).join(" "));
  check("人が読んだ印が無ければ、HTMLが1バイトも変わらない（＝取材原文が出る）",
    Object.keys(before.html).every((k) => pending.html[k] === before.html[k]),
    Object.keys(before.html).filter((k) => pending.html[k] !== before.html[k]).slice(0, 3).join(" "));
  const shown = Object.values(live.html).join("");
  check("印があれば、掲載文が画面に出る", shown.includes("【掲載文】strengths.wonAfterOthersDeclined"));
  check("印があれば、事例の掲載文も画面に出る", shown.includes("【掲載文】cases[0].challenge"));
  check("印があれば、トップの事業内容も掲載文になる", shown.includes("【掲載文】basics.businessSummary"));
  /**
   * **【撤回】「見出しの段は原文の長さで決める」（D-401）をやめた**（D-447）。
   *
   * 掲載文をまだ誰も書いていなかった頃は、それで実害が無かった。
   * 実際に使い始めたら、**48字の文が、原文137字のときの段（帯の見出し・40px）で組まれた。**
   * 一言の段なら49px——**画面に出ていない文の長さで、見出しの大きさが決まっていた。**
   * 判定に使う値と、実際に描くものを揃える（D-251・D-278・D-433と同じ）。
   */
  const roleOf = (h) => (/<h1 class="hero-(?:sub|motif)" data-role="([^"]+)"/.exec(h) ?? [])[1];
  /** `data-role` が出るのは「数字を大きく」「技術の地紋」の型なので、そこで確かめる */
  const roleBase = sanitizeProject(load("fixtures/design-diversity/a-precision.json"));
  const longRaw = { ...roleBase, basics: { ...roleBase.basics, businessSummary: "あ".repeat(200) } };
  const rawOnly = build(longRaw);
  const withShort = build({ ...longRaw, webText: { "basics.businessSummary": {
    text: "他社で難しいと言われた形を、治具から起こしてお引き受けします。",
    source: "human", reviewedBy: "検査", reviewedAt: REVIEWED } } });
  check("見出しの段は、画面に出す文の長さで決まる（原文の長さではない）",
    roleOf(rawOnly.html["index.html"] ?? "") !== roleOf(withShort.html["index.html"] ?? ""),
    `原文200字=${roleOf(rawOnly.html["index.html"] ?? "")} → 掲載文30字=${roleOf(withShort.html["index.html"] ?? "")}`);
  check("短い掲載文なら「一言」の段で組む",
    roleOf(withShort.html["index.html"] ?? "") === "statement",
    roleOf(withShort.html["index.html"] ?? ""));
  /** **掲載文にも事実検証がかかる**（人が書いても、出典のない数値は通さない） */
  const bad = build({ ...base, webText: { "strengths.hardestJob": { text: "公差は ±0.0003μm まで対応します", reviewedBy: "検査", reviewedAt: REVIEWED } } });
  check("掲載文に出典のない数値を書くと、公開判定が止める", /webText\/strengths\.hardestJob/.test(bad.log));
  /** **表に無いパスは、読み込みで落ちる** */
  const worse = build({ ...base, webText: { "capability.tolerance": { text: "±1μm", reviewedAt: REVIEWED } } });
  check("事実の欄に掲載文を置くと、書き出しが始まらない", /掲載文は持てません/.test(worse.log));

  console.log("\n━━━ ⑧ 取材の言葉のまま出している欄を、黙って通さない（D-416・D-418）━━━");
  /**
   * **欄の名前をここで持たない**（D-197：書き写した表は必ずいつかずれる）。
   * 取材の質問と、画面に出す文が別物であることは、**欄名そのものに出ている**——
   * `basics.businessSummary` の欄名は「主力の事業と売上比率」で、聞くための欄である。
   */
  const named = webTextFields(base, base.formSet).find((f) => f.key === "basics.businessSummary");
  check("欄の名前は、フォーム定義から引いている（表を2つ持たない）",
    named?.label === "主力の事業と売上比率", named?.label);
  check("掲載文に印があれば、画面に出る文のほうを見る",
    duplicateBlocks(webTextFields(withWeb(twiceRaw(base)), base.formSet)).length === 0);
  /**
   * **「入力100%」を「書けている」と読み替えない。**
   * 第2回取材のデータは入力率100%で、掲載文は0件だった（43案件すべて0件）。
   * 黙って取材の言葉が公開に回っていたので、書き出しのたびに名指しさせる。
   */
  check("掲載文の無い欄を、書き出しのたびに名指しする", /取材の言葉のまま画面に出している欄 \d+\/\d+件/.test(before.log),
    (before.log.split("\n").find((l) => l.includes("取材の言葉")) ?? "（出ていない）"));
  check("掲載文がすべて揃っていれば、その報告は出ない",
    !/取材の言葉のまま画面に出している欄/.test(live.log),
    (live.log.split("\n").find((l) => l.includes("取材の言葉")) ?? ""));

  /**
   * **同じ文が複数の欄にあると、実績の数だけが水増しされる。**
   * 松原精機では事例4件のうち2件の「どう解決したか」が一字一句同じだった。
   * 構成の重複（D-410〜D-415）では消えない。**データの側に1件分しか書かれていない。**
   */
  const SAME = "支持点を変えた専用の押さえ治具を製作し、荒取りと仕上げの間に休ませる時間を取りました。";
  /** 松原精機で実際に起きた形——**強み・技術の2つの欄に、同じ段落がそのまま入っていた** */
  const twice = (v) => ({ ...base, strengths: { ...base.strengths, workOthersAvoid: v, hardestJob: v } });
  const dup = build(twice(SAME));
  check("同じ文が2つの欄に入っていると、公開を止める",
    /同じ文が 2つの欄に入っています/.test(dup.log) && /このままでは公開できません/.test(dup.log),
    dup.log.split("\n").filter((l) => l.includes("同じ文が")).join(" | "));
  check("止めたときに、直し方（掲載文を書く）を出す", /片方を書き直してください/.test(dup.log));
  /**
   * **指摘を消す手順が、そのまま正しい直し方になっている。**
   * 見るのは画面に出る文なので、片方を掲載文として書き直せば通る。
   */
  const fixed = build({
    ...twice(SAME),
    webText: { "strengths.hardestJob": { text: "ワーク専用の押さえ治具を新しく起こし、荒取りと仕上げのあいだに寸法を落ち着かせる時間を取りました。", source: "human", reviewedBy: "検査", reviewedAt: REVIEWED } },
  });
  check("片方を掲載文として書き直すと、止まらなくなる", !/同じ文が /.test(fixed.log),
    (fixed.log.split("\n").find((l) => l.includes("同じ文が ")) ?? ""));
  /** **誤検知で止まる道具は、いずれ切られる**（internal-language.ts と同じ考え） */
  check("短い結びの一文が一致しても、止めない（20字未満）",
    !/同じ文が /.test(build(twice("納品まで問題なく進みました。")).log));

  console.log("\n━━━ ⑨ 外注の工程を、自社と同じ行に置かない（D-424）━━━");
  /**
   * 実案件で、加工法が**45件すべて**入っていた——切削の会社の対応可能範囲に
   * 鋳造・射出成形・鍛造まで並び、設備一覧はマシニングとNC旋盤の2種類だった。
   * **書いてあることと、できることが合っていなかった。**
   */
  const outs = build({ ...base, capability: { ...base.capability,
    processes: ["切削加工", "旋盤加工", "マシニング加工"],
    outsourcedProcesses: ["熱処理", "メッキ", "塗装"] } });
  const cap = outs.html["capability/index.html"] ?? "";
  check("外注を記録すると、別の行として出る", /協力会社に依頼している工程/.test(cap));
  check("外注があるときは、自社の行に「（自社）」が付く", /加工法・工法（自社）/.test(cap));
  /** **同じ行に並ぶと、その設備を持っていると読める** */
  const row = (/加工法・工法（自社）<\/th><td>([^<]*)</.exec(cap) ?? [])[1] ?? "";
  check("外注の工程が、自社の行に混ざらない", row.length > 0 && !/熱処理|メッキ|塗装/.test(row), row);
  /**
   * **表だけ直して、札の見せ方を直し忘れていた**（実画面のキャプチャで見つけた）。
   * 同じ語を2箇所に書くと、いつか必ずずれる（D-197）。**どのページにも断りなしの「加工法」を残さない**
   */
  const bare = Object.entries(outs.html).filter(([, h]) => /<h3>加工法<\/h3>/.test(h)).map(([k]) => k);
  check("外注があるとき、札の見出しにも「（自社）」が付く（表だけ直さない）", bare.length === 0, bare.join(" "));
  /** **記録が無い案件（既存42件）では、1バイトも変わらない** */
  check("外注の記録が無ければ、HTMLが1バイトも変わらない",
    Object.keys(before.html).every((k) => build({ ...base }).html[k] === before.html[k]));

  console.log("\n━━━ ⑩ 判断のために聞いた欄が、原稿の材料にならない（D-425）━━━");
  /**
   * **指示では守れない**（D-253：渡さなければ、書きようがない）。
   * プロンプトには「社内の判断材料をそのまま書かない」と書いてあったのに、
   * **`internal: true` が付いていないので、データは書き手に渡っていた。**
   * 実データの `outlookConcern` には「自動車部品がティア1経由で売上の約6割を占めるため、
   * ここが最大の不確実性」が入っていた。D-170とまったく同じ形である。
   */
  const { writerView } = await import("./lib/generate/writer-view.ts");
  const judged = { ...base, inquiry: { ...base.inquiry,
    outlookConcern: "価格が下がっていくと不透明との懸念。自動車部品が売上の約6割を占める",
    monthlyInquiries: "月1〜2件", recentNewClientOrigin: "3年前。それ以降、新規取引は始まっていない",
    targetKeywords: ["薄肉 加工", "薄物 切削"] } };
  const w = writerView(judged);
  /** **「いまどれくらい苦しいか」は渡さない。** 書き手の判断には要らず、出たら事故になる */
  for (const k of ["outlookConcern", "monthlyInquiries", "recentNewClientOrigin",
                   "lostDealReasons", "channels", "targetKeywords"]) {
    check(`inquiry.${k} が原稿の材料に渡らない`, w.inquiry?.[k] === undefined, JSON.stringify(w.inquiry?.[k]));
  }
  /**
   * **「どこに力点を置くか」は渡す**（D-182）。これが無いと書き手が強弱を付けられない。
   * 渡すが書かせない——**だから公開判定で同じ文字列を見張り続ける**（D-253 は残る）
   */
  for (const k of ["mostProfitableWork", "wantMoreOf", "wantLessOf"]) {
    check(`inquiry.${k} は渡る（力点の判断に要る）`, w.inquiry?.[k] !== undefined);
  }
  /** **サイトの役割は渡す。** どのページを作るかの判断で、社内の本音ではない */
  check("inquiry.goals は渡る（構成の判断に要る）", Array.isArray(w.inquiry?.goals));
  /** 画面は1バイトも変わらない——`internal` は書き手に渡すかどうかの話で、組み立ての話ではない */
  check("判断用の印を付けても、HTMLが1バイトも変わらない",
    Object.keys(before.html).every((k) => build({ ...base }).html[k] === before.html[k]));

  console.log("\n━━━ ⑪ 出さないとお約束したものを、毎回見せる（D-425）━━━");
  const ng = build({ ...base, terms: { ...base.terms, ngItems: ["取引先名", "価格・単価"] } });
  check("NGの一覧を、書き出しのたびに出す", /出さないとお約束したもの 2件/.test(ng.log));
  check("NGの一覧が空なら、その報告は出ない",
    !/出さないとお約束したもの/.test(build({ ...base, terms: { ...base.terms, ngItems: [] } }).log));

  console.log("\n━━━ ⑫ 載っているのに、ファイルが無い写真（D-425）━━━");
  /**
   * **ロゴがこれになると、全ページのいちばん上が壊れる**（実測でそうなった）。
   * 枚数の検査は「仮のSVG」と `mock: true` しか見ておらず、**無いものは数えようがなかった**
   */
  const ghost = build({ ...base, photos: [{ file: "no-such-file.jpg", category: "外観" }] });
  check("ファイルの無い写真があると、公開を止める",
    /写真のファイルがありません/.test(ghost.log) && /このままでは公開できません/.test(ghost.log));
  check("写真が1枚も載っていなければ、その報告は出ない",
    !/写真のファイルがありません/.test(build({ ...base, photos: [] }).log));

  console.log("\n━━━ ⑬ 聞いているのに出ていなかった欄／一言の大きさ（D-432〜D-435）━━━");
  /** **不良率**：型定義に「数字が良ければ強力な武器」と書いてあるのに、出口が無かった */
  const dr = build({ ...base, strengths: { ...base.strengths, defectRate: "0.3%以下" } });
  check("不良率が、最初の画面に出る", /0\.3%以下/.test(dr.html["index.html"] ?? ""));
  check("不良率が無ければ、その行は出ない", !/不良率/.test(build({ ...base }).html["index.html"] ?? ""));
  /** **平均年齢**：求職者も発注者も見る。従業員数のとなりに置く */
  const age = build({ ...base, basics: { ...base.basics, averageAge: 38 } });
  check("平均年齢が、会社概要に出る", /38歳/.test(age.html["company/index.html"] ?? ""));
  /**
   * **一言の大きさは、一言の長さのときだけ**（D-433）。
   * 代表挨拶の128字が 49px・11行で組まれ、見出しと同じ大きさになっていた。
   */
  const longV = "あ".repeat(200);
  const lng = build({ ...base, executive: { ...base.executive, vision: longV } });
  const shortV = "難しいものは、まず一度ご相談ください。";
  const shr = build({ ...base, executive: { ...base.executive, vision: shortV } });
  const marked = (h) => /data-peak="statement"[^>]*data-peak-text="long"/.test(h ?? "");
  const msgL = lng.html["message/index.html"] ?? "";
  const msgS = shr.html["message/index.html"] ?? "";
  check("長い文に一言の山がかかると、印が付く（組み方を一段落とす）", marked(msgL));
  check("短い一言には、印が付かない（そのまま大きく組む）", !marked(msgS));
  /** **山そのものは取り消さない**——そのページで最も読ませたいのは、その文で間違いない */
  check("長くても、一言の山であること自体は変わらない", /data-peak="statement"/.test(msgL));

  console.log("\n━━━ ⑭ 1枚だけの写真を、切り取らない・引き伸ばさない（D-436）━━━");
  /**
   * 社長のご指摘——会社概要の外観・代表者・働く人が「でかすぎる／見切れている／荒い」。
   * 測ると3つとも同じ原因で、**枚数に関係なく `aspect-ratio: 4/3` + `object-fit: cover`** を
   * かけていた。16:9 の写真は左右が3割切り落とされ、小さい写真は引き伸ばされていた。
   */
  const css = Object.values(before.html)[0] ?? "";
  const rule = (/\.gallery \.photo:only-child img\s*\{([^}]*)\}/.exec(css) ?? [])[1] ?? "";
  check("1枚のときは、決まった比率に押し込まない", /aspect-ratio:\s*auto/.test(rule), rule.trim());
  check("1枚のときは、切り取らない（contain）", /object-fit:\s*contain/.test(rule), rule.trim());
  check("1枚のときも、画面より広くしない", /max-width:\s*min\(/.test(rule), rule.trim());
  /** **複数枚のときは揃った箱が要る**——行が揃わないと一覧に見えない。そこは変えない */
  check("複数枚のときは、いままでどおり比率を揃える",
    /\.gallery \.photo img\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/.test(css));

  console.log("\n━━━ ⑮ ロゴに背景が付いていないか（D-438）━━━");
  /**
   * 実案件でいただいたロゴは **502×336px の「ロゴの見本」**——つや消し金属の地に
   * ロゴが小さく置かれた画像だった。実測：**ロゴが占めるのは横63%×縦18%・透過なし。**
   * ヘッダーに置くと**グレーの板が出て、中のロゴは高さ11px**になる。**読めない。**
   * CSSでは直らない——大きくすると、板が大きくなるだけである。
   */
  const png = (colorType) => {
    const b = Buffer.alloc(33);
    b.write("\x89PNG\r\n\x1a\n", 0, "binary");
    b.writeUInt32BE(13, 8); b.write("IHDR", 12);
    b.writeUInt32BE(64, 16); b.writeUInt32BE(64, 20);
    b[24] = 8; b[25] = colorType;
    return b;
  };
  const withLogo = (name, buf) => {
    /** **1件ずつ確かめる。** 前の検査で置いた画像を残したまま次を測らない */
    fs.rmSync(`${dir}/photos`, { recursive: true, force: true });
    fs.mkdirSync(`${dir}/photos`, { recursive: true });
    fs.writeFileSync(`${dir}/photos/${name}`, buf);
    return build({ ...base, photos: [{ file: name, category: "ロゴ" }] });
  };
  check("背景つきのロゴ（透過なし）は、目で確かめる印を出す",
    /ロゴに背景が付いています/.test(withLogo("logo-rgb.png", png(2)).log));
  check("透過つきのロゴは、何も言わない",
    !/ロゴに背景が付いています/.test(withLogo("logo-rgba.png", png(6)).log));
  check("SVG のロゴは、何も言わない",
    !/ロゴに背景が付いています/.test(withLogo("logo.svg", Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")).log));
  /** **止めはしない**——透過の無いロゴしか無い会社はある */
  check("ロゴに背景があっても、書き出しは止めない",
    !/✗ photos\/logo-rgb\.png/.test(withLogo("logo-rgb.png", png(2)).log));

  console.log("\n━━━ ⑯ 1枚だけの写真は、縦も横も止める（D-440）━━━");
  /**
   * **幅しか止めていなかった。** 縦長の写真は少しも小さくならない——
   * 実測：800×1200 が **420×630px**、900×900 が **420×420px**。
   * 代表者の写真は縦長で撮ることが多い。**検証に使った写真が全部おなじ横長だったので、
   * 気づけなかった**（社長から2度目のご指摘で分かった）。
   */
  const only = (/\.gallery \.photo:only-child img\s*\{([^}]*)\}/.exec(Object.values(before.html)[0] ?? "") ?? [])[1] ?? "";
  check("高さにも上限がある（縦長の写真が小さくならない）", /max-height:\s*\d+px/.test(only), only.trim());
  check("幅にも上限がある", /max-width:\s*min\(/.test(only), only.trim());
  /** **引き伸ばさない**——`width: auto` なので、元より大きくはならない */
  check("元の大きさより引き伸ばさない", /width:\s*auto/.test(only) && /height:\s*auto/.test(only), only.trim());
  /**
   * **写真1枚の帯を、章にしない**（D-443）。
   * 実測：採用情報が「罫線 → 写真1枚 → 罫線」になっていた。帯そのものの罫線を消しても
   * **前の帯の下罫と、次のブロックの上罫が残る**。写真は前の文章の挿絵で、章の切れ目ではない
   */
  const css2 = Object.values(before.html)[0] ?? "";
  check("写真1枚の帯は、余白を詰める",
    /\.band:has\(\.gallery \.photo:only-child\)\{[^}]*padding-block/.test(css2));
  check("写真1枚の帯の前後に、章の切れ目を作らない",
    /\.band:has\(\+\s*\.band \.gallery \.photo:only-child\)/.test(css2)
    && /\.band:has\(\.gallery \.photo:only-child\)\+/.test(css2),
    (/\.band:has\([^{]*\{[^}]*border[^}]*\}/.exec(css2) ?? [])[0] ?? "");

  console.log("\n━━━ ⑰ 写真にも本体のページがある／役割で大きさを変える（D-444・D-445）━━━");
  /**
   * **同じ写真を2ページに出さない**（社長のご指示）。
   * 本文の重複をやめたのと同じ考え方（Owner / Reference・D-410）で、写真にも本体がある。
   * 外観の本体は会社概要——会社概要は必ず作られるので、行き場を失うことはない。
   */
  const pngBytes = (() => {
    const b = Buffer.alloc(33);
    b.write("\x89PNG\r\n\x1a\n", 0, "binary");
    b.writeUInt32BE(13, 8); b.write("IHDR", 12);
    b.writeUInt32BE(64, 16); b.writeUInt32BE(64, 20); b[24] = 8; b[25] = 6;
    return b;
  })();
  const withPhotos = () => {
    fs.rmSync(`${dir}/photos`, { recursive: true, force: true });
    fs.mkdirSync(`${dir}/photos`, { recursive: true });
    for (const f of ["gaikan.png", "hataraku.png", "daihyo.png"]) fs.writeFileSync(`${dir}/photos/${f}`, pngBytes);
    return build({ ...base, photos: [
      { file: "gaikan.png", category: "外観" },
      { file: "hataraku.png", category: "働く人" },
      { file: "daihyo.png", category: "代表者" },
    ] });
  };
  const ph = withPhotos();
  check("外観の写真は、会社概要にだけ出る（トップには出ない）",
    !/gaikan\.png/.test(ph.html["index.html"] ?? "") && /gaikan\.png/.test(ph.html["company/index.html"] ?? ""),
    `トップ=${/gaikan\.png/.test(ph.html["index.html"] ?? "")} 会社概要=${/gaikan\.png/.test(ph.html["company/index.html"] ?? "")}`);
  /** **働く人は全幅、外観は大きめ、代表者は脇役**（社長のご指示） */
  /** **印は markup で見る**——CSSの側にも同じ語が出るので、規則を数えてしまう */
  const mark = (h) => (/<div class="gallery-wrap"([^>]*)>/.exec(h ?? "") ?? [])[1] ?? "";
  check("採用の写真は全幅の印が付く", /data-photo-size="full"/.test(mark(ph.html["recruit/index.html"])));
  check("会社概要の写真は大きめの印が付く", /data-photo-size="large"/.test(mark(ph.html["company/index.html"])));
  check("代表挨拶の写真には印が付かない（脇役のまま）",
    mark(ph.html["message/index.html"]).trim() === "", mark(ph.html["message/index.html"]));
  /** **全幅でも切り取らない**——「画像全体が映るように」（社長のご指示） */
  const full = (/\.gallery-wrap\[data-photo-size="?full"?\] \.photo:only-child img\{([^}]*)\}/
    .exec(Object.values(ph.html)[0] ?? "") ?? [])[1] ?? "";
  check("全幅でも切り取らない（contain・比率そのまま）",
    /object-fit:\s*contain/.test(full) && /aspect-ratio:\s*auto/.test(full), full);

  console.log("\n━━━ ⑱ 最初の画面を2列にする（D-448）━━━");
  /**
   * 実測：1440×589px の最初の画面で、**中身が占めるのは面積の 23.5%、右半分は 0.0%**。
   * 「左に文字・右に絵」は第9段階④で決めていた（D-388）のに、
   * 実装は**全面に敷く薄い覆い**で、絵が列になっていなかった。
   */
  const heroOf = (h) => (/<section class="hero"([^>]*)>/.exec(h ?? "") ?? [])[1] ?? "";
  const plain = build({ ...base, capability: { ...base.capability, materials: [], processes: [],
    lotSize: "", shortestLeadTime: "", certifications: [] } });
  check("材料が無い案件は、2列にしない（いままでと変わらない）",
    !/data-hero-aside/.test(heroOf(plain.html["index.html"])), heroOf(plain.html["index.html"]));
  check("条件が揃っていれば、右の列ができる",
    /data-hero-aside="(facts|spec)"/.test(heroOf(before.html["index.html"])), heroOf(before.html["index.html"]));
  /** **同じものを左右に二重で置かない** */
  const left = (/<div class="hero-text">([\s\S]*?)<div class="hero-aside">/.exec(before.html["index.html"] ?? "") ?? [])[1] ?? "";
  check("右へ移した札を、左にも出さない", !/class="facts"/.test(left), left.slice(0, 120));

  console.log("\n━━━ ⑲ 札と条件表の意匠を、型ごとに変える（D-449）━━━");
  /**
   * 社長のご指摘「灰色の丸ピル」。15方向すべてで**同じ札**だったので、
   * 最初の画面でいちばん目に入る小さな部品が、**どの会社でも同じ顔**をしていた。
   * **新しい語彙は足さない**——型がすでに持っている「見出しの引き方」「表の引き方」に合わせる（D-197）
   */
  const css3 = Object.values(before.html)[0] ?? "";
  for (const h of ["plain", "rule", "underline", "band"]) {
    check(`札の意匠：${h} の型に、専用の引き方がある`,
      new RegExp(`html\\[data-headings=\"?${h}\"?\\] \\.hero \\.facts span`).test(css3));
  }
  for (const t of ["horizontal", "stripe"]) {
    check(`条件表の引き方：${t} の型に、専用の引き方がある`,
      new RegExp(`html\\[data-tables=\"?${t}\"?\\] \\.spec-first`).test(css3));
  }
  /** **4つとも違う見た目になること**（同じ値を書き写しただけでは意味がない） */
  const styleOf = (h) => (new RegExp(`html\\[data-headings=\"?${h}\"?\\] \\.hero \\.facts span\\{([^}]*)\\}`).exec(css3) ?? [])[1] ?? "";
  const four = ["plain", "rule", "underline", "band"].map(styleOf);
  check("4つの型の札が、すべて違う引き方になっている", new Set(four).size === 4, four.join(" / "));

  console.log("\n━━━ ⑳ 帯の絵は「背景」として敷く（D-459。D-450を撤回）━━━");
  /**
   * D-450 で帯の絵を**右の列**にした。理由は「地に敷くと見えない」（最大画素差 4/255）。
   * だが列に置くと、**本文の横に画像を1枚貼り付けたように見える。**
   * 絵は帯の雰囲気であって、本文と並ぶ別の中身ではない。**背景に戻す**（D-459）。
   *
   * **見えないまま戻すのでは D-450 の前に戻るだけ**なので、濃さを上げた（`.22` → `.45`）。
   * 実測：絵の有無による**最大画素差 4 → 36 / 255**。
   * 同時に**文字の読みやすさを絵に預けない**——地の色が必ず 55% 残るので、
   * 白地なら最低 140/255。墨（#1a1a1a）の本文で 4.5:1 を下回らない。
   */
  const css4 = Object.values(before.html)[0] ?? "";
  /** **列にしない。** `.band-visual` を出す規則が1つも無いこと */
  check("帯の絵を、列として出す規則が無い",
    !/\.band-visual[^{]*\{[^}]*display:\s*(block|grid|flex)/.test(css4),
    (/\.band-visual[^{]*\{[^}]*\}/.exec(css4) ?? [])[0] ?? "");
  /** **背景として敷いている**（要素ではなく、帯の `::before`） */
  check("帯の絵を、背景として敷いている",
    /\.band\[data-asset-source="?generated"?\]:{1,2}before[^{]*\{[^}]*background-image:\s*var\(--asset-image\)/.test(css4)
    || /\.band\[data-asset-source=generated\]:{1,2}before[^{]*,[^{]*\{[^}]*background-image:var\(--asset-image\)/.test(css4));
  /**
   * **濃さの上限は「地の色を55%残す」**＝ `.45`。
   * ここを上げると文字の読みやすさが絵しだいになる（測れないコントラストになる）。
   */
  const op = (/\[data-asset-source=generated\]:before[^{]*\{[^}]*opacity:([.\d]+)/.exec(css4)
    ?? /\[data-asset-source="generated"\][^{]*::before\s*\{[^}]*opacity:\s*([.\d]+)/.exec(css4) ?? [])[1];
  check("帯の絵の濃さが、見える値まで上がっている（かつ .45 を超えない）",
    op !== undefined && Number(op) > 0.22 && Number(op) <= 0.45, String(op));
  /** **絵を持たない案件は、この要素ごと出ない** */
  check("絵が無ければ、絵の要素そのものが出ない", !/class="band-visual"/.test(plain.html["index.html"] ?? ""));

  console.log("\n━━━ ㉑ 最初の画面の右の列を「見て判断させる面」にする（D-451）━━━");
  /**
   * 実測：**絵を持たない案件は8件中8件**で、右の列が札か表＝17pxの文字の箱だった。
   * 発注前にいちばん見られるのは材質・ロット・納期・精度なので、**値を大きく組む。**
   */
  const fig = (/<dl class="hero-figures">([\s\S]*?)<\/dl>/.exec(before.html["index.html"] ?? "") ?? [])[1] ?? "";
  check("右の列が、ラベル＋値の面になっている", /<dt>/.test(fig) && /<dd data-role=/.test(fig), fig.slice(0, 100));
  /**
   * **短く言い切れる値だけ、大きく組む**（D-251）。
   * `fit()` の落ち先は「一言」（60字まで・49px）なので、そのまま使うと
   * **24字の値まで49pxになった**（実測で見つけた）。
   */
  const roles = [...fig.matchAll(/data-role="([^"]+)"/g)].map((m) => m[1]);
  check("値の段は「値」か「導入」の2つだけ（一言の段に落とさない）",
    roles.length > 0 && roles.every((r) => r === "numeric" || r === "lead"), roles.join(" "));
  /** `dd` には列の幅の上限のための `style="--ch:…"` も付く（D-472）。属性の並びに頼らない */
  const longOne = /<dd data-role="lead"[^>]*>[^<]{15,}</.test(fig);
  const shortOne = /<dd data-role="numeric"[^>]*>[^<]{1,14}</.test(fig);
  check("長い値は導入の段に落ちる", longOne, fig.slice(0, 160));
  check("短い値は値の段で大きく組む", shortOne, fig.slice(0, 160));
  /** 型ごとの引き方（D-449と同じ考え方） */
  const css5 = Object.values(before.html)[0] ?? "";
  check("右の列の引き方も、型ごとに変わる",
    /data-tables="?stripe"?\] \.hero-figures/.test(css5) && /data-tables="?all"?\] \.hero-figures/.test(css5));

  console.log("\n━━━ ㉒ 1つの欄で2つ聞かない（D-452）━━━");
  /**
   * 実測：**「最短納期」の欄に「標準7日。急ぎの場合は最短3日」**が入っていた。
   * 取材台本の質問が「**標準納期と最短納期の両方を聞く**」だったためである。
   * 値が文になるので「短く言い切れる値」と判定されず、
   * **①2本目が大きな数字にならない ②右の列で大きく組めない ③最初の画面の数字も出ない**——
   * **1つの原因が3か所で効いていた。**
   */
  const { leadValue } = await import("./lib/design/materials.ts");
  check("大きく出すときは、最初の一文を見る",
    leadValue("標準7日。急ぎの場合は最短3日") === "標準7日", leadValue("標準7日。急ぎの場合は最短3日"));
  check("一文しかない値は、そのまま", leadValue("±0.005mm") === "±0.005mm");
  /**
   * ★**機械では選べない**ことが実測で分かった——最初の一文を取ると、
   * **「最短納期」の札に「標準7日」**が出た。**欄のほうを分ける。**
   */
  const { FORM_SETS } = await import("./lib/form-definition.ts");
  const paths = FORM_SETS.manufacturing.blocks.flatMap((b) => b.fields.map((f) => f.path));
  check("標準納期と最短納期が、別の欄になっている",
    paths.includes("capability.standardLeadTime") && paths.includes("capability.shortestLeadTime"));
  const leadHelp = FORM_SETS.manufacturing.blocks.flatMap((b) => b.fields)
    .find((f) => f.path === "capability.shortestLeadTime")?.help ?? "";
  check("最短納期の質問が、両方を聞かなくなっている", !/両方/.test(leadHelp), leadHelp);
  /** **2つ揃っていれば、それがそのまま対比の材料になる** */
  const two = { ...base, capability: { ...base.capability, standardLeadTime: "7日", shortestLeadTime: "3日" } };
  check("標準と最短が揃っていれば、対比の材料になる",
    materialsOf(sanitizeProject(two), "conditions", true).hasPair);

  console.log("\n━━━ ㉓ スマホの通し確認で見つけたもの（D-453）━━━");
  /**
   * 全12ページを390pxで通した実測——
   *   **押せるものの高さが18〜19pxのものが、1ページに10〜14件**（導線・フッター・電話番号）
   *   **帯の見出しが12px**（「加工したもの」「対応できる条件」）
   * 横スクロールは12ページとも無し。
   */
  const css6 = Object.values(before.html)[0] ?? "";
  /** **書き出しは宣言の順を入れ替える**ので、順に依存しないで見る */
  check("小さい画面で、余白の札の見出しを本文より大きくする",
    /\.band\[data-role="?label"?\]\s*>\s*\.inner\s*>\s*h2\s*\{[^}]*font-size:\s*17px/.test(css6),
    (/\.band\[data-role="?label"?\][^{]*\{[^}]*17px[^}]*\}/.exec(css6) ?? [])[0] ?? "見つからない");
  check("小さい画面で、押せるものに指の余白を足す",
    /p>a:only-child[^{]*\{[^}]*padding-block:12px/.test(css6)
    || /padding-block:\s*12px/.test(css6));
  /** **お問い合わせの電話とメールは、表の中にあるので別に拾う**（通し確認で見つけた） */
  /** **書き出しはコロンを `\\:` に escape する** */
  check("お問い合わせの電話とメールにも、指の余白を足す",
    /a\[href\^="?tel\\?:"?\]/.test(css6) && /a\[href\^="?mailto\\?:"?\]/.test(css6),
    (/[^{}]{0,80}mailto[^{}]{0,40}\{[^}]*\}/.exec(css6) ?? [])[0] ?? "見つからない");

  console.log("\n━━━ ㉔ 絵にも「本体のページ」がある（D-454）━━━");
  /**
   * 実測——生成ビジュアル4枚のうち**3枚がトップに集中**し、
   * **強み・技術のページは画像0枚**だった。
   * うち2枚（`strength` / `peak`）が置かれていた `index/technique`・`index/declined` は、
   * D-410 で**本体が強み・技術に移った参照の帯**である。
   * `visual.ts` は「**本体でない帯を山にしない**」と決めている（D-412）のに、
   * **その帯に、その会社でいちばん強い絵を置いていた。**
   *
   * **表を書き写さずに確かめる**（D-197）。`PURPOSE` の置き場を `OWNER_OF` と突き合わせるので、
   * どちらかを動かせばここが落ちる。
   */
  const { PURPOSE } = await import("./lib/design/generated-brief.ts");
  const { OWNER_OF, isOwner } = await import("./lib/design/system/owner.ts");
  const misplaced = Object.entries(PURPOSE)
    .filter(([, s]) => OWNER_OF[s.slot])
    .filter(([, s]) => !isOwner(s.slot, s.page))
    .map(([k, s]) => `${k}: ${s.page}/${s.slot}（本体は ${OWNER_OF[s.slot].join("・")}）`);
  check("生成ビジュアルは、その内容の本体があるページに置かれる",
    misplaced.length === 0, misplaced.join(" ／ "));
  /** **本体の無い置き場**（`hero`・`history`）は、いままでどおりどのページでもよい */
  check("本体の決まっていない置き場は、この検査で縛られない",
    Object.values(PURPOSE).some((s) => !OWNER_OF[s.slot]));
  /**
   * **実際に計画させて確かめる。** 表だけ直して計画が動いていなければ意味がない。
   */
  for (const [name, file] of FIXTURES.slice(0, 3)) {
    const p = sanitizeProject(load(file));
    const a = analyze(p);
    const bad = planGeneratedVisuals(p, a, "standard").visuals
      .filter((v) => OWNER_OF[v.placement.slot])
      .filter((v) => !isOwner(v.placement.slot, v.placement.page))
      .map((v) => `${v.purpose}→${v.placement.page}/${v.placement.slot}`);
    check(`${name}：計画した絵も、本体のページに置かれる`, bad.length === 0, bad.join(" ／ "));
  }

  console.log("\n━━━ ㉕ 横に並べた値は、欄の幅で段を決める（D-455）━━━");
  /**
   * 実測（対応可能範囲・PC 1440px・5欄・欄の中身189px）——
   *   **「±0.01mm」が63px・幅340pxで組まれ、隣の欄の文字に152px重なっていた。**
   *   **「アルミ・ステンレス」は5行・枠の高さ362px。**
   * 原因は `data-peak="number"` が**欄の数も値の長さも見ずに全部を63pxにする**こと。
   * D-433（一言の大きさは一言の長さのときだけ）と同じ形が、値の側に残っていた。
   */
  const { fitInRow, emWidth, emRun, fitsOneLine, getTypeRole } =
    await import("./lib/design/system/typography.ts");
  /** **半角は全角より狭い。** 見積もりは多め（少なく見ると隣に重なる） */
  check("全角は1、半角は0.8で数える", emWidth("アミ") === 2 && Math.abs(emWidth("mm") - 1.6) < 1e-9,
    `${emWidth("アミ")} / ${emWidth("mm")}`);
  /** **日本語はどこでも折り返せる。** 切れ目の無い半角の連なりだけが1行の幅を要る */
  check("折り返せない連続は、半角の連なりだけを数える",
    emRun("アルミ・ステンレス") === 1 && emRun("±0.01mm") > 4,
    `${emRun("アルミ・ステンレス")} / ${emRun("±0.01mm")}`);
  /** **欄が増えるほど厳しくなる**（1つあたりの幅が 1/n になるため） */
  check("欄が1つなら、いままでどおり値のまま",
    fitInRow("numeric", "±0.01mm", 1).id === "numeric");
  check("5欄では、切れ目の無い値が段を落とす",
    fitInRow("numeric", "±0.01mm", 5).id !== "numeric",
    fitInRow("numeric", "±0.01mm", 5).id);
  check("5欄でも、短い値は値のまま", fitInRow("numeric", "7日", 5).id === "numeric");
  /** **落とし切らない。** 本文と同じ大きさになったら、それは山ではない（D-451と揃える） */
  const veryLong = fitInRow("numeric", "アルミ・ステンレス・鋳鉄・チタン（実績は限定的）", 5);
  check("どれだけ長くても、導入より下には落とさない", veryLong.id === "lead", veryLong.id);
  /** **寸法線は1行の値にだけ**（折れると線が行頭と行末に浮く） */
  check("2行に折れる値では、寸法線を引かない",
    fitsOneLine(getTypeRole("numeric"), "7日", 5) && !fitsOneLine(getTypeRole("numeric"), "1個から", 5));
  /**
   * **書き出したCSSに、`fitInRow` が返しうる段が全部あること。**
   * ★実装中に落ちた：`quote` を書き忘れ、**落ちたはずの値が63pxのまま5行で残っていた。**
   * 表を書き写さず、`fitInRow` に実際に返させて突き合わせる（D-197）。
   */
  const css7 = Object.values(before.html)[0] ?? "";
  const figValues = ["7日", "1個から", "±0.01mm", "アルミ・ステンレス", "アルミ・ステンレス・鋳鉄・チタン（実績は限定的）"];
  const figRoles = [...new Set(figValues.flatMap((v) => [3, 4, 5].map((n) => fitInRow("numeric", v, n).id)))];
  const missing = figRoles.filter((r) => r !== "numeric"
    && !new RegExp(`\\.figures dd\\[data-role="?${r}"?\\]\\{[^}]*font-size`).test(css7));
  check(`段の大きさが、書き出したCSSに全部ある（${figRoles.join("・")}）`, missing.length === 0, missing.join("・"));
  /** **重なりだけは書体に関係なく止める**（字数を減らしても、切れ目の無い値は切れ目が無い） */
  check("値の折り返しを、書き出したCSSで許している",
    /\.figures dd\{[^}]*overflow-wrap:\s*break-word/.test(css7),
    (/\.figures dd\{[^}]*\}/.exec(css7) ?? [])[0] ?? "見つからない");
  /** **1列になる幅では落とさない**（欄が1つなら幅を分け合わない） */
  /** **書き出しは `min-width: 761px` を `width>=761px` に書き替える。** 両方を許す */
  check("小さい画面では、段を落とす規則をかけない",
    /@media\s*\((?:min-width:\s*761px|width>=761px)\)\s*\{[^@]*\.figures dd\[data-role/.test(css7),
    (/@media[^@]{0,60}figures dd\[data-role[^}]*\}/.exec(css7) ?? [])[0] ?? "見つからない");

  console.log("\n━━━ ㉖ その1件のページで、同じことを3回言わない（D-456）━━━");
  /**
   * 実測：加工事例の個別ページ4件とも、
   *   `h1`「半導体装置向け部品の、図面が固まる前からの形状相談」
   *   `h3`「半導体装置向け部品の、図面が固まる前からの形状相談」（まったく同じ）
   *   さらに「この案件について」の要約も同じ内容
   * で、**1画面で3回同じことを言っていた。** リンクも `/cases/` が2本。
   * D-414 は同じことを禁じているが、**帯の見出し（`h2`）しか見ていない**ので当たらない。
   */
  const casePages = Object.entries(before.html).filter(([k]) => /^cases[\\/\\\\]\d/.test(k));
  const headOf = (html, tag) => [...html.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "gs"))]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const mainOf = (html) => (/<main[\s\S]*?<\/main>/.exec(html) ?? [""])[0];
  check(`加工事例の個別ページが書き出されている（${casePages.length}件）`, casePages.length > 0);
  const echoed = casePages.filter(([, html]) => {
    const m = mainOf(html);
    const h1 = headOf(m, "h1")[0];
    return h1 && [...headOf(m, "h2"), ...headOf(m, "h3")].includes(h1);
  }).map(([k]) => k);
  check("ページ見出しと同じ文を、そのページの中でもう一度出さない", echoed.length === 0, echoed.join("・"));
  const twoWays = casePages.filter(([, html]) => {
    const hrefs = [...mainOf(html).matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    return hrefs.filter((h) => h === "/cases/").length > 1;
  }).map(([k]) => k);
  check("その1件のページに、一覧への行き先を2つ出さない", twoWays.length === 0, twoWays.join("・"));
  /** **一覧に戻る道そのものは残す**（消し過ぎていないこと） */
  const noWayBack = casePages.filter(([, html]) => !/<a href="\/cases\/"/.test(mainOf(html))).map(([k]) => k);
  check("その1件のページから、一覧へ戻れる", noWayBack.length === 0, noWayBack.join("・"));
  /** **一覧のページでは、いままでどおり案件名を出す**（工程だけが宙に浮かないように） */
  const listPage = before.html["cases/index.html"] ?? before.html["cases\\index.html"] ?? "";
  check("一覧のページでは、どの案件の話かを言う",
    listPage === "" || headOf(mainOf(listPage), "h3").length > 0 || /class="card/.test(listPage));

  console.log("\n━━━ ㉗ 小さい画面にも絵が出る（D-457。D-459で背景に戻した）━━━");
  /**
   * D-457 は「スマホの強み・技術が 3933px で画像0枚」を直したものだった。
   * D-459 で**背景に戻した**ので、出し方は変わったが、**目的は変わっていない**——
   * 小さい画面にも絵が出ること。背景の覆いは画面幅で消していないので、そのまま出る。
   * ★**「PCで見えるからスマホでも問題ない」は使わない**（CLAUDE.md）。ここで押さえる。
   */
  const css8 = Object.values(before.html)[0] ?? "";
  /** **小さい画面で、絵を消す規則が無いこと**（`display:none` も `opacity:0` も） */
  /** **`@media print` は数えない**（紙では敷かないのが正しい）。★最初これで赤くなった */
  const screenMedia = css8.replace(/@media print\{[^@]*/g, "");
  const killed = /@media[^@]{0,400}\[data-asset-source=generated\]:before[^{]*\{[^}]*display:none/.test(screenMedia);
  check("小さい画面で、帯の絵を消していない", !killed,
    (/@media[^@]{0,200}\[data-asset-source=generated\]:before[^}]*\}/.exec(css8) ?? [])[0] ?? "");
  /**
   * **スマホでは少し薄くする**のは残す（画面に対して絵が大きくなり、文字に近づくため）。
   * ただし **0 にはしない**——0 は「出ていない」ことである。
   */
  const spOp = (/@media[^@]{0,400}\[data-asset-source=generated\]:before[^{]*\{opacity:([.\d]+)\}/.exec(screenMedia) ?? [])[1];
  /**
   * ★実装中に見つけた：地の濃さを `.22 → .45` に上げたとき、**スマホだけ `.16` のまま**だった。
   * 上げ忘れると、D-457 が直した「スマホに絵が1枚も無い」へ逆戻りする。
   * **PCの半分は下回らない**ところで押さえる。
   */
  const pcOp = Number(op ?? 0);
  check("スマホでの濃さが、PCの半分を下回らない",
    spOp === undefined || (Number(spOp) > 0 && Number(spOp) >= pcOp / 2), `SP ${spOp} / PC ${op}`);

  console.log("\n━━━ ㉘ 社長のご指示 4件（D-458〜D-461）━━━");
  const cssA = Object.values(before.html)[0] ?? "";
  /**
   * **D-458 対応材質を「大きく出す数字」から外す。**
   * 実測：「アルミ・ステンレス」が欄の中で2行に折れ、**「アルミ・ステ／ンレス」**と切れていた。
   * 段を落としても1行にならない（9字は、5欄に割った幅では導入25pxでも収まらない）。
   * **材質は「値」ではなく「一覧」**で、数が増えれば必ず溢れる。
   */
  const { analyze: an } = await import("./lib/design/analysis.ts");
  const figLabels = (an(base).figures ?? []).map((f) => f.label);
  check("大きく出す数字に、対応材質を入れない", !figLabels.includes("対応材質"), figLabels.join("・"));
  /** **材質そのものは消していない**——札と仕様の表に出る */
  check("対応材質は、別の見せ方で残っている",
    /対応材質/.test(before.html["capability/index.html"] ?? "")
    && /class="chips"/.test(before.html["capability/index.html"] ?? ""));
  /**
   * **1行に収める**（ご指示：段落ちは見栄えが悪い）。`fitInRow` の既定を1行にした。
   * 併せて、1行に入る幅の式を実測に合わせ直した（`14 ÷ n` → `20 ÷ n − 1`）。
   */
  const { fitInRow: fr, emWidth: ew, DECOR_PX } = await import("./lib/design/system/typography.ts");
  for (const [v, n] of [["1個から", 4], ["7日", 4], ["±0.01mm", 4], ["アルミ・ステンレス", 3]]) {
    const role = fr("numeric", v, n);
    /** **その段で1行に入っていること**（飾りぶんは `numeric` のときだけ足す） */
    const px = Math.round(Math.min(Math.max(role.min, role.vw * 14.4), role.max));
    const width = 1267 / n - 64;
    const need = ew(v) * px + (role.id === "numeric" ? DECOR_PX : 0);
    check(`${n}欄の「${v}」が、${role.id}（${px}px）で1行に収まる`, need <= width,
      `要る幅 ${Math.round(need)}px ／ 欄の中身 ${Math.round(width)}px`);
  }
  /** **寸法線も幅を取る**（CSSと2箇所になるので突き合わせる・D-197） */
  const markW = (/\.figures dd:(?:before|after)\{[^}]*width:(\d+)px/.exec(cssA) ?? [])[1];
  const markM = (/\.figures dd:(?:before|after)\{[^}]*margin:0 (\d+)px/.exec(cssA) ?? [])[1];
  check("寸法線の取り分が、書き出したCSSと合っている",
    markW === undefined || DECOR_PX === (Number(markW) + Number(markM) * 2) * 2,
    `CSS ${markW}px＋余白${markM}px×2 の両端 → ${(Number(markW) + Number(markM) * 2) * 2}px ／ 見積もり ${DECOR_PX}px`);
  /**
   * **D-460 ロゴの横に会社名を出す。**
   * ロゴ画像だけだと、図像を知らない人には会社名が読めない。
   * 画像があるときは `alt` を空にする（名前は隣に文字で出ているので、二度言わせない）。
   */
  /**
   * **ロゴ画像に社名が入っているなら、文字は出さない**（D-462）。
   * 実測：松原精機は「松原精機（画像）＋有限会社 松原精機（文字）」と二重に見えていた。
   * 画像から社名の有無は判定できないので、聞き取りで持つ（`basics.logoIncludesName`）。
   * **聞けていないうちは出さない**——二重に見えるほうが害が大きい。
   */
  const headOfHtml = (html) => (/<header[\s\S]*?<\/header>/.exec(html ?? "") ?? [""])[0];
  const logoCase = (v) => ({ ...base, basics: { ...base.basics, logoIncludesName: v },
    photos: [...(base.photos ?? []), { category: "ロゴ", file: "logo.png" }] });
  const noName = build(logoCase(true));
  const yesName = build(logoCase(false));
  const unasked = build(logoCase(undefined));
  check("ロゴに社名が入っているなら、文字では出さない",
    !/class="logo-name"/.test(headOfHtml(noName.html["index.html"])),
    headOfHtml(noName.html["index.html"]).slice(0, 200));
  check("ロゴに社名が入っていないなら、文字で出す",
    /class="logo-name"/.test(headOfHtml(yesName.html["index.html"])),
    headOfHtml(yesName.html["index.html"]).slice(0, 200));
  check("聞けていないうちは、文字を出さない",
    !/class="logo-name"/.test(headOfHtml(unasked.html["index.html"])));
  /** **ロゴ画像が無い案件は、いままでどおり名前だけ出す**（消し過ぎていないこと） */
  check("ロゴ画像が無ければ、会社名だけを出す",
    /class="logo-name"/.test(headOfHtml(before.html["index.html"])));
  /** 文字を出すときだけ `alt` を空にする。**出さないときは `alt` が名前を持つ** */
  /** **書き出しは `alt=""` を `alt` に縮める。** 空の属性も受ける（★これで一度赤くなった） */
  const imgAlt = (html) => {
    const m = /<a class="logo"[^>]*>\s*<img[^>]*?\salt(="([^"]*)")?[\s/>]/.exec(headOfHtml(html));
    return m ? (m[2] ?? "") : undefined;
  };
  check("文字を出すときは、画像の代替テキストを空にする", imgAlt(yesName.html["index.html"]) === "",
    String(imgAlt(yesName.html["index.html"])));
  check("文字を出さないときは、画像の代替テキストが会社名を持つ",
    (imgAlt(noName.html["index.html"]) ?? "").length > 0, String(imgAlt(noName.html["index.html"])));
  /** **聞き取りの欄になっていること**（画面だけ直して聞かないと、案件ごとに直せない） */
  const { FORM_SETS: FS2 } = await import("./lib/form-definition.ts");
  check("ロゴに社名が入っているかを、聞き取りで聞く",
    FS2.manufacturing.blocks.flatMap((b) => b.fields).some((f) => f.path === "basics.logoIncludesName"));
  /**
   * **D-461 会社概要の外観は、PCでもう一段大きく。**
   * 実測：900×900 が PC 480×480px だった。効いていたのは高さの上限のほう。
   * **スマホは変えない**（`min(…, 100%)` で画面幅に張り付いている）。
   */
  const large = (/\.gallery-wrap\[data-photo-size=large\] \.photo:only-child img\{([^}]*)\}/.exec(cssA) ?? [])[1] ?? "";
  const mh = Number((/max-height:(\d+)px/.exec(large) ?? [])[1] ?? 0);
  const mw = (/max-width:min\((\d+)px,100%\)/.exec(large) ?? [])[1];
  check("会社概要の外観の上限が、480pxより大きい", mh > 480, large);
  /** **D-416（1126×845で「デカすぎる」）には戻さない** */
  check("それでも、大きすぎた頃（845px）には戻していない", mh < 845, String(mh));
  check("スマホでは画面幅に張り付いたまま（`min(…, 100%)`）", mw !== undefined, large);

  console.log("\n━━━ ㉙ 最初の画面も、絵は背景（D-463。D-448 の列を撤回）━━━");
  /**
   * 社長のご指示——「生成した画像は**あくまでも背景として扱う**」。
   * 帯は D-459 で背景に戻した。**最初の画面も同じ扱いに揃える。**
   * 右の列は「見て判断させる値の面」（D-451）に譲る。
   */
  const cssH = Object.values(before.html)[0] ?? "";
  const topHtml = before.html["index.html"] ?? "";
  check("最初の画面に、絵の列そのものが無い",
    !/hero-visual/.test(topHtml) && !/\.hero-visual/.test(cssH),
    (/hero-visual[^"']{0,60}/.exec(topHtml + cssH) ?? [])[0] ?? "");
  /** **列をやめたときに覆いまで消していないこと**（D-448 は列にする代わりに覆いを消していた） */
  check("最初の画面の絵を、背景として敷いている",
    /\.hero\[data-asset-source=generated\]:before\{[^}]*background-image:var\(--asset-image\)/.test(cssH));
  check("「列のときは覆いを消す」規則が残っていない",
    !/hero\[data-hero-aside=visual\]/.test(cssH) && !/hero\[data-hero-aside="visual"\]/.test(cssH));
  /**
   * **右の列の段も、列の幅で決める**（D-463）。
   * ★これまで `fit()`（文字数の上限だけ）だったので、
   * **「アルミ・ステンレス」が63pxで2行に折れていた**（実測：列520px・枠164px）。
   */
  const { fitInRow: fr2 } = await import("./lib/design/system/typography.ts");
  check("右の列で、長い値が「値」の段のままにならない",
    fr2("numeric", "アルミ・ステンレス", 2).id !== "numeric",
    fr2("numeric", "アルミ・ステンレス", 2).id);
  check("右の列でも、短い値は「値」の段のまま", fr2("numeric", "3日", 2).id === "numeric");
  /** 画面に出ている `data-role` が、実際にその式の答えになっていること（写していない） */
  const heroDl = (/<dl class="hero-figures">([\s\S]*?)<\/dl>/.exec(topHtml) ?? [])[1] ?? "";
  const pairs = [...heroDl.matchAll(/<dd data-role="([^"]+)">([^<]*)</g)];
  const wrong = pairs.filter(([, role, v]) => fr2("numeric", v, 2).id !== role).map(([, r, v]) => `${v}→${r}`);
  check(`最初の画面の右の列が、その式どおりに組まれている（${pairs.length}件）`,
    pairs.length === 0 || wrong.length === 0, wrong.join(" ／ "));

  console.log("\n━━━ ㉚ 絵の明暗を、言葉と検査の両方で押さえる（D-464）━━━");
  /**
   * 実測：届いた4枚とも **128より暗い画素が 0.0〜0.8%／明暗の幅 23〜51**で、
   * 背景に敷いても画面上の差は最大 32〜36/255 だった。**覆いの濃さでは作れない差。**
   * 原因は注文書の光の指定で、明るい型に
   * **「均質な光・淡い地・強い影なし」**と書いてあった。**絵は言われたとおりに出来ていた。**
   */
  const { visualLanguageOf } = await import("./lib/design/generated-brief.ts");
  const { DIRECTIONS: DIRS } = await import("./lib/design/direction.ts");
  const anz = await import("./lib/design/analysis.ts");
  const lights = DIRS.map((d) => visualLanguageOf(base, anz.analyze(base), d.id).lighting);
  /** **淡さ・影なしを頼まない**（この言葉が平べったい絵を作っていた） */
  const pale = lights.filter((l) => /pale background|no harsh shadow|even diffused/.test(l));
  check(`どの型でも、淡い地・影なしを頼まない（${DIRS.length}型）`, pale.length === 0, pale[0] ?? "");
  /** **明暗の幅を、どの型でも必ず頼む** */
  const noRange = DIRS.filter((d, i) => !/full tonal range/.test(lights[i] ?? "")).map((d) => d.id);
  check(`どの型でも、明暗の幅を頼む（${DIRS.length}型）`, noRange.length === 0, noRange.join("・"));
  /**
   * **注文書の中で矛盾しないこと。**
   * ★実装中に見つけた：会社の帯の DEPTH が「方向の無い光・値の差はかすか」で、
   * 足したばかりの「明暗の幅」と真っ向から矛盾していた（実測でも4枚中いちばん平べったい）。
   */
  const { planGeneratedVisuals: plan2 } = await import("./lib/design/generated-brief.ts");
  const allPrompts = DIRS.flatMap((d) => plan2(base, anz.analyze(base), d.id).visuals.map((v) => v.prompt));
  const contradicting = allPrompts.filter((p) =>
    /full tonal range/.test(p) && /(light without direction|faint steps of value|no harsh shadow)/.test(p));
  check(`注文書の中で、光の指定が矛盾しない（${allPrompts.length}件）`,
    contradicting.length === 0, (contradicting[0] ?? "").slice(0, 120));
  /** **禁じた言葉は入れない**（足した言葉が関所を抜けていないこと） */
  const { assertGenerated: ag } = await import("./lib/design/system/index.ts");
  let passed = true;
  try { for (const d of DIRS) ag(plan2(base, anz.analyze(base), d.id).visuals); } catch (e) { passed = String(e.message); }
  check("足した言葉が、禁じた言葉の関所を通る", passed === true, passed === true ? "" : passed);

  /**
   * **届いた絵を機械で測る**（`lib/png-tone.ts`）。
   * 画像ライブラリは足さない——PNG の画素は `zlib` で読める。
   * ここでは**明暗の分かっているPNGを自分で作って**、読めていることを確かめる。
   */
  const { toneOf, readableAsBackground } = await import("./lib/png-tone.ts");
  const zlib = await import("node:zlib");
  /** 8bit RGB・インターレース無しのPNGを組み立てる（`rows` は行ごとの明るさ 0〜255） */
  const makePng = (rows, w = 16) => {
    const crcTable = [...Array(256)].map((_, n) => {
      let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
    });
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const cs = Buffer.alloc(4); cs.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, cs]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(rows.length, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.concat(rows.map((v) => {
      const line = Buffer.alloc(1 + w * 3); line[0] = 0;
      for (let x = 0; x < w; x++) { line[1 + x * 3] = v; line[2 + x * 3] = v; line[3 + x * 3] = v; }
      return line;
    }));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  /** 明るい側に固まった絵（届いた4枚と同じ形） */
  const flat = toneOf(makePng([...Array(40)].map((_, i) => 200 + (i % 20))));
  /** 暗い所と明るい所を持つ絵 */
  const deep = toneOf(makePng([...Array(40)].map((_, i) => (i < 12 ? 30 : 210))));
  check("明るさの読み取りが合っている（平べったい絵）",
    flat !== null && flat.dark === 0 && flat.range < 30, JSON.stringify(flat));
  check("明るさの読み取りが合っている（明暗のある絵）",
    deep !== null && deep.dark > 0.2 && deep.range > 150, JSON.stringify(deep));
  check("平べったい絵は、背景として不合格になる", flat !== null && !readableAsBackground(flat));
  check("明暗のある絵は、背景として合格になる", deep !== null && readableAsBackground(deep));
  /** **読めない形は `null`**（推測で合格にしない・CLAUDE.md） */
  check("PNGでないものは「読めない」と返す（推測で合格にしない）",
    toneOf(Buffer.from("これは画像ではありません")) === null);
  /** **書き出しが、この検査を実際に使っていること**（作っただけで呼んでいない、を防ぐ） */
  const buildSrc = fs.readFileSync("build-site.mjs", "utf8");
  check("書き出しが、絵の明暗を測って止める",
    /readableAsBackground/.test(buildSrc) && /このままでは背景として見えません/.test(buildSrc)
    && /leaked\.push\(\[`generated\//.test(buildSrc));

  console.log("\n━━━ ㉛ 来歴が「未確認」の絵は、公開しない（D-465）━━━");
  /**
   * 社長から生成した絵をいただいた。**どの生成サービスで作ったか・商用利用できるか**は
   * 人が確かめて入れる欄で、こちらが騙らない。画面の確認のために「未確認」と入れて置いた。
   * ★`assertGenerated` は**欄が空かどうか**しか見ていないので、**「未確認」と書けば通ってしまう。**
   */
  const { unconfirmedProvenance: up } = await import("./lib/design/system/generated.ts");
  const withProv = (prov) => ({ provenance: prov });
  check("「未確認」と書いてある欄を、確かめていない欄として数える",
    up(withProv({ provider: "未確認（受領）", commercialUse: "未確認", file: "a.png" })).length === 2);
  check("空の欄も、確かめていない欄として数える",
    up(withProv({ provider: "", file: "a.png" })).join() === "provider,commercialUse");
  check("確かめた欄は、数えない",
    up(withProv({ provider: "Midjourney v7", commercialUse: "可（有料プランの規約 2026-09 時点）", file: "a.png" })).length === 0);
  /** **書き出しが、これを実際に使って公開を止めていること** */
  const src2 = fs.readFileSync("build-site.mjs", "utf8");
  check("書き出しが、来歴の未確認で公開を止める",
    /unconfirmedProvenance\(v\)/.test(src2) && /まだ確かめていません/.test(src2));

  {
  console.log("\n━━━ ㉜ 掲載文の型・検査・AIの下書き・公開の関所（D-466）━━━");
  /**
   * 実測（松原精機）：画面に文を出せる24欄のうち **21欄が取材の言葉のまま**。
   * 事業内容に売上の構成比と家族の事情、文体は です・ます 7欄／である 3欄／混在 5欄。
   * 「取材の言葉 → AIが欄ごとに下書き → 機械が検査 → 人が承認」の形にした。
   */
  const { WEB_TEXT_STYLE, COMMON_RULES: CR, styleOf: so } = await import("./lib/webtext-style.ts");
  const { WEB_TEXT_PATHS: WTP } = await import("./lib/schema.ts");
  const { getTypeRole: gtr } = await import("./lib/design/system/typography.ts");
  /** **表が1つ**——掲載文を持てる欄のすべてに、型があること（ずれたら落ちる・D-197） */
  const noStyle = WTP.filter((k) => !WEB_TEXT_STYLE[k]);
  check(`掲載文を持てる欄すべてに、型がある（${WTP.length}欄）`, noStyle.length === 0, noStyle.join("・"));
  const extra = Object.keys(WEB_TEXT_STYLE).filter((k) => !WTP.includes(k));
  check("掲載文を持てない欄に、型を置いていない", extra.length === 0, extra.join("・"));
  /** **最初の画面と山の2欄は、段の上限をそのまま使う**（数字を写さない） */
  check("最初の画面の見出しの上限が、段の上限と同じ",
    so("basics.businessSummary")?.maxChars === gtr("statement").maxChars);
  check("添字つきの欄でも型が引ける", so("cases[3].solution")?.role === WEB_TEXT_STYLE["cases[].solution"].role);

  /** ── 検査 ── */
  const { checkWebText: cw } = await import("./lib/webtext-check.ts");
  const kinds = (key, text) => cw(key, text, base).map((f) => `${f.severity}:${f.kind}`);
  check("です・ます調の文には、文体の指摘が出ない",
    !kinds("cases[0].solution", "専用の治具を製作しました。加工順序も見直しています。").includes("warn:tone"));
  check("である調の文が混じると、文体の指摘が出る",
    kinds("cases[0].solution", "専用の治具を製作した。加工順序も見直しています。").includes("warn:tone"));
  /** ★最初は「〜ました」「〜でした」を末尾の「した」で拾って、4件誤検知した */
  check("「〜ました」「〜でした」を、である調と数えない",
    !kinds("cases[0].result", "寸法が安定しませんでした。量産に移りました。").includes("warn:tone"));
  /** **引用は話されたとおりが正しい** */
  check("「」の中の言い切りは、数えない",
    !kinds("strengths.praiseFromClients", "「図面に書いてないところに気づいてくれる」と言っていただいています。").includes("warn:tone"));
  check("体言止めは、数えない", !kinds("cases[0].partDescription", "ステンレスの薄物部品").includes("warn:tone"));
  check("売上の構成比が入ると、指摘が出る",
    kinds("basics.businessSummary", "精密切削加工です。売上構成は自動車部品が約6割です。").includes("warn:off-site-topic"));
  check("上限を越えると、指摘が出る",
    kinds("cases[0].partDescription", "あ".repeat(80)).includes("warn:length"));
  /** **事実の照合は `verify.ts` と同じもの**——取材の言葉に無い公差は止める */
  check("取材の言葉に無い数字は、止める（error）",
    kinds("cases[0].result", "±0.0003mm に収めました。").some((k) => k.startsWith("error:")),
    kinds("cases[0].result", "±0.0003mm に収めました。").join(" "));

  /** ── AIへの指示は、型から組み立てる ── */
  const draftMod = await import("./lib/generate/webtext-draft.ts");
  const missingDrop = CR.drop.filter((d) => !draftMod.WEBTEXT_SYSTEM.includes(d));
  check("AIへの指示に、載せない話がすべて入っている（型と同じ表）", missingDrop.length === 0, missingDrop.join("・"));
  check("AIへの指示に、事実を足さない決まりが入っている", draftMod.WEBTEXT_SYSTEM.includes(CR.facts));
  const oneField = webTextFields(base)[0];
  const fp = draftMod.fieldPrompt(oneField, base);
  check("欄ごとの依頼に、その欄の役割と上限と取材の言葉が入っている",
    fp.includes(so(oneField.key).role) && fp.includes(`${so(oneField.key).maxChars}字`) && fp.includes(oneField.raw.trim().slice(0, 20)));

  /**
   * ── AIの下書き（偽の応答で確かめる。**この環境にはキーが無い**）──
   * 呼ぶ口は `beta.messages.create` 1つだけなので、そこを差し替える。
   */
  const fake = (replies) => {
    const calls = [];
    return { calls, client: { beta: { messages: { create: async (req) => {
      calls.push(req);
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      return r === "REFUSE"
        ? { stop_reason: "refusal", content: [] }
        : { stop_reason: "end_turn", content: [{ type: "text", text: r }] };
    } } } } };
  };
  const f0 = { ...oneField };
  const ok1 = fake(["整えた文です。"]);
  const [r1] = await draftMod.draftWebText([f0], base, { client: ok1.client });
  check("検査を通る下書きは、そのまま渡す", r1.text === "整えた文です。" && !r1.blocked && r1.retries === 0);
  check("同じモデルで、共通の指示をキャッシュに載せて頼む",
    ok1.calls[0].model === draftMod.DEFAULT_MODEL && ok1.calls[0].system[0].cache_control?.type === "ephemeral");
  const fix = fake(["±0.0003mm に収めました。", "取材の言葉どおりに収めました。"]);
  const [r2] = await draftMod.draftWebText([f0], base, { client: fix.client });
  check("取材の言葉に無い数字を書いたら、指摘を渡して書き直させる",
    r2.retries === 1 && !r2.blocked && JSON.stringify(fix.calls[1].messages).includes("0.0003"));
  const bad = fake(["±0.0003mm に収めました。"]);
  const [r3] = await draftMod.draftWebText([f0], base, { client: bad.client, maxRetries: 2 });
  check("書き直しても直らなければ、下書きとして渡さない（人が書く）",
    r3.blocked && r3.text === "" && bad.calls.length === 3);
  const ref = fake(["REFUSE"]);
  const [r4] = await draftMod.draftWebText([f0], base, { client: ref.client });
  check("AIが断ったら、下書きとして渡さない", r4.refused && r4.blocked && r4.text === "");
  /** **AIは読んだ印を置かない**——画面に出すかどうかは人が決める */
  const draftSrc = fs.readFileSync("lib/generate/webtext-draft.ts", "utf8");
  check("AIの下書きの層は、読んだ印を書かない", !/reviewedAt\s*:/.test(draftSrc) && !("reviewedAt" in r1));

  /** ── 公開の関所 ── */
  check("取材の言葉のまま出る欄が残っていたら、公開を止める",
    /取材の言葉のまま画面に出る欄が \d+件あります/.test(before.log) && /このままでは公開できません/.test(before.log),
    before.log.split("\n").filter((l) => /取材の言葉|公開できません/.test(l)).join(" ／ "));
  /** 読んだ印があっても、事実の照合で落ちる文は出さない */
  const invented = build({ ...base, webText: { [oneField.key]: {
    text: "±0.0003mm の精度で仕上げました。", source: "human", reviewedBy: "検査", reviewedAt: "2026-09-23T00:00:00Z" } } });
  check("読んだ印があっても、取材の言葉に無い数字の入った掲載文は公開しない",
    /掲載文に、取材の言葉に無い記述があります/.test(invented.log),
    invented.log.split("\n").filter((l) => /掲載文/.test(l)).join(" ／ "));

  /** ── 道具（キーが無いとき・取り込みのとき）── */
  const keyless = childProcess.spawnSync("node", ["webtext.mjs", "_webtext-test", "--draft"], {
    encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" } });
  check("キーが無ければ、回避せずに止める", keyless.status === 1 && /認証情報が見つかりません/.test(keyless.stderr),
    keyless.stderr.slice(0, 120));
  /** AIの下書きを一字も変えずに通したら "ai"、直したら "human" */
  fs.writeFileSync(`${dir}/project.json`, JSON.stringify(base, null, 2));
  childProcess.spawnSync("node", ["webtext.mjs", "_webtext-test"], { encoding: "utf8" });
  const sheetPath = `${dir}/draft/webtext.json`;
  const sheetRows = JSON.parse(fs.readFileSync(sheetPath, "utf8"));
  check("下書きの表に、型が出ている", sheetRows.every((r) => typeof r["型"] === "string" && r["型"].length > 0));
  const [ka, kb] = sheetRows.map((r) => r["欄"]);
  sheetRows[0]["AIの下書き"] = "AIが整えた文です。"; sheetRows[0]["掲載文"] = "AIが整えた文です。";
  if (kb) { sheetRows[1]["AIの下書き"] = "AIが整えた文です。"; sheetRows[1]["掲載文"] = "人が直した文です。"; }
  fs.writeFileSync(sheetPath, JSON.stringify(sheetRows, null, 2));
  const applied = childProcess.spawnSync("node", ["webtext.mjs", "_webtext-test", "--apply", "--by", "検査"], { encoding: "utf8" });
  const after = JSON.parse(fs.readFileSync(`${dir}/project.json`, "utf8")).webText ?? {};
  check("AIの下書きを変えずに通した欄は、書いたのが AI と残る", after[ka]?.source === "ai", JSON.stringify(after[ka]) + applied.stderr);
  if (kb) check("人が直した欄は、書いたのが人と残る", after[kb]?.source === "human", JSON.stringify(after[kb]));
  /** **取り込みでも、事実の照合で落ちる文は受けない** */
  sheetRows[0]["掲載文"] = "±0.0003mm に収めました。";
  fs.writeFileSync(`${dir}/project.json`, JSON.stringify(base, null, 2));
  fs.writeFileSync(sheetPath, JSON.stringify(sheetRows, null, 2));
  const refusedApply = childProcess.spawnSync("node", ["webtext.mjs", "_webtext-test", "--apply", "--by", "検査"], { encoding: "utf8" });
  check("取り込みのときも、取材の言葉に無い数字の入った文は受けない",
    refusedApply.status === 1 && /0\.0003/.test(refusedApply.stderr), refusedApply.stderr.slice(0, 160));

  }
  {
  console.log("\n━━━ ㉝ キーは tool/.env に置ける（D-468）━━━");
  /**
   * 以前はターミナルの環境変数からしか読まず、開き直すたびに入れ直す必要があった。
   * **本物の `tool/.env` は触らない**——一時フォルダに同じ並び（lib/env.mjs と .env）を作って確かめる。
   */
  const tmpRoot = fs.mkdtempSync("/tmp/kobo-env-");
  fs.mkdirSync(`${tmpRoot}/lib`);
  fs.copyFileSync("lib/env.mjs", `${tmpRoot}/lib/env.mjs`);
  const probe = `import("${tmpRoot}/lib/env.mjs").then(() => console.log(process.env.KOBO_ENV_PROBE ?? "（無し）"))`;
  const run = (extra = {}) => childProcess.spawnSync("node", ["-e", probe],
    { encoding: "utf8", env: { ...process.env, KOBO_ENV_PROBE: "", ...extra } }).stdout.trim();
  check(".env が無ければ、何も入らない（止めるのはキーが要る道具のほう）",
    childProcess.spawnSync("node", ["-e", probe], { encoding: "utf8",
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "KOBO_ENV_PROBE")) }).stdout.trim() === "（無し）");
  fs.writeFileSync(`${tmpRoot}/.env`, "KOBO_ENV_PROBE=from-file\n");
  const fromFile = childProcess.spawnSync("node", ["-e", probe], { encoding: "utf8",
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "KOBO_ENV_PROBE")) }).stdout.trim();
  check(".env に書いた値を読む", fromFile === "from-file", fromFile);
  check("ターミナルで入れた値のほうが優先される", run({ KOBO_ENV_PROBE: "from-terminal" }) === "from-terminal");
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  /** **キーが要る道具は、ほかの import より先に読む**（先に読まないと値が入る前に見てしまう） */
  const late = ["generate.mjs", "brief.mjs", "webtext.mjs", "check-api.mjs", "qa-companies.mjs"].filter((f) => {
    const firstImport = (/^import .*$/m.exec(fs.readFileSync(f, "utf8")) ?? [""])[0];
    return firstImport !== 'import "./lib/env.mjs";';
  });
  check("キーを使う道具は、いちばん最初に .env を読む（5つ）", late.length === 0, late.join("・"));
  /** **.env は Git に載らない**（キーを公開しない） */
  const ignored = childProcess.spawnSync("git", ["check-ignore", "-q", ".env"]).status === 0;
  check(".env は Git に載らない", ignored);
  check("見本（.env.example）に、本物らしいキーが書かれていない",
    !/sk-ant-[a-z0-9]{2,}-[A-Za-z0-9_-]{10,}/.test(fs.readFileSync(".env.example", "utf8")));
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
