#!/usr/bin/env bash
set -euo pipefail
prs="${PRS:-}"
[ -n "$prs" ] || prs=$(gh api "repos/$REPO/commits/$SHA/pulls" --jq '.[] | select(.state == "open") | .number')
[ -n "$prs" ] || [ "${HEAD:-:}" = ":" ] || prs=$(gh api "repos/$REPO/pulls?state=open&head=$HEAD" --jq ".[] | select(.head.sha == \"$SHA\") | .number")
for n in $prs; do
  id=$(gh api "repos/$REPO/issues/$n/comments" --paginate --jq '.[] | select(.user.type == "Bot" and (.body | startswith("<!-- ciwhy -->"))) | .id' | tail -n 1)
  if [ -n "$id" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$id" -F body=@"$REPORT" >/dev/null
  else
    gh api -X POST "repos/$REPO/issues/$n/comments" -F body=@"$REPORT" >/dev/null
  fi
done
