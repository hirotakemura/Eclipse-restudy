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
  /** **ご指示（c）**：見出しの段は原文の長さで決める。掲載文を直しても見た目が動かない */
  const roleOf = (h) => (/<h1 class="hero-(?:sub|motif)" data-role="([^"]+)"/.exec(h) ?? [])[1];
  check("掲載文を入れても、トップの見出しの段が変わらない（fit は原文の長さで固定）",
    roleOf(before.html["index.html"] ?? "") === roleOf(live.html["index.html"] ?? ""),
    `${roleOf(before.html["index.html"] ?? "")} → ${roleOf(live.html["index.html"] ?? "")}`);
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

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
