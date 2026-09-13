#!/bin/bash
#
# 案件を選んでサイトを書き出す（macOS はダブルクリック）
#
cd "$(dirname "$0")" || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。https://nodejs.org からインストールしてください。"
  read -r -p "  Enterで閉じます " _
  exit 1
fi

echo ""
echo "  サイトを書き出す案件を選んでください。"
echo ""

# macOS の bash は 3.2 なので、配列の扱いは古い書き方に合わせる
ids=""
n=0
for dir in projects/*/; do
  id=$(basename "$dir")
  case "$id" in .*|'*') continue ;; esac
  [ -f "$dir/project.json" ] || continue
  n=$((n + 1))
  name=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$dir/project.json','utf8')).basics?.name||'')}catch(e){}" 2>/dev/null)
  echo "    $n) $id  $name"
  ids="$ids $id"
done

if [ "$n" = "0" ]; then
  echo "    案件がありません。先に KOBO で聞き取りを作ってください。"
  read -r -p "  Enterで閉じます " _
  exit 1
fi

echo ""
read -r -p "  番号を入れて Enter： " pick
id=$(echo $ids | cut -d' ' -f"$pick")

if [ -z "$id" ]; then
  echo "  その番号の案件はありません。"
  read -r -p "  Enterで閉じます " _
  exit 1
fi

node build-site.mjs "$id"
echo ""
read -r -p "  Enterで閉じます " _
