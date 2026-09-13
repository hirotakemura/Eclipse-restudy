/**
 * KOBO — ヒアリングフォームのローカルサーバー
 *
 * 依存パッケージなし。Node の型ストリッピングで lib/*.ts を直接読む。
 *   npm start   → http://localhost:5173
 *
 * 同じWi-Fiのタブレットからも開ける（起動時にアドレスを出す）。
 * ただし**その網にいる誰からも見える**ので、取材先のWi-Fiでは使わないこと。
 *
 * 案件データは projects/{案件ID}/project.json に保存する（Git管理外）。
 * 工場のネットは不安定なので、ネット接続を前提にしない設計にしている。
 */

import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

// lib/*.ts を直接読むため、Node の型ストリッピングが要る。
// 対応していない環境で「Unknown file extension .ts」と出ると原因が分かりにくいので、
// 先に確認して、何をすればよいかを日本語で出す。
if (process.features.typescript !== "strip") {
  const [major, minor] = process.versions.node.split(".").map(Number);
  console.error(`\nKOBO を起動できません。Node.js ${process.versions.node} を使用中です。\n`);
  if (major > 22 || (major === 22 && minor >= 6)) {
    console.error("このバージョンでは、型ストリッピングを明示的に有効にする必要があります：\n");
    console.error("    node --experimental-strip-types server.mjs\n");
    console.error("または package.json の start を書き換えてください。\n");
  } else {
    console.error("Node.js 22.18 以降にアップデートしてください。\n");
    console.error("    https://nodejs.org/  （LTS版で問題ありません）\n");
  }
  process.exit(1);
}

const { FORM_SETS, getFormSet } = await import("./lib/form-definition.ts");
const { computeCompletion } = await import("./lib/completion.ts");

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * 起動しているコードがどの版なのかを返す。
 *
 * 遠隔でやりとりしていると「pull したのに反映されていない気がする」が必ず起きる。
 * git コマンドに頼らず .git を直接読んで、**画面で確かめられるようにする。**
 */
function codeVersion() {
  try {
    const gitDir = join(ROOT, "..", ".git");
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7);
    const ref = head.slice(5);
    const refPath = join(gitDir, ref);
    if (existsSync(refPath)) return readFileSync(refPath, "utf8").trim().slice(0, 7);
    const packed = readFileSync(join(gitDir, "packed-refs"), "utf8");
    const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 7) : "不明";
  } catch {
    return "不明";
  }
}

const CODE_VERSION = codeVersion();
const PUBLIC = join(ROOT, "public");
const PROJECTS = join(ROOT, "projects");
/**
 * 削除した案件の置き場。
 *
 * **本当には消さない。** 案件データには顧客の技術情報・取引先・連絡先が入っており、
 * 取材90分ぶんの記録が誤クリックで消えるのは割に合わない。
 * ここに移しておけば、Finder から戻せる。
 */
const TRASH = join(PROJECTS, ".trash");
const PORT = Number(process.env.PORT ?? 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/** 案件IDに使えるのは英数字・ハイフン・アンダースコアのみ。パストラバーサル対策 */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function projectDir(id) {
  if (!ID_RE.test(id)) throw new Error(`不正な案件ID: ${id}`);
  const dir = join(PROJECTS, id);
  // 念のため、解決後のパスが projects/ の下にあることを確認する
  if (!resolve(dir).startsWith(resolve(PROJECTS))) throw new Error(`不正な案件ID: ${id}`);
  return dir;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error("リクエストが大きすぎます");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

/** 書きかけのファイルを残さないため、一時ファイルに書いてから rename する */
async function writeJsonAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

/** 充足率は、その案件が使っているフォームセットで計算する */
function withCompletion(project) {
  const { blocks } = getFormSet(project.formSet);
  return { project, completion: computeCompletion(project, blocks, project.unconfirmed ?? []) };
}

function emptyProject(id, name, formSet) {
  return {
    id,
    formSet: formSet === "general" ? "general" : "manufacturing",
    status: "hearing",
    hearingDate: new Date().toISOString().slice(0, 10),
    basics: { name: name ?? "" },
    inquiry: {},
    capability: { equipment: [] },
    strengths: {},
    cases: [],
    recruitment: {},
    executive: {},
    terms: { photo: {}, domain: {} },
    unconfirmed: [],
  };
}

async function listProjects() {
  if (!existsSync(PROJECTS)) return [];
  const entries = await readdir(PROJECTS, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const file = join(PROJECTS, entry.name, "project.json");
    if (!existsSync(file)) continue;
    try {
      const project = JSON.parse(await readFile(file, "utf8"));
      const { blocks } = getFormSet(project.formSet);
      const completion = computeCompletion(project, blocks, project.unconfirmed ?? []);
      const { mtime } = await stat(file);
      out.push({
        id: entry.name,
        name: project.basics?.name ?? entry.name,
        formSet: project.formSet ?? "manufacturing",
        status: project.status ?? "hearing",
        filledPct: completion.filledPct,
        coveredPct: completion.coveredPct,
        updatedAt: mtime.toISOString(),
      });
    } catch {
      // 壊れた project.json は一覧から黙って落とす（他の案件の作業を止めないため）
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = join(PUBLIC, rel);
  if (!resolve(file).startsWith(resolve(PUBLIC)) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("見つかりません");
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(await readFile(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (path === "/api/form") {
      return json(res, 200, { sets: FORM_SETS, version: CODE_VERSION });
    }

    if (path === "/api/projects" && req.method === "GET") {
      return json(res, 200, await listProjects());
    }

    if (path === "/api/projects" && req.method === "POST") {
      const { id, name, formSet } = await readBody(req);
      if (!id || !ID_RE.test(id)) {
        return json(res, 400, { error: "案件IDは英数字・ハイフン・アンダースコアのみ（1〜64文字）" });
      }
      const file = join(projectDir(id), "project.json");
      if (existsSync(file)) return json(res, 409, { error: "その案件IDは既にあります" });
      const project = emptyProject(id, name, formSet);
      await writeJsonAtomic(file, project);
      return json(res, 201, withCompletion(project));
    }

    const match = path.match(/^\/api\/projects\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const file = join(projectDir(id), "project.json");

      if (req.method === "GET") {
        if (!existsSync(file)) return json(res, 404, { error: "案件が見つかりません" });
        return json(res, 200, withCompletion(JSON.parse(await readFile(file, "utf8"))));
      }

      if (req.method === "PUT") {
        const project = await readBody(req);
        project.id = id; // 案件IDはURLを正とする
        await writeJsonAtomic(file, project);
        return json(res, 200, { ...withCompletion(project), savedAt: new Date().toISOString() });
      }

      if (req.method === "DELETE") {
        if (!existsSync(file)) return json(res, 404, { error: "案件が見つかりません" });
        // 消さずにゴミ箱へ移す。戻せる状態を残しておく
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const dest = join(TRASH, `${id}_${stamp}`);
        await mkdir(TRASH, { recursive: true });
        await rename(projectDir(id), dest);
        return json(res, 200, { movedTo: dest });
      }
    }

    if (req.method === "GET") return serveStatic(res, path);
    res.writeHead(405).end();
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * 同じWi-Fiのタブレットから開くためのアドレス。毎回調べなくて済むように起動時に出す。
 *
 * インターフェース名も一緒に出す。Mac には VPN（utun）や仮想環境（bridge, vmnet）の
 * アドレスも生えていることがあり、**どれを使えばよいか分からないと繋がらない。**
 * Wi-Fi は通常 en0 か en1。
 */
function lanAddresses() {
  const wifiLike = /^en\d+$/;
  return Object.entries(networkInterfaces())
    .flatMap(([name, addrs]) =>
      (addrs ?? [])
        .filter((n) => n.family === "IPv4" && !n.internal)
        .map((n) => ({ name, address: n.address, likelyWifi: wifiLike.test(name) })),
    )
    .sort((a, b) => Number(b.likelyWifi) - Number(a.likelyWifi));
}

// 明示的に 0.0.0.0 で待ち受ける。ホストを省くと環境によって IPv6 のみになり、
// 同じ網にいる端末から繋がらないことがある
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nKOBO v0.2  （コード ${CODE_VERSION}）`);
  console.log(`\n  このパソコン       http://localhost:${PORT}`);
  const lan = lanAddresses();
  for (const { name, address, likelyWifi } of lan) {
    const label = likelyWifi ? "タブレット・スマホ" : "（この経路は多分ちがう）";
    console.log(`  ${label} http://${address}:${PORT}  [${name}]`);
  }
  console.log(`\n  案件データ: ${PROJECTS}`);

  if (lan.length) {
    // 顧客の技術情報・連絡先が入るツールなので、どこまで見えるのかは明示しておく。
    // 工場のゲストWi-Fiに繋いだまま使うと、他社の案件データまで同じ網の中から見える
    console.log(
      `\n  ※ 同じWi-Fiにいる端末からは、誰でもこの画面を開けます。` +
      `\n    取材先のWi-Fiに繋いだまま使わないでください。` +
      `\n    現地では、スマホのテザリングに このパソコンとタブレットの両方を繋ぐのが安全です。`,
    );
    console.log(
      `\n  繋がらないときは：` +
      `\n    1. パソコンとスマホが同じWi-Fiにいるか（5GHzと2.4GHzで別SSIDのことがある）` +
      `\n    2. macOS のファイアウォール（システム設定 → ネットワーク → ファイアウォール）` +
      `\n    3. ゲストWi-Fiは端末どうしの通信を遮断していることが多い`,
    );
  }
  console.log("");
});
