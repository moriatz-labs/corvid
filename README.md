# Corvin

Corvin is a product-manager workbench for turning a plain-language product request into a reviewable software change. A PM or judge signs in, connects a product workspace, lets Corvin generate the run packet, and submits a request. Corvin returns evidence: branch context, checks, screenshot artifact, summary, and a pull request. It does not merge or deploy the change.

Shelfmark is the default World Product Day product workspace. It is a real bookmarking product for product teams saving research, customer evidence, launch notes, and analytics references.

## Public URLs

- Corvin workbench: https://corvin-two.vercel.app
- Shelfmark product: https://shelfmark-navy.vercel.app
- Latest Corvin-generated Shelfmark PR: https://github.com/moriatz-labs/shelfmark/pull/10
- Latest cloud-agent run: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863
- Screenshot artifact: https://github.com/moriatz-labs/shelfmark/actions/runs/27875171863/artifacts/7766415138

## Product Flow

1. Judge signs into Corvin with Clerk.
2. Judge selects a connected product workspace. Shelfmark is the default.
3. Corvin scans framework, commands, local URL, screenshot targets, and analytics status.
4. Corvin generates `exec.md` during onboarding.
5. Judge submits a product request in plain language.
6. Corvin dispatches the Shelfmark cloud agent.
7. The agent applies a visible product change, runs tests/build, captures screenshot evidence, and opens a PR.
8. The judge receives the PR, screenshot artifact, checks, and summary.

## What Is Working

- Clerk-protected Corvin judge surface.
- Novus-style repository onboarding with generated `exec.md`.
- Multiple connected product workspaces, with Shelfmark as the default.
- Shelfmark GitHub Actions cloud agent.
- PR-only review gate.
- Safety guardrails for secrets, env files, destructive requests, merge, and deploy.
- Shelfmark production app with Clerk, Supabase-backed bookmarking, collections, tags, notes, favorite, and archive states.
- Novus/Pendo-ready analytics wrappers and event instrumentation.

## Run Locally

```bash
npm install
npm run dev
```

Open:

- App: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

## Environment

Copy `.env.example` to `.env` and fill the values you have.

```text
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
GITHUB_TOKEN=
SHELFMARK_GITHUB_REPO=moriatz-labs/shelfmark
SHELFMARK_PRODUCTION_URL=https://shelfmark-navy.vercel.app
SHELFMARK_AGENT_MODE=github-actions
SHELFMARK_AGENT_WORKFLOW=corvin-cloud-agent.yml
SHELFMARK_NOVUS_INSTALLED=false
VITE_NOVUS_PENDO_API_KEY=
```

Set `SHELFMARK_NOVUS_INSTALLED=true` only after the real Novus/Pendo install key is configured and visible in the dashboard.

## Verify

```bash
npm test
npm run build
npm run lint
```

## Deploy

```bash
vercel deploy --prod
```

The production alias is currently:

```text
https://corvin-two.vercel.app
```

## Submission Notes

Use Corvin as the submitted working product URL. In the demo video, show Corvin creating a Shelfmark PR rather than presenting a mock walkthrough.

The latest verified evidence request is:

```text
Make Shelfmark explain saved research value more clearly for product managers on first visit.
```

That request produced Shelfmark PR #10 and a successful GitHub Actions run with tests, build, screenshot upload, and AI model attribution.
