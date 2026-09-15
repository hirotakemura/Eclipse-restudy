/**
 * KOBO — 次の取材で埋めるものを、データから出す
 *
 *   npm run gaps -- <案件ID>            画面に出す
 *   npm run gaps -- <案件ID> --write    印刷して持っていける形で保存する
 *
 * **手で作った「宿題リスト」は、必ず古くなる。**
 * 第1回のあと、埋まっていない欄は `project.json` の中に全部ある。
 * 手で書き写せば、写し間違えるか、次に更新したとき古くなる。**データから出す。**
 *
 * 【並べ方に意味がある】
 * 欄の順番ではなく、**埋まらないと何が起きるか**の順に並べる。
 *   1. 止まる　　ページが作られない／公開できない
 *   2. 裏を取る　値はあるが、社内メモに「未確認」と書いてある（**間違っていると事故**）
 *   3. 痩せる　　埋めると帯や行が増える。無くてもページは建つ
 *
 * 【聞く言葉は、フォーム定義から取る】
 * `lib/forms/*.ts` の `help` は、そのまま取材で読む質問文である（D-134）。
 * ここで書き下ろすと、**質問が2箇所に散らばって、片方だけ直される。**
 */
import fs from "node:fs";
import path from "node:path";
import { getFormSet } from "./lib/form-definition.ts";
import { hasCaseMaterial } from "./lib/generate/pages.ts";
import { NEEDS_REVIEW_MARKER } from "./lib/schema.ts";
import { analyze } from "./lib/design/analysis.ts";
import { photoRequestsFor } from "./lib/design/assets.ts";
import { composeSite } from "./lib/design/architecture.ts";
import { sanitizeProject } from "./lib/sanitize.ts";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
if (!id) {
  console.error("\n  使い方: npm run gaps -- <案件ID> [--write]\n");
  process.exit(1);
}
const file = path.join("projects", id, "project.json");
if (!fs.existsSync(file)) {
  console.error(`\n  ${file} が見つかりません。\n`);
  process.exit(1);
}
const project = JSON.parse(fs.readFileSync(file, "utf8"));
const formSet = getFormSet(project.formSet === "general" ? "general" : "manufacturing");

const at = (obj, p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const isEmpty = (v) =>
  v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
const text = (v) => (Array.isArray(v) ? v.join("、") : String(v ?? ""));

/** 社内メモが「まだ確かめていない」と言っているか */
const unsure = (v) => typeof v === "string" && /未確認|要確認|確定させる|照合|うろ覚え|口頭/.test(v);

const unconfirmed = new Set(project.unconfirmed ?? []);
const plan = project.unconfirmedPlan ?? {};

/**
 * **誰に聞くかで分ける。**
 *
 * 第2回は工場で60分、相手は工場長と現場の方である（D-147）。
 * 資本金や電話の受付時間を、機械の前に立って聞くのは時間の無駄で、
 * **全部を1枚に並べると、現場でしか聞けないことが埋もれる。**
 *   現場　… 技術・設備・事例の工程。**その場でしか確かめられない**
 *   事務　… 社長にメールで足りる。取材の時間を使わない
 */
const SITE_BLOCKS = new Set(["capability", "strengths", "cases"]);

/** @type {{rank:number, who:string, where:string, label:string, now:string, ask:string, effect:string}[]} */
const items = [];
let who = "事務";
const add = (rank, where, label, now, ask, effect) =>
  items.push({ rank, who, where, label, now, ask, effect });

const ask = (f) =>
  f.help ? `${f.label}：${f.help}`
  : f.placeholder ? `${f.label}を教えてください（例：${f.placeholder}）`
  : `${f.label}を教えてください`;

for (const block of formSet.blocks) {
  who = SITE_BLOCKS.has(block.id) ? "現場" : "事務";
  for (const field of block.fields) {
    const value = at(project, field.path);

    // ── list の中（事例・設備など）は、行ごとに見る ──
    if (field.itemFields && Array.isArray(value)) {
      value.forEach((row, i) => {
        const name = row?.title || row?.model || row?.name || `${i + 1}件目`;
        /**
         * **この事例は、いま原稿ページが作られない状態か**（D-254）。
         * 止まっているのは「どう解決したか」であって、結果や材質ではない。
         * 全部の欄に「ページが作られません」と書くと、**どれを埋めれば直るのかが消える。**
         */
        const stuck = field.path === "cases" && !hasCaseMaterial(stripMarker(row));
        for (const f of field.itemFields) {
          const v = row?.[f.path];
          const where = `${field.label}「${name}」／${f.customerLabel ?? f.label}`;
          const isKey = stuck && f.path === "solution";
          /**
           * **「結果」が無い事例は、結果の節ごと消えて公開される。**
           * 事例の説得力は数字で決まる（D-172）。数量や納期は表の行が1つ減るだけだが、
           * 結果は**節そのもの**が消えるので、「で、どうなったのか」が画面から無くなる。
           */
          const guts = !stuck && field.path === "cases" && f.path === "result";
          const tail = stuck && !isKey ? "（この事例は、いま原稿ページが作られていません）" : "";

          if (f.internal) {
            // 社内メモそのものは聞く対象ではない。**中身が「まだ確かめていない」と言っていたら拾う**
            if (unsure(v)) add(2, where, f.label, text(v), "現地で現物と照合してください", "間違ったまま公開すると、取引の前提が狂います");
            continue;
          }
          const missing = isEmpty(v) || (typeof v === "string" && v.includes(NEEDS_REVIEW_MARKER));
          if (!missing) continue;
          add(isKey || guts ? 1 : 3, where, f.label, isEmpty(v) ? "（空欄）" : text(v), ask(f),
            (isKey ? "この事例の原稿ページが作られません（D-254）"
              : guts ? "事例ページから「結果」の節が消えたまま公開されます（D-172：事例の説得力は数字で決まる）"
              : effectOf(field.path, f.path)) + tail);
        }
      });
      continue;
    }

    // ── ふつうの欄 ──
    if (field.internal) {
      if (unsure(value)) add(2, `${block.title}／${field.label}`, field.label, text(value), "現地で現物と照合してください", "間違ったまま公開すると、取引の前提が狂います");
      continue;
    }
    const where = `${block.title}／${field.customerLabel ?? field.label}`;
    if (unconfirmed.has(field.path)) {
      add(1, where, field.label, "（取材で答えが出なかった。いまは出していません）", ask(field),
        `${plan[field.path] ?? "埋まれば"}　→　ページにこの行が出るようになります`);
    } else if (typeof value === "string" && value.includes(NEEDS_REVIEW_MARKER)) {
      add(1, where, field.label, text(value), ask(field), "原稿にこの行が出ません");
    } else if (isEmpty(value)) {
      add(field.required ? 1 : 3, where, field.label, "（空欄）", ask(field), effectOf(field.path));
    }
  }
}

/** `{{要確認}}` を落とした行。事例ページが作れるかの判定に使う（`sanitizeProject` と同じ扱い） */
function stripMarker(row) {
  const cut = (v) => {
    if (typeof v !== "string") return v;
    const i = v.indexOf(NEEDS_REVIEW_MARKER);
    return i < 0 ? v : v.slice(0, i).trim();
  };
  return Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, cut(v)]));
}

/** 埋まると画面で何が変わるか。**分かるものだけ書く。分からないものは正直に一般論** */
function effectOf(fieldPath, itemPath) {
  if (fieldPath === "capability.equipment" && (itemPath === "maker" || itemPath === "model"))
    return "設備のカードに出せる台数が増えます（型番が検索されます）";
  if (fieldPath === "cases" && (itemPath === "materials" || itemPath === "processes"))
    return "事例の札（材質・加工法）が出ます。検索で拾われる語です";
  if (fieldPath === "cases" && (itemPath === "quantity" || itemPath === "leadTime"))
    return "事例の仕様表に行が増えます（事例の説得力はこの3つで決まる・D-172）";
  if (fieldPath === "capability.tolerance") return "「対応できる条件」に精度の行が出ます";
  if (fieldPath === "capability.processes") return "対応可能範囲のページの中心になります（材質×加工法で検索されます）";
  if (fieldPath === "capability.maxSize" || fieldPath === "capability.minSize")
    return "「対応できる条件」にサイズの行が出ます";
  return "ページの行が1つ増えます";
}

// ── 出す ──────────────────────────────────────────
const RANKS = [
  [1, "埋めないと、ページが作られない／中身が欠けたまま出ます", "ここだけで60分の元は取れます"],
  [2, "裏を取ってください（間違っていると事故になります）", "現物・銘板・図面と照合する"],
  [3, "埋めると、ページの中身が増えます", "時間が余ったら"],
];

const lines = [];
const out = (s = "") => lines.push(s);
const site = items.filter((x) => x.who === "現場");
const desk = items.filter((x) => x.who === "事務");

out(`# ${project.basics?.name ?? id} — 次の取材で埋めること`);
out("");
out(`作成 ${new Date().toLocaleDateString("ja-JP")}　／　もとにしたデータ：${file}`);
out("");
out("**この紙は `npm run gaps` が `project.json` から作っています。**");
out("手で直さないでください。データを直して、作り直してください。");
out("");
out(`現場で聞くこと **${site.length}件**　／　メールで足りること **${desk.length}件**`);
out("");
out("---");
out("");
out("# 第2回取材（工場・60分）で聞くこと");
out("");
out("> 相手は工場長・現場の方です。**その場でしか確かめられないものだけ**を並べています。");
out("");

for (const [rank, title, note] of RANKS) {
  const list = site.filter((x) => x.rank === rank);
  if (!list.length) continue;
  out(`## ■ ${title}　${list.length}件`);
  out("");
  out(`> ${note}`);
  out("");
  list.forEach((x, i) => {
    out(`**${i + 1}. ${x.where}**`);
    out("");
    out(`- いま　：${x.now}`);
    out(`- 聞く　：**${x.ask}**`);
    out(`- 埋まると：${x.effect}`);
    out("");
  });
}
if (!site.length) {
  out("## 現場で聞くことは、もうありません");
  out("");
  out("**書き出して画面を見る**段階です。");
  out("");
}

/**
 * **事務のぶんは1行ずつにする。**
 * 現場の質問と同じ密度で書くと、量で押し流されて、現場のほうが読まれなくなる。
 */
out("---");
out("");
out(`# メールで足りること（社長宛て）　${desk.length}件`);
out("");
out("> 工場では聞かないでください。**60分を技術に使います。**");
out("");
for (const [rank, title] of RANKS) {
  const list = desk.filter((x) => x.rank === rank);
  if (!list.length) continue;
  out(`### ${title}　${list.length}件`);
  out("");
  for (const x of list) out(`- ${x.where}　…　${x.now === "（空欄）" ? "" : x.now + "　"}**${x.ask}**`);
  out("");
}

/**
 * ── お客様にお願いする写真 ──────────────────────────
 *
 * **写真は、聞き取りでは埋まらない。** お客様から預かるものである。
 * それなのに、ここには写真の質問が1件も無かった（実測0件）のに、
 * **公開判定は仮の画像で止まっていた。**
 * 止める基準はあるのに、何をもらえばよいかを出す仕組みが無かった（docs/31 §1-3）。
 *
 * **判定そのものはここでしない。** Asset層（`lib/design/assets.ts`）が
 * ページを組んだうえで出した `wanted` を、**人が読める形に並べ替えるだけ**である。
 */
{
  /** **判定は Asset層がする。ここは人が読む形に並べ替えるだけ** */
  const p = sanitizeProject(project);

  /**
   * ── この会社のサイトの骨格 ────────────────────────
   *
   * **社長が「なぜこの順番か」を説明できるようにする**（第6段階）。
   * 骨格は規則で決まっていて、AIも乱数も使っていないので、
   * ここに出した理由がそのまま**お客様への説明**になる。
   */
  const sitePlan = composeSite(p, analyze(p));
  out("---");
  out("");
  out("# このサイトの骨格");
  out("");
  out(`**${sitePlan.pages.filter((x) => x.inNav).map((x) => x.label + (x.depth === "thick" ? "（厚く）" : "")).join(" → ")}**`);
  out("");
  out("なぜこの並びか：");
  for (const why of sitePlan.why.split("／")) out(`- ${why}`);
  out("");

  const requests = photoRequestsFor(p, analyze(p));
  if (requests.length) {
    out("---");
    out("");
    out(`# お客様にお願いする写真　${requests.length}件`);
    out("");
    out("> **この欄は取材では埋まりません。** 写真はお客様から預かるものです。");
    out("> 下は「どの写真が、どのページで、どれくらい効くか」を、組み上げた画面から出したものです。");
    out("");
    const LABEL = { high: "★ 先にお願いしたい", medium: "あると良い", low: "余裕があれば" };
    for (const level of ["high", "medium", "low"]) {
      const list = requests.filter((r) => r.priority === level);
      if (!list.length) continue;
      out(`## ${LABEL[level]}　${list.length}件`);
      out("");
      list.forEach((r, i) => {
        out(`**${i + 1}. ${r.category}**`);
        out("");
        out(`- どこで使う：${r.places.join("・")}`);
        out(`- なぜ　　　：${r.why}`);
        out("");
      });
    }
  }
}

out("---");
out("");
out("## 取材のあと");
out("");
out("```");
out(`npm run gaps -- ${id}        # 埋まったか、もう一度確かめる`);
out(`npm run build:site -- ${id}  # 画面に反映する`);
out("```");
out("");
out("**埋めた欄は、聞いた言葉のまま入れてください。** 整えるのは後の工程です（D-013）。");

const body = lines.join("\n");
console.log("\n" + body + "\n");
console.log(`  ── 現場 ${site.length}件／事務 ${desk.length}件 ──\n`);

if (args.includes("--write")) {
  const dst = path.join("projects", id, `取材メモ-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(dst, body + "\n", "utf8");
  console.log(`  保存しました：${dst}`);
  console.log(`  **お客様の情報が入っています。** そのまま人に渡さないでください。\n`);
}
