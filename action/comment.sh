#!/usr/bin/env bash
set -euo pipefail
prs="${PRS:-}"
[ -n "$prs" ] || prs=$(gh api "repos/$REPO/commits/$SHA/pulls" --jq '.[].number')
for n in $prs; do
  id=$(gh api "repos/$REPO/issues/$n/comments" --paginate --jq '.[] | select(.body | contains("<!-- ciwhy -->")) | .id' | tail -n 1)
  if [ -n "$id" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$id" -F body=@"$REPORT" >/dev/null
  else
    gh api -X POST "repos/$REPO/issues/$n/comments" -F body=@"$REPORT" >/dev/null
  fi
done
