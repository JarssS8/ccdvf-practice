#!/usr/bin/env bash
# Daily, on the owner's machine (systemd user timer, see scripts/content-sync/README.md): bring the study repo's
# changes into the live app. Sync → Claude Code translates what is new and maps new courses → lint, unit, build,
# end-to-end → merge the content-sync PR → deploy → production smoke test. Any failure stops before deploying,
# leaves the PR open and says why in a desktop notification and the log.
#   DRY_RUN=1 scripts/content-sync/auto.sh   everything up to the tests; no push, merge or deploy
set -Eeuo pipefail

export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$HOME/.asdf/installs/nodejs/24.22.0/bin:$HOME/.local/share/mise/shims:/usr/local/bin:/usr/bin:/bin"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUDY="$(cd "$APP/.." && pwd)"
STATE="$HOME/.local/state/ccdvf-content-sync"
mkdir -p "$STATE"
LOG="$STATE/$(date +%F_%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
exec 9>"$STATE/lock"
flock -n 9 || { echo "another run is in progress"; exit 0; }

notify() { notify-send -a "Claude Cert Practice" "$1" "$2" 2>/dev/null || true; }
fail() { echo "FAILED: $1"; notify "Content sync stopped" "$1. Log: $LOG"; exit 1; }
trap 'fail "unexpected error at line $LINENO"' ERR
step() { echo; echo "== $(date +%T) $*"; }

cd "$APP"
step "preconditions"
# Never mix this with someone's unfinished work
[ -z "$(git status --porcelain)" ] || fail "practice-app has uncommitted changes"
[ -z "$(git -C "$STUDY" status --porcelain)" ] || fail "the study repo has uncommitted changes"
git checkout -q main
git pull -q --ff-only
git -C "$STUDY" pull -q --ff-only
UPSTREAM="$(git -C "$STUDY" rev-parse --short HEAD)"
echo "app $(git rev-parse --short HEAD) · study repo $UPSTREAM"

step "sync"
node scripts/sync-content.mjs | tee "$STATE/sync.txt"
if git diff --quiet -- src/content && [ -z "$(git ls-files --others --exclude-standard -- src/content)" ]; then
  echo "nothing new in the study repo for the app"
  if [ "$(gh pr view content-sync --json state -q .state 2>/dev/null)" = "OPEN" ] && [ -z "${DRY_RUN:-}" ]; then
    gh pr close content-sync --delete-branch --comment "main already has this content (study repo $UPSTREAM)."
  fi
  exit 0
fi
git checkout -q -B content-sync

step "translate and map (Claude Code)"
if node scripts/i18n.mjs check | grep -qE '[1-9][0-9]* (stale|missing)' || grep -q 'course-map.json\|extra-courses.json' "$STATE/sync.txt"; then
  claude -p "$(cat scripts/content-sync/TASK.md)

## Sync log
$(cat "$STATE/sync.txt")" \
    --permission-mode acceptEdits \
    --add-dir "$STUDY" \
    --allowedTools "Read" "Glob" "Grep" "Edit" "Write" "Bash(node scripts/i18n.mjs:*)" "Bash(node scripts/sync-content.mjs:*)" "Bash(python3:*)" \
    | tee "$STATE/claude.txt"
fi
node scripts/i18n.mjs check | tee "$STATE/i18n.txt"
grep -q ' 0 stale (shown in English) · 0 missing' "$STATE/i18n.txt" || fail "Spanish is still incomplete"
! grep -q '^  ! ' "$STATE/i18n.txt" || fail "translation structure warnings"
# Only content and the course map may change here
unexpected="$(git status --porcelain | awk '{print $2}' | grep -vE '^(src/content/|scripts/course-map\.json|scripts/extra-courses\.json)' || true)"
[ -z "$unexpected" ] || fail "unexpected files changed: $unexpected"

step "checks"
npm ci --no-audit --no-fund --loglevel=error
npm run lint
npm test
npm run build
npm run test:e2e -- --no-build

if [ -n "${DRY_RUN:-}" ]; then
  step "dry run: stopping before push, merge and deploy (branch content-sync left locally)"
  exit 0
fi

step "merge"
git add -A src/content scripts/course-map.json scripts/extra-courses.json
git commit -q -m "Content sync from the study repo ($UPSTREAM)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push -q -f origin content-sync
body="Study repo Amey-Thakur/CLAUDE-CERTIFICATIONS@$UPSTREAM, translated and checked by scripts/content-sync/auto.sh (lint, unit, build, end-to-end).

\`\`\`
$(cat "$STATE/sync.txt")
\`\`\`"
if [ "$(gh pr view content-sync --json state -q .state 2>/dev/null)" = "OPEN" ]; then
  gh pr edit content-sync --body "$body"
else
  gh pr create --head content-sync --base main --title "Content sync from the study repo ($UPSTREAM)" --body "$body"
fi
gh pr merge content-sync --squash --delete-branch
git checkout -q main
git pull -q --ff-only

step "deploy"
# Content never needs a schema change; a pending migration means a person should look first
npx wrangler d1 migrations list ccdvf-practice --remote </dev/null 2>&1 | tee "$STATE/migrations.txt" | grep -q 'No migrations to apply' \
  || fail "pending D1 migrations: deploy by hand"
npm run deploy </dev/null
npm run test:smoke </dev/null

notify "Content sync deployed" "Study repo $UPSTREAM is live on exam.jarsss8.es."
echo "done"
