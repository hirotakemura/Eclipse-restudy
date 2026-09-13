#!/bin/bash
#
# KOBO を起動する（macOS はこのファイルをダブルクリックするだけ）
#
# ターミナルでフォルダを移動しなくても動くように、
# **このファイル自身の場所**に移動してから起動する。
#
cd "$(dirname "$0")" || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。https://nodejs.org からインストールしてください。"
  echo ""
  read -r -p "  Enterで閉じます " _
  exit 1
fi

echo ""
echo "  最新のコードを取りに行きます…"
git pull --quiet 2>/dev/null || echo "  （取得できませんでした。今あるコードで起動します）"

echo "  終わるときは、このウィンドウで Control + C を押してください。"
exec node server.mjs
