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

  console.log("\n━━━ ⑳ 帯の絵を、列として置く（D-450）━━━");
  /**
   * 実測：「どうやって受けているか」の帯は、高さ253pxに生成ビジュアルを持ちながら
   * **画面ではほぼ空白**だった。地に敷く覆いは薄く（opacity .22）、
   * 淡い絵を淡い地に重ねると**最大画素差 4/255**（D-386）。
   * 最初の画面は列にして解決した（D-448）。**帯も同じ考え方でよい。**
   */
  const css4 = Object.values(before.html)[0] ?? "";
  check("絵を持つ文章の帯に、絵の列の規則がある",
    /\.band\[data-asset-source="?generated"?\]:is\(\[data-width="?narrow"?\], ?\[data-width="?normal"?\]\)>\.inner\{[^}]*grid/.test(css4)
    || /\.band\[data-asset-source=generated\]:is\(\[data-width=narrow\],\[data-width=normal\]\)>\.inner\{[^}]*grid/.test(css4));
  /** **暗黙の行に `1 / -1` は届かない**——絵が見出しの高さ（220px）で止まっていた */
  check("絵の列の行を、明示している（暗黙の行に 1/-1 は届かない）",
    /grid-template-rows:auto 1fr/.test(css4));
  /** **列に置いたら、地の覆いはやめる**（二重に出さない） */
  /** **書き出しは `:before`（コロン1つ）に縮める**ので、どちらも受ける */
  check("列に置いた帯では、地の覆いを出さない",
    /\[data-asset-source="?generated"?\]:is\(\[data-width="?narrow"?\],\s*\[data-width="?normal"?\]\):{1,2}before\s*\{\s*display:\s*none/.test(css4),
    (/[^{}]{0,60}:{1,2}before\{display:none\}/.exec(css4) ?? [])[0] ?? "見つからない");
  /** **絵を持たない案件は、この要素ごと出ない** */
  check("絵が無ければ、絵の列そのものが出ない", !/class="band-visual"/.test(plain.html["index.html"] ?? ""));

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
  const longOne = /<dd data-role="lead">[^<]{15,}</.test(fig);
  const shortOne = /<dd data-role="numeric">[^<]{1,14}</.test(fig);
  check("長い値は導入の段に落ちる", longOne, fig.slice(0, 160));
  check("短い値は値の段で大きく組む", shortOne, fig.slice(0, 160));
  /** 型ごとの引き方（D-449と同じ考え方） */
  const css5 = Object.values(before.html)[0] ?? "";
  check("右の列の引き方も、型ごとに変わる",
    /data-tables="?stripe"?\] \.hero-figures/.test(css5) && /data-tables="?all"?\] \.hero-figures/.test(css5));

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
