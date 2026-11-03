# Unattended content sync

When the study repo changes, the daily GitHub Action (`.github/workflows/sync-content.yml`) opens a `content-sync`
PR, but it cannot translate or deploy. `auto.sh` does the rest on the owner's machine, where git, gh, wrangler and
Claude Code are already signed in:

1. pulls this repo and the study repo, runs `npm run sync`; stops if nothing changed (and closes a stale PR);
2. runs Claude Code headless with `TASK.md`: translates the Spanish reported by `node scripts/i18n.mjs list` and maps
   new courses in `scripts/course-map.json` (tools limited to editing this repo and the two node scripts);
3. checks: 0 stale / 0 missing translations, only content and the course map changed, then lint, unit, build and
   end-to-end tests;
4. commits to `content-sync`, merges the PR, deploys (refusing if a D1 migration is pending) and runs the
   production smoke test;
5. sends a desktop notification either way. Logs: `~/.local/state/ccdvf-content-sync/`.

Any failure stops before deploying and leaves the PR open.

```sh
DRY_RUN=1 scripts/content-sync/auto.sh   # everything except push, merge and deploy

# install the daily timer (09:30, catches up after the machine was off)
cp scripts/content-sync/systemd/ccdvf-content-sync.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now ccdvf-content-sync.timer
systemctl --user list-timers ccdvf-content-sync.timer     # next run
systemctl --user disable --now ccdvf-content-sync.timer   # turn it off
```
