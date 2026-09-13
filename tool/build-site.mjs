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
import { internalValues } from "./lib/form-definition.ts";

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

const draftSrc = path.join(projectDir, "draft");
let drafts = 0;
if (fs.existsSync(draftSrc)) {
  for (const f of fs.readdirSync(draftSrc).filter((f) => f.endsWith(".md"))) {
    fs.copyFileSync(path.join(draftSrc, f), path.join(draftDst, f));
    drafts++;
  }
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
const unplaced = (project.photos ?? []).filter((p) => !p.category || p.category === "その他").length;
console.log(`  写真 ${photoCount}枚${unplaced ? `（うち置き場所が未定 ${unplaced}枚。サイトには出ません）` : ""}`);

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
const leaked = [];
const suspect = [];
const notes = Object.values(project.unconfirmedNotes ?? {}).filter(Boolean);
/**
 * **社内向けの欄（`internal: true`）の中身が、ページに出ていないか。**
 * 「若手の定着はどうですか」の答えが、そのまま採用ページに出ていた（D-170）。
 */
const internal = internalValues(project, project.formSet);
for (const f of html) {
  const body = fs.readFileSync(path.join(outDir, String(f)), "utf8");
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
 */
const placeholders = [];
if (fs.existsSync(photoDst)) {
  for (const f of fs.readdirSync(photoDst)) {
    if (!/\.svg$/i.test(f)) continue;
    const svg = fs.readFileSync(path.join(photoDst, f), "utf8");
    if (/仮の(?:画像|写真)|ダミー|差し替え前提|placeholder/i.test(svg)) placeholders.push(f);
  }
}

// 公開に必須の情報。**電話番号のないBtoB製造業サイトは、作った意味がない**（D-060）
const b = project.basics ?? {};
const missing = [];
if (!b.name) missing.push("会社名");
if (!b.tel) missing.push("電話番号");
if (!b.address) missing.push("所在地");
if (!project.terms?.inquiryNotifyEmail) missing.push("問い合わせの通知先メール");
if (placeholders.length) missing.push(`実物の写真（仮の画像が${placeholders.length}枚のまま）`);

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
  console.log("\n  KOBOで該当の項目を埋めてから、もう一度実行してください。");
  console.log(`\n  中身の確認はできます：  npm run preview:site -- ${id}`);
  console.log(`  （確認用の書き出し: ${path.relative(process.cwd(), draftDir)}）\n`);
  process.exit(1);
}

// 検査を通った。公開してよいものとして site/ に置き、古い確認用は消す
move(siteDir);
fs.rmSync(draftDir, { recursive: true, force: true });
// 止めるほどではないが、人の目で見てほしいもの。**黙って通さない**
if (suspect.length) {
  console.log("\n  ── 目で確かめてください（止めはしません） ──");
  for (const [f, why] of suspect) console.log(`  △ ${f}  ${why}`);
}
console.log("\n  公開してよい状態です。");
