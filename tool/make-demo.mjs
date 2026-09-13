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

const src = path.join("fixtures", "mock-manufacturing");
const id = "demo";
const dst = path.join("projects", id);

if (!fs.existsSync(src)) {
  console.error(`\n  ${src} が見つかりません。\n`);
  process.exit(1);
}

// **消してよいのは demo だけ。** ほかの案件名を受け取らない作りにしている
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });

const project = JSON.parse(fs.readFileSync(path.join(dst, "project.json"), "utf8"));
project.id = id;
fs.writeFileSync(path.join(dst, "project.json"), JSON.stringify(project, null, 2));

console.log(`\n  検証用の案件を作り直しました： projects/${id}/`);
console.log(`  【架空】${project.basics?.name ?? ""}　（お客様のデータではありません）`);
console.log(`  見た目： 配色=${project.theme?.palette} 書体=${project.theme?.font} メニュー=${project.theme?.nav} 最初の画面=${project.theme?.hero}`);
console.log(`\n  次に：`);
console.log(`    npm run build:site -- ${id}`);
console.log(`    npm run preview:site -- ${id}`);
console.log(`\n  ※ 公開前の検査に引っかかる欠陥をわざと残してあります（fixtures/README.md）。`);
console.log(`     「公開できません」で止まるのが正しい動きです。\n`);
