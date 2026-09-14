/**
 * KOBO — 検証用の案件を作り直す
 *
 *   npm run demo
 *
 * `fixtures/mock-manufacturing/` から `projects/demo/` を作ります。
 *
 * **お客様の案件には一切触りません。** 触るのは `projects/demo/` だけです。
 * 社長とアドバイザーが**同じ画面を見て話せる**ようにするための道具です。
 */
import fs from "node:fs";
import path from "node:path";

/**
 * **第2回取材まで済んだ状態も再現できる**（D-269）。
 *
 *   npm run demo              第1回だけ済んだ状態（穴が残っている）
 *   npm run demo -- --2kai    第2回まで済んだ状態（原稿つき・穴なし）
 *
 * 「埋まるとどうなるか」は、口で説明するより**両方を建てて見比べる**ほうが早い。
 */
const after2 = process.argv.includes("--2kai");
const src = after2 ? path.join("fixtures", "mock-matsubara") : path.join("fixtures", "mock-manufacturing");
const id = after2 ? "demo-2kai" : "demo";
const dst = path.join("projects", id);

if (!fs.existsSync(src)) {
  console.error(`\n  ${src} が見つかりません。\n`);
  process.exit(1);
}

// **消してよいのは demo だけ。** ほかの案件名を受け取らない作りにしている
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });

/**
 * `mock-matsubara/` は1つのフォルダに複数の状態を持っている。
 * **要る状態だけを `project.json` / `draft/` の名前に直して、残りは置いていく。**
 */
if (after2) {
  fs.renameSync(path.join(dst, "project.after-2nd.json"), path.join(dst, "project.json"));
  fs.renameSync(path.join(dst, "draft-after-2nd"), path.join(dst, "draft"));
  for (const f of ["project.completed.json", "interview-record.md", "profile.md"]) {
    fs.rmSync(path.join(dst, f), { recursive: true, force: true });
  }
}

const project = JSON.parse(fs.readFileSync(path.join(dst, "project.json"), "utf8"));
project.id = id;
fs.writeFileSync(path.join(dst, "project.json"), JSON.stringify(project, null, 2));

console.log(`\n  検証用の案件を作り直しました： projects/${id}/`);
console.log(`  【架空】${project.basics?.name ?? ""}　（お客様のデータではありません）`);
console.log(`  見た目： 配色=${project.theme?.palette} 書体=${project.theme?.font} メニュー=${project.theme?.nav} 最初の画面=${project.theme?.hero}`);
console.log(`\n  次に：`);
console.log(`    npm run build:site -- ${id}`);
console.log(`    npm run preview:site -- ${id}`);
if (after2) {
  console.log(`\n  ※ 第2回取材まで済んだ想定です。原稿10ページ付き。聞き取りの穴はありません。`);
  console.log(`     写真は仮の画像なので、**公開判定は止まります**（それが正しい動きです）。\n`);
} else {
  console.log(`\n  ※ 公開前の検査に引っかかる欠陥をわざと残してあります（fixtures/README.md）。`);
  console.log(`     「公開できません」で止まるのが正しい動きです。\n`);
}
