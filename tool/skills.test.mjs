/**
 * KOBO — 担当ごとの約束（Skill・CLAUDE.md）が、実物とずれていないかの検査（D-473）
 *
 * 担当ごとの手順は `.claude/skills/<担当>/SKILL.md` と各所の `CLAUDE.md` に**要点を書き写して**いる。
 * 書き写したものは必ずずれる（D-197）ので、ずれたら落ちるようにする。
 *
 *   ① Skill がそろっている（名前がフォルダ名と同じ・説明がある・共通の約束の表と一致する）
 *   ② 書いてある D番号が、意思決定ログに実在する
 *   ③ 書いてある `npm run …` が、package.json にある
 *   ④ 書いてある `docs/NN`・ファイルの場所が、実在する
 *   ⑤ `tool/` のコードが、どれかの担当に割り当てられている（表に無いファイルを足したら落ちる）
 *   ⑥ 意思決定ログの D番号に重複が無く、索引の「D-001〜D-○○○」が最後の番号と一致する
 *   ⑦ 保留中の作業（docs/38）の番号に重複が無く、すべて担当の節の中にある
 */
import fs from "node:fs";
import path from "node:path";

let ok = 0, ng = 0;
const check = (name, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ng++; console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`); }
};

const ROOT = path.resolve("..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SKILLS_DIR = ".claude/skills";
const skills = fs.readdirSync(path.join(ROOT, SKILLS_DIR)).filter((d) => exists(`${SKILLS_DIR}/${d}/SKILL.md`));
const RULE_FILES = [
  "CLAUDE.md", "tool/CLAUDE.md", "tool/site-template/CLAUDE.md",
  ...skills.map((d) => `${SKILLS_DIR}/${d}/SKILL.md`),
  "docs/38-保留中の作業.md", "docs/README.md",
];

console.log("\n━━━ ① Skill がそろっている ━━━");
check("担当の Skill が3つある（営業・KOBO・WEB制作）", ["eigyo", "kobo", "web"].every((d) => skills.includes(d)), skills.join("・"));
for (const d of skills) {
  const text = read(`${SKILLS_DIR}/${d}/SKILL.md`);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  check(`${d}：名前がフォルダ名と同じ`, new RegExp(`^name: ${d}$`, "m").test(fm));
  check(`${d}：いつ使うかの説明がある`, /^description: .{40,}$/m.test(fm));
}
const top = read("CLAUDE.md");
const listed = [...top.matchAll(/`\/([a-z-]+)`/g)].map((m) => m[1]);
check("共通の約束の担当表と、Skill のフォルダが一致する",
  skills.every((d) => listed.includes(d)) && ["eigyo", "kobo", "web"].every((d) => listed.includes(d)),
  `表：${[...new Set(listed)].join("・")}／フォルダ：${skills.join("・")}`);

console.log("\n━━━ ②③④ 書いてあるものが実在する ━━━");
const log = read("docs/04-意思決定ログ.md");
const decided = new Set([...log.matchAll(/^\| (D-\d{3}) \|/gm)].map((m) => m[1]));
const scripts = JSON.parse(read("tool/package.json")).scripts;
const docNums = new Set(fs.readdirSync(path.join(ROOT, "docs")).map((f) => /^(\d{2})-/.exec(f)?.[1]).filter(Boolean));
for (const f of RULE_FILES) {
  const text = read(f);
  const ds = [...new Set([...text.matchAll(/D-(\d{3})(?!\d)/g)].map((m) => `D-${m[1]}`))];
  const unknownD = ds.filter((d) => !decided.has(d));
  check(`${f}：D番号 ${ds.length}件がログにある`, unknownD.length === 0, unknownD.join(" "));

  /** `npm run a / b / c` のように並べて書いたものも拾う */
  const runs = [...text.matchAll(/npm run ([a-z:][a-z:\-]*(?:\s*\/\s*[a-z:][a-z:\-]*)*)/g)]
    .flatMap((m) => m[1].split("/").map((s) => s.trim()))
    .filter((r) => !r.startsWith("npm")); // 「typecheck / npm test」の後ろ側は npm run ではない
  const unknownRun = [...new Set(runs)].filter((r) => !(r in scripts));
  check(`${f}：コマンド ${new Set(runs).size}件が package.json にある`, unknownRun.length === 0, unknownRun.join(" "));

  const docs = [...new Set([...text.matchAll(/docs\/(\d{2})(?!\d)/g)].map((m) => m[1]))];
  const unknownDoc = docs.filter((n) => !docNums.has(n));
  check(`${f}：docs の番号 ${docs.length}件が実在する`, unknownDoc.length === 0, unknownDoc.join(" "));

  /**
   * バッククォートで囲んだファイルの場所。案件ごとに違うもの（`projects/…`・`<ID>`）と、
   * 書き出し先の説明（`draft/…`）は、実物が無いのが正しいので見ない
   */
  const base = f.startsWith("tool/") ? "tool" : f.startsWith(".claude/") ? "tool" : "";
  const paths = [...new Set([...text.matchAll(/`([.\w\-/]+\/[.\w\-/]*|[\w\-]+\.(?:mjs|ts|md|json))`/g)].map((m) => m[1]))]
    .filter((p) => !/^(projects|draft|photos|generated|site|site-draft|\.\.)\b/.test(p) && !p.startsWith("/") && !p.includes("*"))
    /** `docs/06` は③で見ている。`.env` は Git に入らないのが正しい。ブランチ名はファイルではない。`project.json` は案件ごと */
    .filter((p) => !/^docs\/\d{2}$/.test(p) && !/(^|\/)\.env$/.test(p) && !p.startsWith("claude/") && p !== "project.json");
  const missing = paths.filter((p) => !exists(p) && !exists(`tool/${p}`) && !(base && exists(`${base}/${p}`)) && !exists(`docs/${p}`));
  check(`${f}：ファイルの場所 ${paths.length}件が実在する`, missing.length === 0, missing.join(" "));
}

console.log("\n━━━ ⑤ tool/ のコードが、どれかの担当に割り当てられている ━━━");
{
  const table = read("tool/CLAUDE.md").split("\n").filter((l) => /^\| (KOBO|WEB制作|共通)/.test(l)).join("\n");
  const owned = [...table.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((p) => !p.startsWith("/"));
  const toRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + (g.endsWith("/") ? "" : "$"));
  const rules = owned.map(toRe);
  const code = [
    ...fs.readdirSync(path.join(ROOT, "tool")).filter((f) => /\.(mjs|ts)$/.test(f)),
    ...fs.readdirSync(path.join(ROOT, "tool/lib"), { recursive: true }).map((f) => `lib/${f}`).filter((f) => /\.(mjs|ts)$/.test(f)),
  ];
  const orphan = code.filter((f) => !rules.some((r) => r.test(f)));
  check(`コード ${code.length}本が、すべて担当の表に載っている`, orphan.length === 0, orphan.join(" "));
  const stale = owned.filter((p) => !p.includes("*") && !exists(`tool/${p}`));
  check("担当の表に、もう無いファイルが残っていない", stale.length === 0, stale.join(" "));
}

console.log("\n━━━ ⑥ 意思決定ログの番号 ━━━");
{
  const all = [...log.matchAll(/^\| (D-\d{3}) \|/gm)].map((m) => m[1]);
  const dup = all.filter((d, i) => all.indexOf(d) !== i);
  check(`D番号に重複が無い（${all.length}件）`, dup.length === 0, [...new Set(dup)].join(" "));
  const last = all.map((d) => Number(d.slice(2))).reduce((a, b) => Math.max(a, b), 0);
  const range = /D-001〜D-(\d{3})/.exec(read("docs/README.md"))?.[1];
  check(`索引の「D-001〜D-${range}」が、最後の番号 D-${String(last).padStart(3, "0")} と一致する`, Number(range) === last);
}

console.log("\n━━━ ⑦ 保留中の作業（docs/38）━━━");
{
  const text = read("docs/38-保留中の作業.md");
  const ids = [...text.matchAll(/^\| ([A-Z]-\d+) \|/gm)].map((m) => m[1]);
  const dup = ids.filter((d, i) => ids.indexOf(d) !== i);
  check(`番号に重複が無い（${ids.length}件）`, dup.length === 0, dup.join(" "));
  /** 行は必ずどれかの担当の節（## 営業／KOBO／WEB制作）の下にある */
  let section = "";
  const outside = [];
  for (const line of text.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) section = h[1];
    const row = /^\| ([A-Z]-\d+) \|/.exec(line);
    if (row && !/^(営業|KOBO|WEB制作)/.test(section)) outside.push(`${row[1]}（${section}）`);
  }
  check("すべての行が、担当の節の中にある", outside.length === 0, outside.join(" "));
}

console.log(`\n━━━ 結果 ━━━\n  ${ok}/${ok + ng} 通過\n`);
process.exit(ng ? 1 : 0);
