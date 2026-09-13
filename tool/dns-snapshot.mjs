/**
 * KOBO — 今のDNS設定を控える
 *
 *   npm run dns -- <ドメイン> [案件ID]
 *
 * **DNSを切り替える前に、必ず今の設定を控える。**
 * 控えが無いと、何か起きたときに元に戻せない。戻せない作業は、やってはいけない作業になる。
 *
 * とくに MX（メール）。Aレコードだけ見て切り替えると、**会社のメールが止まる**（D-107）。
 * サイトが数時間見えないことより、はるかに重大な事故になる。
 *
 * Node の標準機能だけで動く（依存パッケージなし）。
 */
import { Resolver } from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";

const [domainRaw, projectId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!domainRaw) {
  console.error("\n  使い方: npm run dns -- <ドメイン> [案件ID]");
  console.error("  例:     npm run dns -- matsubara-seiki.co.jp matsubara-seiki\n");
  process.exit(1);
}
// https:// や末尾の / が付いていても受け取る
const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();

const resolver = new Resolver();

/** 引けなかった理由は、無いのか調べられなかったのかで意味が違う */
async function look(label, fn) {
  try {
    const value = await fn();
    return { label, value, state: "ok" };
  } catch (err) {
    const code = err?.code ?? "";
    if (code === "ENODATA" || code === "ENOTFOUND") return { label, value: [], state: "なし" };
    return { label, value: [], state: `引けませんでした（${code}）` };
  }
}

const results = await Promise.all([
  look("ネームサーバー（NS）", () => resolver.resolveNs(domain)),
  look("A（サイトの向き先）", () => resolver.resolve4(domain)),
  look("AAAA（IPv6）", () => resolver.resolve6(domain)),
  look("www のCNAME", () => resolver.resolveCname(`www.${domain}`)),
  look("★ MX（メールの受け先）", () => resolver.resolveMx(domain)),
  look("TXT（SPFなど）", () => resolver.resolveTxt(domain)),
  look("_dmarc の TXT", () => resolver.resolveTxt(`_dmarc.${domain}`)),
]);

const fmt = (v) =>
  Array.isArray(v)
    ? v.map((x) => (Array.isArray(x) ? x.join("") : typeof x === "object" ? `${x.priority} ${x.exchange}` : String(x)))
    : [String(v)];

console.log(`\n  ${domain} の現在の設定　（${new Date().toLocaleString("ja-JP")}）\n`);
for (const r of results) {
  const lines = r.state === "ok" ? fmt(r.value) : [r.state];
  console.log(`  ${r.label}`);
  for (const line of lines.length ? lines : ["（なし）"]) console.log(`      ${line}`);
}

const mx = results.find((r) => r.label.includes("MX"));
if (mx.state === "ok" && mx.value.length) {
  console.log("\n  ★ このドメインでメールを使っています。");
  console.log("     切り替え先にも同じMXを必ず設定してください。**忘れると会社のメールが止まります。**");
} else {
  console.log("\n  MXはありません。このドメインでメールは受けていないようです。");
  console.log("     ただし、お客様に口頭でも確認してください（設定漏れの可能性もあります）。");
}

if (projectId) {
  const dir = path.join("projects", projectId, "dns");
  if (!fs.existsSync(path.join("projects", projectId))) {
    console.error(`\n  案件が見つかりません: projects/${projectId}\n`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `${domain}_${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ domain, takenAt: new Date().toISOString(), records: results.map((r) => ({ ...r, value: fmt(r.value) })) }, null, 2) + "\n",
  );
  console.log(`\n  控えを保存しました: ${file}`);
  console.log("  **切り替え作業は、この控えを取ってから始めてください。**");
}
console.log("");
