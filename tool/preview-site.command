#!/bin/bash
#
# 書き出したサイトをブラウザで見る（macOS はダブルクリック）
#
# **書き出しはしない。** すでに書き出してあるものを、そのまま見るだけ。
# 書き出しからやり直すときは build-site.command のほう。
#
cd "$(dirname "$0")" || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。https://nodejs.org からインストールしてください。"
  read -r -p "  Enterで閉じます " _
  exit 1
fi

echo ""
echo "  見たい案件を選んでください。"
echo ""

# macOS の bash は 3.2 なので、配列の扱いは古い書き方に合わせる
ids=""
n=0
for dir in projects/*/; do
  id=$(basename "$dir")
  case "$id" in .*|'*') continue ;; esac
  [ -f "$dir/project.json" ] || continue
  # 書き出してあるものだけを出す
  if [ -d "$dir/site" ]; then
    mark=""
  elif [ -d "$dir/site-draft" ]; then
    mark="  ※まだ公開できない状態"
  else
    continue
  fi
  n=$((n + 1))
  name=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$dir/project.json','utf8')).basics?.name||'')}catch(e){}" 2>/dev/null)
  echo "    $n) $id  $name$mark"
  ids="$ids $id"
done

if [ "$n" = "0" ]; then
  echo "    まだ書き出された案件がありません。"
  echo "    先に build-site.command を実行してください。"
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

exec node preview-site.mjs "$id"
