# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and verify your change.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Read CLAUDE.md and `docs/agents/` first. They describe the architecture, store APIs and conventions.

# FEEDBACK LOOPS

This repo has no test suite. Before committing:

1. Run `npm run typecheck` if the script exists, and fix every error
2. Start the server with `node server.js` (or `node server.ts` once that exists) and curl the endpoints your change touches, e.g. `curl localhost:3001/api/search?store=ah&q=koffie`. Stop the server afterwards
3. Do not install or launch the macOS app bundle; the sandbox is Linux. Note any app-bundle checks as manual follow-ups in your issue comment

Do not add a test framework unless the issue asks for one.

# COMMIT

Make a git commit. Match the style in the recent commits above: a short imperative subject line, then a body explaining what changed and why. Reference the issue as `#<ID>`.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
