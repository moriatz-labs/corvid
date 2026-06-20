# World Product Day Submission Handoff

## Public URLs

- Corvin PM workbench: https://corvin-two.vercel.app
- Shelfmark bookmarking product: https://shelfmark-navy.vercel.app
- Corvin-generated Shelfmark PR evidence: https://github.com/moriatz-labs/shelfmark/pull/8
- Successful cloud-agent run: https://github.com/moriatz-labs/shelfmark/actions/runs/27863213750

## What We Built

Corvin is a product-manager workbench for requesting real changes against a real product repository. Judges sign in, connect the preset Shelfmark workspace, submit an open-text product request, and receive review evidence instead of a demo response: a branch, GitHub pull request, verification summary, and screenshot artifact.

Shelfmark is the judged product Corvin modifies. It is a login-based bookmarking app for product teams saving research, launch notes, analytics references, and customer evidence. Users can save bookmarks with title, URL, collection, tags, notes, favorite state, and archived state.

## Who It Is For

This is for product managers and judges who want to evaluate whether an AI-assisted product workflow can move from request to reviewable software change without asking PMs to write setup instructions or touch engineering internals.

## Tools Used

- React, TypeScript, Vite, Tailwind, shadcn-style UI, Lucide
- Clerk for authentication
- Supabase for Shelfmark data storage and RLS-backed tables
- GitHub Actions for the Shelfmark cloud agent
- Vercel for production deployment
- Novus/Pendo-ready analytics wrappers and event instrumentation
- OpenAI GPT-5 Codex for implementation

## Product Flow To Demo

1. Open Corvin at https://corvin-two.vercel.app.
2. Sign in with Clerk.
3. Start onboarding and select the Moriatz Labs Shelfmark repository.
4. Let Corvin scan the repository and generate `exec.md`.
5. Continue into the Shelfmark PM workbench.
6. Submit a product request, for example: "Make the empty state clearer for PMs reviewing saved research."
7. Show the returned cloud-agent status and link.
8. Open the resulting Shelfmark PR.
9. Show the PR body: request, summary, changed files, verification, screenshot artifact, and AI attribution.
10. Show Shelfmark remains a real deployed product at https://shelfmark-navy.vercel.app.

## What We Learned

- PM-facing AI workflows need preset context, not blank setup forms.
- A generated `exec.md` makes onboarding feel like Novus-style repository connection instead of engineering homework.
- PR-only output is a strong review gate: it lets judges inspect real code changes without giving them merge or deploy power.
- Cloud execution is essential for public judging because local-only agents cannot be used by external reviewers.
- Analytics must be honest: Corvin now reports Novus as pending until the correct Pendo install key is present.

## Current External Blockers

- Real Novus/Pendo install key is still required. The incorrect key was removed from local env, Vercel, and GitHub Actions secrets.
- Clerk production deploy still requires an interactive `clerk deploy` run from the account owner.
- Submission still needs a 2-3 minute public or unlisted demo video.
- Submission still needs a Novus dashboard screenshot after the real key is installed.

## Env Slots To Fill After Account Setup

Set the real Pendo install key as:

```text
VITE_NOVUS_PENDO_API_KEY=<real-pendo-install-key>
```

Locations:

- Corvin Vercel production and development
- Shelfmark Vercel production and development
- Shelfmark GitHub Actions secret
- Local `.env` files for Corvin and Shelfmark

After the key is set, update Corvin:

```text
SHELFMARK_NOVUS_INSTALLED=true
```

Then redeploy both apps.
