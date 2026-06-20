# World Product Day Submission: Corvin + Shelfmark

## Public Links

- Working product: https://corvin-two.vercel.app
- Default product workspace: https://shelfmark-navy.vercel.app
- Latest generated PR: https://github.com/moriatz-labs/shelfmark/pull/10
- Latest cloud-agent run: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863
- Screenshot artifact: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863/artifacts/7766415138

## Short Description

Corvin is a product-manager workbench that turns a plain-language product request into a reviewable software change. PMs and judges sign in, connect a product workspace, let Corvin generate the run packet, and submit a request such as a UI fix, onboarding improvement, empty-state change, or product experiment. Corvin then prepares review evidence: checks, screenshot artifact, summary, branch, and pull request. It does not merge or deploy judge-created changes.

Shelfmark is the default product workspace for the demo. It is a working bookmarking app for product teams saving research, customer evidence, launch notes, and analytics references.

## Who It Is For

Corvin is for product managers who see a product problem and want a concrete, reviewable change without setting up a local codebase or writing engineering handoff docs. It is also for teams that want PM-led experiments to remain safe: visible, tested, and gated by pull requests.

## Tools Used

- React, TypeScript, Vite, Tailwind, shadcn-style UI, Lucide
- Clerk authentication
- Supabase for Shelfmark data
- GitHub Actions for the Shelfmark cloud agent
- Vercel for deployment
- Novus/Pendo-ready analytics wrappers and event tracking
- OpenAI GPT-5 Codex

## What To Demo

1. Open Corvin at https://corvin-two.vercel.app.
2. Sign in.
3. Start onboarding and select Shelfmark.
4. Show Corvin scanning the workspace and generating `exec.md`.
5. Continue into the PM workbench.
6. Submit: `Make Shelfmark explain saved research value more clearly for product managers on first visit.`
7. Show the cloud-agent run.
8. Open the generated Shelfmark PR.
9. Point out the request, summary, changed file, test/build verification, screenshot artifact, and AI model attribution.
10. Open Shelfmark to show the actual bookmarking product.

## Demo Script

Corvin is a PM workbench for turning product judgment into working software evidence. Instead of asking a PM to set up a codebase or write an engineering handoff, Corvin connects a product workspace, scans it, and generates the run packet automatically.

For this submission, Shelfmark is the default workspace. It is a real bookmarking product for product teams collecting research and customer evidence. I can ask for a product improvement in plain language, and Corvin dispatches the Shelfmark cloud agent.

The important part is that this is not a mock response. The agent applies a visible product change, runs tests and build, captures screenshot evidence, and opens a GitHub pull request. Corvin does not merge or deploy. The output is a review gate: a PR, screenshot, summary, and verification results that a team can inspect.

The main learning is that PM-facing AI needs context and evidence, not a blank prompt. Corvin gives PMs a way to propose fixes, features, and experiments that are directly viewable and reviewable.

## What I Learned

- PM-facing AI workflows need preset context rather than messy setup forms.
- Generating `exec.md` during onboarding makes repository setup feel like a product workflow.
- A PR-only review gate keeps PM-led changes inspectable and safe.
- Public judging needs cloud execution, not local-only agents.
- Analytics status must be honest: Corvin only marks Novus/Pendo active when the real install key is configured.

## Final Submission Checklist

- Public working URL: Corvin production URL.
- Demo video: record using the script above.
- PR evidence: Shelfmark PR #10.
- Novus/Pendo screenshot: capture from Novus dashboard after installing the real key.
- Written description: use the Short Description, Who It Is For, Tools Used, and What I Learned sections above.
