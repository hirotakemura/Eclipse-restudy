/**
 * KOBO — 掲載文を書く（第10段階②）
 *
 *   npm run webtext -- <案件ID>                    … 下書きを書き出す
 *   npm run webtext -- <案件ID> --draft            … **AIに掲載文の下書きを書かせる**（D-466）
 *   npm run webtext -- <案件ID> --apply --by 竹村   … 読んだ文を案件データに取り込む
 *
 * **なぜこの道具が要るのか。**
 *
 * 取材で聞いた言葉と、画面に出す文は、別のものである。
 * `basics.businessSummary` の欄名は「主力の事業と売上比率」で、
 * 台本の質問は「主力の事業は何ですか。売上の比率はどのくらいですか」。
 * **聞くための欄**である。それが、そのまま最初の画面の見出しになっていた（137字）。
 *
 * 分ける仕組み（`webText`・D-401）は作ってあった。
 * だが**書き出す道具が無かったので、43案件すべてで一度も使われていなかった**（実測）。
 * **仕組みがあるだけでは、使われない。**
 *
 * **既定では文章を書かない。** `--draft` のときだけAIに下書きを書かせる（D-466）。
 * 下書きは下書きで、**画面に出るのは人が読んで `--apply --by` した文だけ**である
 * （D-013「生成物は原稿の第1稿であって、商品ではない」）。
 * この道具がするのは、
 *   ① 画面に出ている文を、欄ごとに全部並べる
 *   ② 機械で確実に言えることだけを添える（重複・社内語・見出しに長すぎる）
 *   ③ 人が書いた文を、印つきで取り込む
 * の3つだけである。
 */
import fs from "node:fs";
import path from "node:path";
import { webTextFields, rawFields, duplicateBlocks, internalIn } from "./lib/webtext-review.ts";
import { assertWebText } from "./lib/schema.ts";
import { fit } from "./lib/design/system/typography.ts";
import { canListTechnique } from "./lib/design/system/owner.ts";
import { checkWebText } from "./lib/webtext-check.ts";
import { styleOf } from "./lib/webtext-style.ts";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const draft = args.includes("--draft");
const by = (() => {
  const i = args.indexOf("--by");
  return i >= 0 ? (args[i + 1] ?? "").trim() : "";
})();

if (!id) {
  console.error("\n  使い方: npm run webtext -- <案件ID> [--draft]");
  console.error("          npm run webtext -- <案件ID> --apply --by <読んだ人>\n");
  process.exit(1);
}

const projectDir = path.join("projects", id);
const projectFile = path.join(projectDir, "project.json");
if (!fs.existsSync(projectFile)) {
  console.error(`\n  案件が見つかりません: ${projectFile}\n`);
  process.exit(1);
}
const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
const draftDir = path.join(projectDir, "draft");
const sheet = path.join(draftDir, "webtext.json");

/**
 * **字数のめやすは、ここで決めない。**
 * 最初の画面の見出しは `fit()` が文字数で段を落とす（D-277）。
 * その上限は `TYPE_ROLES` が持っているので、**同じ数字を2箇所に書かない**（D-197）。
 */
const guideOf = (f) => {
  if (f.key !== "basics.businessSummary") return "";
  const want = fit("statement", "");             // 上限に収まっているときの段
  const got = fit("statement", f.published);     // いまの文で実際に選ばれる段
  if (got.id === want.id) return "";
  return `最初の画面の見出しです。いま${f.published.trim().length}字で、`
    + `「${want.label}」（${want.maxChars}字まで）の段から「${got.label}」の段まで落ちています`;
};

const fields = webTextFields(project, project.formSet);
if (!fields.length) {
  console.log("\n  掲載文を持てる欄に、まだ中身がありません。\n");
  process.exit(0);
}
const dups = duplicateBlocks(fields);

if (!apply) {
  // ── 下書きを書き出す ──────────────────────────────
  const prev = fs.existsSync(sheet) ? JSON.parse(fs.readFileSync(sheet, "utf8")) : [];
  const prevOf = new Map(prev.map((r) => [r["欄"], r["掲載文"]]));
  const rows = fields.map((f) => {
    const notes = [];
    for (const d of dups) {
      if (!d.keys.includes(f.key)) continue;
      notes.push(`同じ文が ${d.keys.filter((k) => k !== f.key).join("・")} にも入っています：「${d.text.slice(0, 30)}…」`);
    }
    for (const h of internalIn(f)) notes.push(`${h.why}：「${h.found}」`);
    const guide = guideOf(f);
    if (guide) notes.push(guide);
    /**
     * **構成は取材原文で決まっている。掲載文がその前提を壊すと、画面が空になる。**
     * 追い質問の欄の【…】は、強み・技術の「工程」の見出しとして読まれている。
     * 掲載文で【…】を落とすと、**箇条書きの中身が消える**（書く前に言う）。
     */
    if (f.key === "strengths.followUpFindings" && canListTechnique(f.raw)) {
      notes.push("【…】の見出しで、強み・技術の工程が組まれています。掲載文にも【…】を残してください");
    }
    /** 取材の言葉に、掲載文の型を当てた指摘（D-466）。**直す前に何がずれているか**が分かる */
    for (const x of checkWebText(f.key, f.raw, project)) notes.push(`${x.message}：「${x.found}」`);
    const style = styleOf(f.key);
    const prevRow = prev.find((r) => r["欄"] === f.key);
    return {
      "欄": f.key,
      "聞いた質問": [f.label, f.help].filter(Boolean).join(" — "),
      /** 合わせる先（`webtext-style.ts`）。**AIも人も、これを見て書く** */
      "型": style ? `${style.role}／${style.maxChars}字まで${style.notes.length ? "／" + style.notes.join("／") : ""}` : "",
      "取材の言葉": f.raw,
      "字数": f.raw.trim().length,
      "気になる点": notes,
      /** AIが書いた下書き。**ここは読むだけ。画面に出すのは「掲載文」** */
      "AIの下書き": prevRow?.["AIの下書き"] ?? "",
      "下書きの検査": prevRow?.["下書きの検査"] ?? [],
      /** 人が書くところ。**空のままなら、公開できない**（D-466） */
      "掲載文": f.reviewed ? f.published : (prevRow?.["掲載文"] ?? prevOf.get(f.key) ?? ""),
    };
  });

  if (draft) {
    /**
     * **キーが無ければ止める。回避しない**（社長のご指示）。
     * 下書きが無くても、人が「掲載文」を書けば同じ道で公開できる。
     */
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      console.error("\n  Anthropic API の認証情報が見つかりません。AIの下書きは書けません。");
      console.error("    export ANTHROPIC_API_KEY=sk-ant-api03-...");
      console.error("  を設定してから、もう一度実行してください。");
      console.error("  （キーが無くても、下書きの「掲載文」を人が書けば公開できます）\n");
      process.exit(1);
    }
    const { draftWebText } = await import("./lib/generate/webtext-draft.ts");
    /** **読んだ印のある欄は書き直さない。** 人が決めた文を、AIが上書きしない */
    const todo = fields.filter((f) => !f.reviewed);
    console.log(`\n  AIに下書きを頼みます（${todo.length}欄）`);
    const results = await draftWebText(todo, project, { onProgress: (m) => console.log(`  ${m}`) });
    for (const r of results) {
      const row = rows.find((x) => x["欄"] === r.key);
      if (!row) continue;
      row["AIの下書き"] = r.text;
      row["下書きの検査"] = r.findings.map((x) => `${x.severity === "error" ? "✗" : "△"} ${x.message}：「${x.found}」`);
      if (r.refused) row["下書きの検査"].unshift("✗ AIが書くのを断りました。人が書いてください");
      else if (r.blocked) row["下書きの検査"].unshift("✗ 取材の言葉に無い記述が残ったので、下書きを渡しません。人が書いてください");
      /** **掲載文が空の欄にだけ、下書きを写す。** 人が書きかけた文は消さない */
      if (!row["掲載文"] && r.text) row["掲載文"] = r.text;
    }
  }
  fs.mkdirSync(draftDir, { recursive: true });
  fs.writeFileSync(sheet, JSON.stringify(rows, null, 2) + "\n", "utf8");

  const raw = rawFields(fields);
  console.log(`\n  ${project.basics?.name ?? id}`);
  console.log(`  掲載文を持てる欄 ${fields.length}件　うち取材の言葉のまま ${raw.length}件`);
  const flagged = rows.filter((r) => r["気になる点"].length);
  if (flagged.length) {
    console.log(`\n  ── 先に直したほうがよい欄 ──`);
    for (const r of flagged) {
      console.log(`  ${r["欄"]}　${r["聞いた質問"].split(" — ")[0]}`);
      for (const n of r["気になる点"]) console.log(`      ${n}`);
    }
  }
  console.log(`\n  下書き： ${sheet}`);
  console.log(`  「掲載文」を読んで、直してください。**読んだ印の無い欄が残っている間は公開できません**（D-466）`);
  if (!draft) console.log(`  AIに下書きを書かせる： npm run webtext -- ${id} --draft`);
  console.log(`  書けたら： npm run webtext -- ${id} --apply --by <読んだ人>\n`);
  process.exit(0);
}

// ── 書いた文を取り込む ────────────────────────────────
if (!fs.existsSync(sheet)) {
  console.error(`\n  下書きがありません: ${sheet}`);
  console.error(`  先に  npm run webtext -- ${id}  を実行してください。\n`);
  process.exit(1);
}
/**
 * **印は人が置く**（`draft/.reviewed` と同じ・D-381）。
 * こちらが勝手に「確認済み」にしない。誰が読んだかを言えない取り込みは受けない。
 */
if (!by) {
  console.error(`\n  誰が読んだかを書いてください： npm run webtext -- ${id} --apply --by <名前>\n`);
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(sheet, "utf8"));
const keys = new Set(fields.map((f) => f.key));
const now = new Date().toISOString();
const next = { ...(project.webText ?? {}) };
const added = [];
const unknown = [];
const breaks = [];
for (const r of rows) {
  const key = r["欄"];
  const text = String(r["掲載文"] ?? "").trim();
  if (!keys.has(key)) { unknown.push(key); continue; }
  if (!text) continue;                       // 空は「まだ書いていない」。既にある掲載文は消さない
  if (next[key]?.text?.trim() === text) continue;   // 変わっていないものは印も触らない
  /** **取材原文で決まった構成を、掲載文が裏切らないこと**（ずれたら落ちる検査・D-197） */
  if (key === "strengths.followUpFindings" && canListTechnique(project.strengths?.followUpFindings) && !canListTechnique(text)) {
    breaks.push(`${key}：【…】の見出しが無くなると、強み・技術の箇条書きが空になります`);
    continue;
  }
  /** **事実の照合で落ちる文は、読んだ印があっても取り込まない**（D-466） */
  const errors = checkWebText(key, text, project).filter((x) => x.severity === "error");
  if (errors.length) {
    breaks.push(`${key}：${errors.map((x) => `「${x.found}」${x.message}`).join("／")}`);
    continue;
  }
  /** **誰が書いた文かを残す。** AIの下書きを一字も変えずに通したなら "ai" */
  const source = String(r["AIの下書き"] ?? "").trim() === text ? "ai" : "human";
  next[key] = { text, source, reviewedBy: by, reviewedAt: now };
  added.push(key);
}
if (breaks.length) {
  console.error(`\n  取り込めません：`);
  for (const b of breaks) console.error(`      ${b}`);
  console.error("");
  process.exit(1);
}
if (unknown.length) {
  console.error(`\n  下書きに、掲載文を持てない欄があります：${unknown.join("・")}`);
  console.error(`  （数値・型番・認証・連絡先の欄には掲載文を置けません）\n`);
  process.exit(1);
}
/** **登録の時点で弾く**（`assertWebText` と同じ関所を、書き込む前に通す） */
try {
  assertWebText({ ...project, webText: next });
} catch (e) {
  console.error(`\n  取り込めません：${e.message}\n`);
  process.exit(1);
}
if (!added.length) {
  console.log(`\n  書き足された掲載文がありません（「掲載文」が空のままです）\n`);
  process.exit(0);
}
project.webText = next;
fs.writeFileSync(projectFile, JSON.stringify(project, null, 2) + "\n", "utf8");
console.log(`\n  掲載文を取り込みました ${added.length}件（読んだ人：${by}）`);
for (const k of added) console.log(`      ${k}`);
const left = rawFields(webTextFields(project, project.formSet));
console.log(`\n  取材の言葉のまま残っている欄 ${left.length}件`);
console.log(`  書き出す： npm run build:site -- ${id}\n`);
