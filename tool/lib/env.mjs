/**
 * KOBO — `tool/.env` からキーを読む（D-468）
 *
 * 以前はターミナルの環境変数（`export ANTHROPIC_API_KEY=...`）からしか読まず、
 * **ターミナルを開き直すたびに入れ直す**必要があった。
 *
 * 【決めたこと】
 * ・置き場所は `tool/.env` の1か所だけ。**Git に載らない**（`tool/.gitignore` に `.env` がある）
 * ・**ターミナルで入れた値が勝つ。** ファイルは既定値の扱い（Node の `loadEnvFile` の決まり）
 * ・**ファイルが無ければ何もしない。** 何も言わない——キーが要る道具のほうが、
 *   無いことを明記して止まる（社長のご指示「APIキーが無い場合は、明記して止める」）
 *
 * 使う道具は、**いちばん最初の import** でこれを読む（ほかのモジュールより先に値が入る）。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const file = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", ".env");
if (fs.existsSync(file)) process.loadEnvFile(file);
