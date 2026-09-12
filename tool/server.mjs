/**
 * KOBO v0.1 — ヒアリングフォームのローカルサーバー
 *
 * 依存パッケージなし。Node の型ストリッピングで lib/*.ts を直接読む。
 *   npm start   → http://localhost:5173
 *
 * 案件データは projects/{案件ID}/project.json に保存する（Git管理外）。
 * 工場のネットは不安定なので、ネット接続を前提にしない設計にしている。
 */

import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BLOCKS, TOTAL_MINUTES } from "./lib/form-definition.ts";
import { computeCompletion } from "./lib/completion.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, "public");
const PROJECTS = join(ROOT, "projects");
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

function withCompletion(project) {
  return { project, completion: computeCompletion(project, BLOCKS, project.unconfirmed ?? []) };
}

function emptyProject(id, name) {
  return {
    id,
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
    if (!entry.isDirectory()) continue;
    const file = join(PROJECTS, entry.name, "project.json");
    if (!existsSync(file)) continue;
    try {
      const project = JSON.parse(await readFile(file, "utf8"));
      const completion = computeCompletion(project, BLOCKS, project.unconfirmed ?? []);
      const { mtime } = await stat(file);
      out.push({
        id: entry.name,
        name: project.basics?.name ?? entry.name,
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
      return json(res, 200, { blocks: BLOCKS, totalMinutes: TOTAL_MINUTES });
    }

    if (path === "/api/projects" && req.method === "GET") {
      return json(res, 200, await listProjects());
    }

    if (path === "/api/projects" && req.method === "POST") {
      const { id, name } = await readBody(req);
      if (!id || !ID_RE.test(id)) {
        return json(res, 400, { error: "案件IDは英数字・ハイフン・アンダースコアのみ（1〜64文字）" });
      }
      const file = join(projectDir(id), "project.json");
      if (existsSync(file)) return json(res, 409, { error: "その案件IDは既にあります" });
      const project = emptyProject(id, name);
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
    }

    if (req.method === "GET") return serveStatic(res, path);
    res.writeHead(405).end();
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`KOBO v0.1  →  http://localhost:${PORT}`);
  console.log(`案件データ: ${PROJECTS}`);
});
