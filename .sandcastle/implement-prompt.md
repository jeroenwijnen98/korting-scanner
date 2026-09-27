# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run the checks below.

# CONTEXT

Read `CLAUDE.md` first, and `CONTEXT.md` if it exists. `CLAUDE.md` describes the
store adapters, the common product schema and the bonus mechanisms; follow its
names (store adapter, saved product, price snapshot, bonus mechanism).

You are in a sandbox, not on the Mac that runs Korting Scanner. There is no `.env`
and no `src/data/`: never call the store APIs (AH, Dirk, Etos, Kruidvat) and never
run `src/scripts/sendBonusEmail.js`. The .app launcher, `install-app.command`,
`restart.command`, `run.sh` and sleepwatcher cannot be exercised here either; edit
them if the issue asks, but you cannot run them.

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

# EXECUTION

There is no test suite. Your checks are the type checker and a smoke boot.

Frontend files in `public/` are served to the browser as they are: never add a
build step, a bundler or emitted files there. Backend TypeScript runs through
Node's own type stripping, so use erasable syntax only.

# FEEDBACK LOOPS

1. If `package.json` has a `typecheck` script, `npm run typecheck` must pass.
2. Smoke boot: `PORT=3999 node <server entry> > /tmp/boot.log 2>&1 &`, then
   `curl -s -o /dev/null -w '%{http_code}\n'` against `/` and `/api/products`.
   Expect 200 and 200. Do not curl `/api/search`, `/api/product/*` or `/api/bonus`
   (they reach the stores) or `/api/session` (it never ends). Kill the server
   afterwards.

Save each check's output with `2>&1 | tee /tmp/<name>.log` and read that file instead of
rerunning the check.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

Some acceptance criteria can only be checked on the host (launching the .app,
autoquit timing, a real store response, the bonus email). Do not claim them. Once
the rest is done, comment on the issue listing which criteria you verified and which
are left for a human on the host.

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
