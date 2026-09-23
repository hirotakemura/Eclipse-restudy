/**
 * KOBO — 案件データからサイトを書き出す
 *
 *   node build-site.mjs <案件ID> [--dev]
 *
 *     --dev  　書き出さずに開発サーバーを起動する
 *
 * 書き出し先は、公開してよいかどうかで分ける。
 *
 *   projects/<ID>/site/        **そのまま公開してよいもの**しか入らない
 *   projects/<ID>/site-draft/  公開できない状態の書き出し。中身の確認用
 *
 * **「フォルダにある＝公開してよい」にしない。** 迷ったら site/ を見ればよい状態にしておく。
 *
 * site-template に案件データ（project.json と、あれば draft/*.md）を流し込み、
 * projects/<案件ID>/site/ に静的サイトを書き出す。
 *
 * **テンプレートは1つしか持たない。** 案件ごとにコードを分けた時点で、
 * 保守工数がサイト数に比例して増え、週15時間の運転では回らなくなる（docs/10 第1章）。
 * 見た目の違いは、聞き取ったデータの違いから出す。
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { findInternalLanguage, visibleText, contextFor } from "./lib/internal-language.ts";
import { verifyDraft } from "./lib/verify.ts";
import { writerView } from "./lib/generate/writer-view.ts";
import { internalValues } from "./lib/form-definition.ts";
import { assertWebText } from "./lib/schema.ts";
import { webTextFields, rawFields, duplicateBlocks } from "./lib/webtext-review.ts";
import { analyze } from "./lib/design/analysis.ts";
import { sanitizeProject } from "./lib/sanitize.ts";
import { composeTop, composePage, explain, traceOf } from "./lib/design/sections.ts";
import { composeVisual } from "./lib/design/visual.ts";
import { composeAssets, explainGenerated } from "./lib/design/assets.ts";
import { projectHashOf } from "./lib/design/brief.ts";
import { resolveTheme } from "./lib/theme.ts";
import { DIRECTIONS } from "./lib/design/direction.ts";
import { toneOf, readableAsBackground, READABLE_AS_BACKGROUND } from "./lib/png-tone.ts";

// npm run dev:site -- <案件ID> の形でも、順番が入れ替わっても拾えるようにする
const args = process.argv.slice(2);
const dev = args.includes("--dev");
const id = args.find((a) => !a.startsWith("--"));

if (!id) {
  console.error("\n  使い方: npm run build:site -- <案件ID>\n");
  console.error("  案件ID は projects/ の中のフォルダ名です。例: matsubara-seiki\n");
  process.exit(1);
}

const projectDir = path.join("projects", id);
const projectFile = path.join(projectDir, "project.json");
if (!fs.existsSync(projectFile)) {
  console.error(`\n  ${projectFile} が見つかりません。\n`);
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));

/**
 * **掲載文は、持ってよい欄にしか持てない**（第10段階①）。
 * 表を持っているだけでは守られないので、読んだところで当てる。
 */
try {
  assertWebText(project);
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}


const templateDir = "site-template";
const dataDir = path.join(templateDir, "src", "site-data");
const draftDst = path.join(dataDir, "draft");

// 前の案件のデータが残っていると、混ざったサイトが建つ。毎回まっさらにする
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(draftDst, { recursive: true });
// 中身はコミットしないが、フォルダ自体は残す（git 管理用）
fs.writeFileSync(path.join(dataDir, ".gitkeep"), "");
fs.writeFileSync(path.join(dataDir, "project.json"), JSON.stringify(project, null, 2));

// 預かった写真を公開ファイルとして配る。project.json はファイル名しか持っていない
const photoDst = path.join(templateDir, "public", "photos");
fs.rmSync(photoDst, { recursive: true, force: true });
const photoSrc = path.join(projectDir, "photos");
let photoCount = 0;
if (fs.existsSync(photoSrc)) {
  fs.mkdirSync(photoDst, { recursive: true });
  // project.json に載っている写真だけを配る。**載せると決めていない画像を公開しない**
  const listed = new Set((project.photos ?? []).map((p) => p.file));
  for (const f of fs.readdirSync(photoSrc)) {
    if (!listed.has(f)) continue;
    fs.copyFileSync(path.join(photoSrc, f), path.join(photoDst, f));
    photoCount++;
  }
}

/**
 * 生成ビジュアル（第9段階）。**ここでも絵は作らない。**
 *
 * やるのは2つだけ。
 *   ① `ready` になっている絵を公開ファイルとして配る
 *   ② **ファイルが実在しない注文書を、その場で `brief` に落とす**
 *      （注文書が「ある」と言っているだけで画面に穴が開く、を防ぐ。404を出さない）
 */
const genDst = path.join(templateDir, "public", "generated");
fs.rmSync(genDst, { recursive: true, force: true });
const genSrc = path.join(projectDir, "generated");
let genCount = 0, genDropped = 0;
if (project.visualPlan?.visuals?.length) {
  for (const v of project.visualPlan.visuals) {
    const file = v?.provenance?.file;
    const ok = v?.status === "ready" && file && fs.existsSync(path.join(genSrc, file));
    if (!ok) {
      if (v?.status === "ready") { v.status = "brief"; genDropped++; }
      continue;
    }
    fs.mkdirSync(genDst, { recursive: true });
    fs.copyFileSync(path.join(genSrc, file), path.join(genDst, file));
    genCount++;
  }
}

const draftSrc = path.join(projectDir, "draft");
/**
 * **原稿は、書き出しのたびに検証し直す。**
 *
 * `verifyDraft` が走るのは、これまで**原稿を生成したその1回だけ**だった。そのため——
 *   ① `npm run generate` が「出典なし」で止まっても、**原稿はディスクに残る**（generate.mjs）。
 *      次に `npm run build:site` を叩けば、**止まった原稿がそのまま公開に回る。**
 *   ② 人が `draft/*.md` を手で直しても、**誰も照合しない。**
 * 出典は生成時と同じ `writerView`——**渡していない欄を出典に使わせない**（D-253）。
 * `forPublish` なので、`{{要確認}}` の残りもここで止まる。
 */
const REVIEWED_MARK = path.join(draftSrc, ".reviewed");
const draftSource = writerView(project);
const draftBlocks = [];
let drafts = 0;
if (fs.existsSync(draftSrc)) {
  for (const f of fs.readdirSync(draftSrc).filter((f) => f.endsWith(".md"))) {
    const md = fs.readFileSync(path.join(draftSrc, f), "utf8");
    /** **中身は消さない。** 確認できるように配ったうえで、公開判定のほうで止める */
    fs.copyFileSync(path.join(draftSrc, f), path.join(draftDst, f));
    drafts++;
    for (const v of verifyDraft(md, draftSource, { forPublish: true })) {
      if (v.severity !== "error") continue;
      draftBlocks.push([`draft/${f}`, `${v.message}：「${v.found}」  …${v.context}`]);
    }
  }
}
/**
 * **人が読んでから公開する**（D-013「生成物は原稿の第1稿であって、商品ではない」）。
 *
 * 原稿があるのに確認の印が無ければ、`site/` には出さず `site-draft/` で止める。
 * 印は `draft/.reviewed` に**人が書く**——誰がいつ読んだか。こちらが勝手に置かない。
 * **原稿が0件のときは印を求めない**（データだけでもサイトは建つ。既存の挙動を変えない）。
 */
/**
 * **掲載文にも、原稿と同じ事実検証をかける**（D-380と同じ扱い）。
 *
 * 掲載文は人が書く。**人が書いたからといって、出典のない数値が許されるわけではない。**
 * 見るのは「人が読んだ印の入っているもの」だけ——印が無いものは画面に出ないので、
 * 下書き途中の文で書き出しを止めない。
 */
for (const [key, w] of Object.entries(project.webText ?? {})) {
  if (!w?.reviewedAt?.trim() || !w?.text?.trim()) continue;
  for (const v of verifyDraft(w.text, draftSource, { forPublish: true })) {
    if (v.severity !== "error") continue;
    draftBlocks.push([`webText/${key}`, `${v.message}：「${v.found}」  …${v.context}`]);
  }
}

let reviewed = "";
if (drafts) {
  reviewed = fs.existsSync(REVIEWED_MARK) ? fs.readFileSync(REVIEWED_MARK, "utf8").trim() : "";
  if (!reviewed) draftBlocks.push(["draft/", "人が原稿を読んだ印がありません（draft/.reviewed が無い、または空）"]);
}

const productLabel = (project.formSet ?? "manufacturing") === "general"
  ? "汎用ベーシック（198,000円）"
  : "製造業向け（980,000円）";
console.log(`\n  ${project.basics?.name ?? id}　${productLabel}`);
console.log(`  原稿 ${drafts}ページ分${drafts ? "" : "（まだありません。データだけでサイトを建てます）"}`);
/**
 * 未確認マークを付けた項目は、テンプレート側でサイトに出さない（`src/lib/site.ts`）。
 *
 * **黙って消えるのが一番まずい。** 何が出ていないのかを、書き出しのたびに必ず見せる。
 * 「サービス・料金のページが出ていない」の原因が、ここに付けたマークだったことがある
 */
const unconfirmed = project.unconfirmed ?? [];
if (unconfirmed.length) {
  console.log(`  未確認のため、サイトに出していない項目 ${unconfirmed.length}件`);
  for (const path of unconfirmed) console.log(`      ${path}`);
}
/**
 * **「入力100%」を「書けている」と読み替えない**（D-416）。
 *
 * 第2回取材のデータは、KOBOの入力率が100%だった。それでも最初の画面の見出しは
 * 「精密切削加工。売上構成は自動車部品が約6割、…2019年に社長就任。」の137字だった。
 * 欄の名前は「**主力の事業と売上比率**」で、台本の質問は「主力の事業は何ですか」。
 * **聞くための欄**が、そのまま見出しになっていた。
 *
 * 掲載文の仕組み（`webText`・D-401）は作ってあったが、**43案件すべてで一度も使われていない**（実測）。
 * 書き出す道具が無かったからである。**黙って取材の言葉を公開に回さない。**
 * 止めはしない——掲載文の無い案件を一斉に赤くしても、直せる人が増えるわけではない。
 */
const webFields = webTextFields(project, project.formSet);
const stillRaw = rawFields(webFields);
if (stillRaw.length) {
  console.log(`  取材の言葉のまま画面に出している欄 ${stillRaw.length}/${webFields.length}件`);
  for (const f of stillRaw.slice(0, 6)) {
    console.log(`      ${f.key}　${f.label}　${f.published.length}字　「${f.published.replace(/\s+/g, "").slice(0, 28)}…」`);
  }
  if (stillRaw.length > 6) console.log(`      ほか ${stillRaw.length - 6}件`);
  console.log(`      掲載文を書く： npm run webtext -- ${id}`);
}
/**
 * **「出さないでください」と言われたものを、毎回見せる**（D-425）。
 *
 * `terms.ngItems` は必須で聞いているのに、**どのコードも読んでいなかった。**
 * 実データには「取引先名」「価格・単価」「加工条件の具体的数値（回転数・送り速度等のノウハウ）」
 * 「社員の顔写真・個人名」が入っていた。**約束したのに、確かめる場所が無かった。**
 *
 * **機械では判定しない。** ここに入るのは「取引先名」のような**種類の名前**であって、
 * 文字列そのものではないので、一致で探しても見つからない（測り方の問題・D-392）。
 * できるのは**人が見る材料として毎回出すこと**までである。それをしていなかった。
 */
const ngItems = project.terms?.ngItems ?? [];
if (ngItems.length) {
  console.log(`  出さないとお約束したもの ${ngItems.length}件（**目で確かめてください。機械では判定できません**）`);
  for (const ng of ngItems) console.log(`      ${ng}`);
}
const unplaced = (project.photos ?? []).filter((p) => !p.category || p.category === "その他").length;
console.log(`  写真 ${photoCount}枚${unplaced ? `（うち置き場所が未定 ${unplaced}枚。サイトには出ません）` : ""}`);

/**
 * **なぜこの構成になったのかを、書き出しのたびに見せる。**
 * 構成をデータから決めるようにした以上（D-180）、決まり方が見えないと
 * 「なぜこの順番なのか」を社長に説明できない。黙って決めない。
 */
{
  /**
   * **ページと同じデータを見る。** 生データを見て説明すると、実物とずれる（D-213）。
   * 見立てだけでなく**構成も**同じデータから作る。materialsOf は構成の側で使うので、
   * ここが生データのままだと「未確認で落とした値」を材料として数えてしまう。
   */
  const clean = sanitizeProject(project);
  const analysis = analyze(clean);
  const resolved = resolveTheme(project.theme, project.formSet === "general" ? "general" : "manufacturing");
  const hero = resolved.hero.id;
  const direction = resolved.direction;
  /**
   * 情報の見せ方の判断（Design Brief）。**あれば使う。無ければ規則版。**
   * **ここでAIは呼ばない。** 判断は `npm run brief` / `npm run generate` の時点で済んでいる。
   */
  const brief = project.designBrief;
  /**
   * **採用していない提案は、サイトに効かない**（D-256）。
   * 黙って効かないと「AI版で建てたつもり」が起きるので、あることだけ言う。
   */
  if (project.designBriefProposal) {
    console.log(`\n  （AI版の提案が保存されていますが、採用されていないので効いていません`);
    console.log(`    採用する： npm run brief -- ${id} --adopt）`);
  }
  const sections = composeTop(clean, analysis, { hero, direction, hasProse: drafts > 0, brief });
  const label = DIRECTIONS.find((d) => d.id === direction)?.label ?? direction;
  console.log(`\n  ── 型「${label}」で組み立てます ──`);
  console.log(`\n  この会社の最大の強み：${analysis.primaryStrength}（${analysis.primaryWhy}）`);
  console.log("\n  ── この会社の見立て ──");
  for (const s of analysis.strands) console.log(`  ${String(s.score).padStart(3)}  ${s.id.padEnd(10)} ${s.why}`);
  console.log("\n  ── トップページの構成 ──");
  for (const line of explain(sections).split("\n")) console.log(`  ${line}`);

  if (brief) {
    const SOURCE = { rules: "規則版", ai: "AI版", "ai-fallback": "AI版→規則版に戻した" };
    console.log(`\n  ── 情報の見せ方の判断：${SOURCE[brief.source] ?? brief.source} ──`);
    if (brief.source === "ai-fallback" && brief.problems?.length) {
      console.log("  AIの判断は検査で落ちたので、規則版で組み立てています。");
      for (const p of brief.problems) console.log(`    ${p.stage}　${p.where}　${p.message}`);
    }
    /**
     * **案件データが変わったのに Brief が古いまま、を黙って通さない**（ご指示④）。
     * 聞き取りを1項目足しただけで見せ方の前提は変わる。
     */
    if (brief.sourceProjectHash && brief.sourceProjectHash !== projectHashOf(project)) {
      console.log("\n  △ この Brief は、いまの案件データとは別の内容から作られています。");
      console.log(`     作り直す：  npm run brief -- ${id}${brief.source === "rules" ? "" : " --ai"}`);
    }
    /**
     * **誰が何を決めたかを、毎回見せる**（ご指示）。
     * 「AIは判断を変えたが、画面では何が変わったのか」が分からないと、
     * AIを入れた意味があったのかを確かめようがない。
     */
    const trace = traceOf(sections);
    const changed = trace.filter((t) => t.source !== "rules");
    if (changed.length) {
      console.log("\n  ── 規則版とAI版で判断が分かれたところ ──");
      for (const t of trace) {
        if (t.source === "rules") continue;
        const arrow = t.rules.presentation === t.final.presentation ? "＝" : "→";
        console.log(`    ${t.heading}　規則版 ${t.rules.presentation} ${arrow} 最終 ${t.final.presentation}　[${t.source}]`);
      }
    } else if (brief.source === "ai") {
      console.log("  AIの判断は、規則版とすべて同じでした。");
    }
  }
}

// 依存は初回だけ入れる
if (!fs.existsSync(path.join(templateDir, "node_modules"))) {
  console.log("  テンプレートの依存を取得します（初回のみ・数分かかります）");
  const install = spawnSync("npm", ["install"], { cwd: templateDir, stdio: "inherit" });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const domain = project.terms?.domain?.existing || project.terms?.domain?.desired || "";
const siteUrl = domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : "https://example.com";
const siteDir = path.resolve(projectDir, "site");
const draftDir = path.resolve(projectDir, "site-draft");
// いったん作業用に書き出し、検査を通ったものだけ site/ に移す
const outDir = path.resolve(projectDir, ".build");

if (dev) {
  console.log(`\n  開発サーバーを起動します。Ctrl+C で終了\n`);
  spawnSync("npm", ["run", "dev"], {
    cwd: templateDir,
    stdio: "inherit",
    env: { ...process.env, SITE_URL: siteUrl },
  });
  process.exit(0);
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: templateDir,
  stdio: "inherit",
  env: { ...process.env, SITE_URL: siteUrl, OUT_DIR: outDir },
});
if (build.status !== 0) process.exit(build.status ?? 1);

/**
 * お問い合わせの受け口を、書き出したフォルダの中に入れる（D-243）。
 *
 * **公開するフォルダだけで完結させる。** そうしておけば、
 * 引き渡しのときも、移管のときも、**渡すのはこのフォルダ1つ**で済む。
 *
 * ※ Cloudflare Pages がこの `functions/` を拾うかどうかは、
 *   **実際に配備して確かめるまで未確認**（Day 90 の作業）。
 *   拾わない場合は、配備の設定側で場所を指定する。**サイトの表示には影響しない。**
 */
{
  const fnSrc = path.join(templateDir, "functions");
  if (fs.existsSync(fnSrc) && fs.existsSync(outDir)) {
    fs.cpSync(fnSrc, path.join(outDir, "functions"), { recursive: true });
  }
}

const files = fs.existsSync(outDir) ? fs.readdirSync(outDir, { recursive: true }) : [];
const html = files.filter((f) => String(f).endsWith(".html"));
console.log(`\n  ${html.length}ページを書き出しました`);
// **file:// で開くとリンクも写真も切れる。**必ずサーバー経由で見てもらう
console.log(`  見るには：  npm run preview:site -- ${id}`);
if (!domain) console.log(`  ※ ドメイン未定のため ${siteUrl} で書き出しています。決まったら聞き取りに入れて再実行してください。`);

/**
 * 書き出したものを、公開してよいか確かめる。
 *
 * **テンプレート側で落としているつもりでも、最後に出力そのものを見る。**
 * 第1回の書き出しでは「{{要確認}} 数値実績を工場長に確認する」がページに出た。
 * 原稿生成を通さない経路には verify.ts の検証がかからないので、ここが最後の関所になる。
 */
const NEEDS_REVIEW = "{{要確認}}";
/** 原稿の再検証と、人の確認の印。**書き出しの前に済んでいる**ので、ここでは合流させるだけ */
const leaked = [...draftBlocks];
const suspect = [];
/**
 * **同じ文が、複数の欄に入っていないか**（D-418）。
 *
 * 第2回取材のデータでは、事例4件のうち2件の「どう解いたか」が一字一句同じだった。
 * 「支持点を変えた専用の押さえ治具を製作し、荒取りと仕上げの間に休ませる時間を取りました。」
 * **実績が2件あるように見えて、書いてあるのは1件分である。**
 * 強み・技術の2欄にも、治具の内製の段落が丸ごと同じ形で入っていた。
 *
 * これは構成の重複（Owner / Reference・D-410〜D-415）では消えない。**データの側の話**である。
 * 見るのは画面に出る文なので、**片方を掲載文として書き直せば、この指摘は消える。**
 */
for (const d of duplicateBlocks(webFields)) {
  leaked.push([d.keys.join(" / "), `同じ文が ${d.keys.length}つの欄に入っています：「${d.text.slice(0, 40)}…」`]);
}
/**
 * **画面に出た絵は、書き出したHTMLを見て数える**（第9段階⑤）。
 *
 * 直す前は「配ったファイル数」を「画面に出る絵」と呼んでいた。
 * 実際には**型によって置ける帯が違い、4件注文して2件しか出ていなかった**のに、
 * 画面には「4枚」と出ていた。**注文した数と、出た数は別のものである。**
 */
const genPlaced = new Set();
const notes = Object.values(project.unconfirmedNotes ?? {}).filter(Boolean);
/**
 * **社内向けの欄（`internal: true`）の中身が、ページに出ていないか。**
 * 「若手の定着はどうですか」の答えが、そのまま採用ページに出ていた（D-170）。
 */
const internal = internalValues(project, project.formSet);
for (const f of html) {
  const body = fs.readFileSync(path.join(outDir, String(f)), "utf8");
  for (const m of body.matchAll(/data-asset-generated="([^"]+)"/g)) genPlaced.add(m[1]);
  if (body.includes(NEEDS_REVIEW)) leaked.push([String(f), "未確認マーカーが残っている"]);
  for (const n of notes) {
    if (n.length > 6 && body.includes(n)) leaked.push([String(f), `未確認欄の控えが出ている：「${n}」`]);
  }
  for (const v of internal) {
    if (body.includes(v)) leaked.push([String(f), `社内向けの欄の中身が出ている：「${v.slice(0, 40)}…」`]);
  }
  /**
   * **マークの付け忘れは、マークを探しても見つからない。**
   * 「{{要確認}}」が付いていない社内語（「現地で銘板と照合して確定させること」など）が
   * 公開判定を素通りし、実際に設備一覧のページに出た（D-169）。言葉のほうを見る。
   */
  const shown = visibleText(body);
  for (const hit of findInternalLanguage(shown)) {
    const line = `${hit.why}：「${contextFor(shown, hit.index, hit.found.length).trim()}」`;
    (hit.severity === "block" ? leaked : suspect).push([String(f), line]);
  }
}

/**
 * 写真。**プレースホルダの画像が入ったまま「公開してよい」と言わない。**
 * 第1回は仮のSVGが9枚あり、枚数の上では埋まって見えていた。
 *
 * 見るのは2つ。
 *   ① 仮のSVG（中に「仮の画像」などと描いてあるもの）
 *   ② **案件データで `mock: true` と印を付けた写真**（D-242）
 *
 * ②が要るのは、**架空の画像を JPEG で作れてしまう**ため。
 * 拡張子や中身の文字では見分けられないので、データ側に印を持たせる。
 * デザインの検討には実写と同じに扱い（`analyze` は写真として数える）、
 * **公開判定だけが止める。**
 */
const placeholders = [];
if (fs.existsSync(photoDst)) {
  for (const f of fs.readdirSync(photoDst)) {
    if (!/\.svg$/i.test(f)) continue;
    const svg = fs.readFileSync(path.join(photoDst, f), "utf8");
    if (/仮の(?:画像|写真)|ダミー|差し替え前提|placeholder/i.test(svg)) placeholders.push(f);
  }
}
for (const ph of project.photos ?? []) {
  if (ph?.mock && ph.file && !placeholders.includes(ph.file)) placeholders.push(ph.file);
}
/**
 * **載っているのに、ファイルが無い写真**（D-425）。
 *
 * `project.json` に写真の行があってもファイルが届いていないと、`<img>` は壊れた画像になる。
 * **ロゴがこれになると、全ページのいちばん上が壊れる**（実測でそうなった）。
 * 枚数の検査は「仮のSVG」と「`mock: true`」しか見ておらず、**無いものは数えようがなかった。**
 */
/**
 * **ロゴの画像が、ヘッダーに置ける形か**（D-438）。
 *
 * 実案件でいただいたロゴは **502×336px の「ロゴの見本」**だった——
 * つや消し金属の地に、ロゴが中央に小さく置かれた画像である。実測：
 *   ・ロゴそのものが占めるのは **横63% × 縦18%**（上下の余白だけで276px＝画像の82%）
 *   ・**透過なし**
 * これをヘッダーに置くと、**地の金属板が四角いグレーの箱として出て、
 * その中のロゴは高さ11px**になる。**読めない。**
 * CSSでいくら大きくしても直らない——大きくすると、グレーの板が大きくなるだけである。
 *
 * **判定は透過の有無だけにする。** 余白の割合を見るには画素を読む必要があり、
 * 書き出しにブラウザを持ち込むことになる（`qa:visible` と違って、ここは毎回走る）。
 * ヘッダー用のロゴは、ほぼ必ず透過PNGかSVGである。**そこだけ見れば足りる。**
 * **止めはしない**——透過の無いロゴしか無い会社はある。人に見せて判断してもらう。
 * **見るのは「透過の層があるか」まで**である。透過つきで作ってあるのに中身が
 * 塗りつぶされている画像は、これでは捕まらない。そこまで見るには画素を読むことになる
 */
const logoFile = (project.photos ?? []).find((ph) => ph?.category === "ロゴ")?.file;
if (logoFile) {
  const f = path.join(photoSrc, logoFile);
  const ext = path.extname(logoFile).toLowerCase();
  let hasAlpha = ext === ".svg";
  if (ext === ".png" && fs.existsSync(f)) {
    const b = fs.readFileSync(f);
    /** PNG の IHDR：色の種類は25バイト目。6=RGBA・4=グレー+A・3=パレット（tRNS があれば透過） */
    const colorType = b[25];
    hasAlpha = colorType === 6 || colorType === 4 || (colorType === 3 && b.includes(Buffer.from("tRNS")));
  }
  if (!hasAlpha && fs.existsSync(f)) {
    suspect.push([`photos/${logoFile}`, "ロゴに背景が付いています（透過なし）。ヘッダーでは四角い板として出ます。背景を抜いたPNGかSVGをいただいてください"]);
  }
}

const missingPhotos = (project.photos ?? [])
  .filter((ph) => ph?.file && !fs.existsSync(path.join(photoSrc, ph.file)))
  .map((ph) => ph.file);

// 公開に必須の情報。**電話番号のないBtoB製造業サイトは、作った意味がない**（D-060）
const b = project.basics ?? {};
const missing = [];
if (!b.name) missing.push("会社名");
if (!b.tel) missing.push("電話番号");
if (!b.address) missing.push("所在地");
if (!project.terms?.inquiryNotifyEmail) missing.push("問い合わせの通知先メール");
if (placeholders.length) missing.push(`実物の写真（仮の画像が${placeholders.length}枚のまま）`);
for (const f of missingPhotos) leaked.push([`photos/${f}`, "案件データに載っていますが、写真のファイルがありません（画面では壊れた画像になります）"]);

if (project.visualPlan?.visuals?.length) {
  /**
   * **「4枚頼んだ＝4枚出る」と読ませない。**
   * 注文した数・絵が届いている数・**実際に画面へ出た数**は、それぞれ別である。
   */
  const requested = project.visualPlan.visuals;
  const ready = requested.filter((v) => v.status === "ready" && v.provenance?.file);
  const placed = ready.filter((v) => genPlaced.has(v.visualId));
  const skipped = ready.filter((v) => !genPlaced.has(v.visualId));

  console.log(`\n  ── 生成ビジュアル ──`);
  console.log(`     requested ${requested.length}　／　絵が届いている ${ready.length}　／　**placed ${placed.length}**　／　skipped ${skipped.length}`
    + (genDropped ? `　／　画像が見つからないので下ろした ${genDropped}` : ""));

  /**
   * **絵の明暗を測る**（D-464）。
   *
   * 生成ビジュアルは背景として敷く（D-459・D-463）ので、**幅の無い絵は敷いても消える。**
   * 実測：最初に届いた4枚は **128より暗い画素が 0.0〜0.8%／明暗の幅 23〜51** で、
   * 画面上の差は最大 32〜36/255 にとどまった。**覆いの濃さでは作れない差**である。
   * ここまでは「絵が届いたか」しか見ておらず、**淡い絵がそのまま画面に出ていた。**
   */
  for (const v of placed) {
    const f = path.join(genSrc, v.provenance.file);
    const tone = fs.existsSync(f) ? toneOf(fs.readFileSync(f)) : null;
    if (!tone) {
      /** **測れないものを合格にしない**（CLAUDE.md） */
      leaked.push([`generated/${v.provenance.file}`, "明暗を測れない形の画像です（PNGの真彩色・インターレース無しでください）"]);
      continue;
    }
    const line = `幅 ${tone.range}／暗い画素 ${(tone.dark * 100).toFixed(1)}%`;
    if (readableAsBackground(tone)) {
      console.log(`     明暗 ${v.visualId}　${line}　○ 背景として見える`);
    } else {
      console.log(`     明暗 ${v.visualId}　${line}　✗ このままでは背景として見えません`);
      leaked.push([`generated/${v.provenance.file}`,
        `明暗が足りません（${line}）。背景として敷くには、**中間より暗い画素が ${READABLE_AS_BACKGROUND.dark * 100}% 以上**、`
        + `**明暗の幅が ${READABLE_AS_BACKGROUND.range} 以上**要ります。注文書（npm run visual -- ${id}）の光の指定で作り直してください`]);
    }
  }
  if (!ready.length) {
    console.log("     絵はまだありません。サイトはいままでと同じです（npm run visual -- <案件ID> で注文書を見る）");
  }
  for (const v of placed) {
    console.log(`     ○ ${v.visualId}　${v.purpose}　→ ${v.placement.page}/${v.placement.slot}`);
  }
  if (skipped.length) {
    /** **なぜ置けなかったかを、必ず言う。** 黙って捨てない */
    const clean2 = sanitizeProject(project);
    const a2 = analyze(clean2);
    const r2 = resolveTheme(project.theme, project.formSet === "general" ? "general" : "manufacturing");
    const reasonOf = (v) => {
      const page = v.placement.page;
      const base = page === "index"
        ? composeTop(clean2, a2, { hero: r2.hero.id, direction: r2.direction, hasProse: drafts > 0, brief: project.designBrief })
        : composePage(page, clean2, a2, { direction: r2.direction, hasProse: drafts > 0 });
      if (!base.length) return "band unavailable";
      const secs = composeAssets(composeVisual(base, project, a2, { direction: r2.direction }), project, a2, { direction: r2.direction, page });
      return explainGenerated(secs, project, page).find((k) => k.visualId === v.visualId)?.reason ?? "band unavailable";
    };
    for (const v of skipped) {
      console.log(`     ✗ ${v.visualId}　${v.purpose}　→ ${v.placement.page}/${v.placement.slot}　${reasonOf(v)}`);
    }
    console.log(`     **注文した数と、画面に出た数は違います。** 型によって置ける帯が変わります`);
  }
}

const move = (to) => {
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(outDir, to);
};

if (leaked.length || missing.length) {
  // 公開できるものだけを site/ に置く。**中身は消さず、確認用として site-draft/ に回す**
  fs.rmSync(siteDir, { recursive: true, force: true });
  move(draftDir);

  console.log("\n━━━ このままでは公開できません ━━━");
  for (const [f, why] of leaked) console.log(`  ✗ ${f}  ${why}`);
  if (missing.length) {
    console.log(`  ✗ 聞き取りが埋まっていない：${missing.join("・")}`);
    if (!b.tel) console.log("     電話番号のないBtoB製造業サイトは、作った意味がありません。");
  }
  for (const [f, why] of suspect) console.log(`  △ ${f}  ${why}`);
  if (drafts && !reviewed) {
    console.log(`\n  原稿を読んだら、印を置いてください（誰がいつ読んだかを1行で）：`);
    console.log(`    echo "$(date +%F) 竹村が全ページ確認" > ${path.join(draftSrc, ".reviewed")}`);
  }
  if (leaked.some(([, why]) => why.startsWith("同じ文が"))) {
    console.log(`\n  同じ文が複数の欄に入っています。片方を書き直してください：`);
    console.log(`    npm run webtext -- ${id}`);
  }
  console.log("\n  KOBOで該当の項目を埋めてから、もう一度実行してください。");
  console.log(`\n  中身の確認はできます：  npm run preview:site -- ${id}`);
  console.log(`  （確認用の書き出し: ${path.relative(process.cwd(), draftDir)}）\n`);
  process.exit(1);
}

// 検査を通った。公開してよいものとして site/ に置き、古い確認用は消す
move(siteDir);
if (reviewed) console.log(`\n  原稿の確認：${reviewed}`);
fs.rmSync(draftDir, { recursive: true, force: true });
// 止めるほどではないが、人の目で見てほしいもの。**黙って通さない**
if (suspect.length) {
  console.log("\n  ── 目で確かめてください（止めはしません） ──");
  for (const [f, why] of suspect) console.log(`  △ ${f}  ${why}`);
}
console.log("\n  公開してよい状態です。");
