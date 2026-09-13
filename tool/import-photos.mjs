/**
 * KOBO — フォルダの写真を案件に取り込む
 *
 *   npm run import:photos -- <案件ID> <フォルダ>
 *
 * お客様からまとめて送られてきた写真を、1枚ずつ画面で登録しなくて済むようにする。
 *
 * フォルダに `photos.json` があれば、置き場所（カテゴリ）もそこから読む。
 * 無ければ全部「その他」で取り込み、**置き場所はKOBOの画面で人が決める。**
 * ファイル名から機械が推測して勝手に振り分けない。取り違えると、
 * 事例ページに外観写真が出るような事故になる。
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [id, src] = args;

if (!id || !src) {
  console.error("\n  使い方: npm run import:photos -- <案件ID> <写真フォルダ>");
  console.error("  例:     npm run import:photos -- matsubara-seiki fixtures/mock-matsubara/photos\n");
  process.exit(1);
}

const projectFile = path.join("projects", id, "project.json");
if (!fs.existsSync(projectFile)) {
  console.error(`\n  案件が見つかりません: ${projectFile}\n`);
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error(`\n  フォルダが見つかりません: ${src}\n`);
  process.exit(1);
}

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".heic"]);
const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
const dst = path.join("projects", id, "photos");
fs.mkdirSync(dst, { recursive: true });

// 置き場所が決まっているなら、フォルダに photos.json を置いておく
const planFile = path.join(src, "photos.json");
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, "utf8")) : {};

const photos = project.photos ?? [];
let added = 0;
let updated = 0;

for (const name of fs.readdirSync(src).sort()) {
  if (!EXT.has(path.extname(name).toLowerCase())) continue;
  // ファイル名はそのまま使う。**同じフォルダを2回取り込んでも増えない**ようにするため
  const safe = name.replace(/[^A-Za-z0-9_.-]+/g, "-");
  fs.copyFileSync(path.join(src, name), path.join(dst, safe));

  const entry = { file: safe, category: "その他", ...(plan[name] ?? {}) };
  const i = photos.findIndex((p) => p.file === safe);
  if (i >= 0) {
    photos[i] = { ...photos[i], ...entry };
    updated++;
  } else {
    photos.push(entry);
    added++;
  }
}

project.photos = photos;
fs.writeFileSync(projectFile, JSON.stringify(project, null, 2) + "\n", "utf8");

const unplaced = photos.filter((p) => p.category === "その他").length;
console.log(`\n  ${project.basics?.name ?? id} に取り込みました`);
console.log(`    追加 ${added}枚 ／ 更新 ${updated}枚 ／ 合計 ${photos.length}枚`);
if (unplaced) {
  console.log(`\n  置き場所が未定：${unplaced}枚`);
  console.log("  KOBOの「制作条件」→「お預かりした写真」で選んでください。");
  console.log("  **置き場所が未定の写真は、サイトには出ません。**");
}
console.log(`\n  次：  npm run build:site -- ${id}\n`);
