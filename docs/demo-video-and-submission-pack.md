# Corvin + Shelfmark Demo Video and Submission Pack

## Submission URLs

- Corvin workbench: https://corvin-two.vercel.app
- Shelfmark product: https://shelfmark-navy.vercel.app
- Fresh Shelfmark evidence PR: https://github.com/moriatz-labs/shelfmark/pull/10
- Earlier Shelfmark evidence PR: https://github.com/moriatz-labs/shelfmark/pull/8
- Fresh live Corvin request run: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863
- Fresh screenshot artifact: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863/artifacts/7766415138

## 2-3 Minute Demo Script

1. Start on Corvin.
   - "Corvin is a PM workbench for turning a product problem into a reviewable software change."
   - "Shelfmark is the default demo product, but Corvin is built around connected product workspaces."

2. Sign in.
   - Show the Corvin sign-in screen.
   - Say: "The PM does not need to set up a local codebase or write an engineering handoff."

3. Connect the product workspace.
   - Select Shelfmark.
   - Show Corvin scanning framework, commands, pages, checks, and analytics status.
   - Show the generated run packet.
   - Say: "Corvin generates the execution context during onboarding."

4. Submit a product request.
   - Use: "Make Shelfmark explain saved research value more clearly for product managers on first visit."
   - Submit.
   - Say: "This is not a mock response. Corvin dispatches the Shelfmark cloud agent."

5. Show evidence.
   - Open the GitHub Actions run.
   - Open the Shelfmark PR.
   - Point out changed files, checks, screenshot/evidence, summary, and AI model attribution.
   - Say: "Corvin does not merge or deploy judge requests. The output is a review gate."

6. Show Shelfmark.
   - Open https://shelfmark-navy.vercel.app.
   - Say: "Shelfmark is the actual bookmarking product. Users can sign in, save bookmarks, organize collections and tags, add notes, favorite, and archive."

7. Close with the learning.
   - "The main learning is that PM-facing AI needs context and evidence, not a blank prompt. Corvin gives PMs a way to propose fixes, features, and experiments that are directly viewable and reviewable."

## Written Submission Copy

Corvin is a product-manager workbench that turns plain-language product requests into reviewable software changes. A PM or judge signs in, connects a product workspace, lets Corvin generate the run packet, and submits a request such as a UI fix, onboarding improvement, empty-state change, or product experiment. Corvin then prepares evidence: a branch, checks, screenshot artifact, summary, and pull request. It does not merge or deploy the change.

Shelfmark is the default demo product: a login-based bookmarking app for product teams saving research, customer evidence, launch notes, and analytics references. Users can save bookmarks with title, URL, collection, tags, notes, favorite state, and archived state.

Corvin is designed to work beyond Shelfmark. The deployed app exposes connected product workspaces, and the backend supports a generic product-workspace request route. Shelfmark uses a GitHub Actions cloud agent for public judging; other configured workspaces use the generated `exec.md` and local runner path to clone, run, change, screenshot, and open review PRs.

Tools used: React, TypeScript, Vite, Tailwind, shadcn-style UI, Clerk, Supabase, GitHub Actions, Vercel, Novus/Pendo-ready analytics wrappers, and OpenAI GPT-5 Codex.

What I learned: PM-facing AI workflows need preset context, not messy setup forms. A generated run packet makes repository onboarding feel like a product workflow. PR-only output is a practical review gate because judges can inspect real code changes without getting merge or deploy power.

## Submission Checklist

- Public Corvin URL: ready.
- Public Shelfmark URL: ready.
- Demo video: record with the script above.
- Working PR evidence: ready.
- Novus/Pendo dashboard screenshot: still needs the real Novus/Pendo install key.
- Clerk production deploy: still needs interactive `clerk deploy` from the account owner if the production warning appears.
