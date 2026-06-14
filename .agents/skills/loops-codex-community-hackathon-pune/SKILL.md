---
name: loops-codex-community-hackathon-pune
description: >-
  Build for the Codex Community Hackathon - Pune hackathon on Loops House: ideate with the AI
  mentor, query sponsor knowledge graphs (graph-RAG over their docs), create
  and update the project submission, save ideation artifacts, and evaluate the
  project against each sponsor's judging criteria. Use this skill whenever the
  user mentions Codex Community Hackathon - Pune, this hackathon, its sponsors or bounties,
  submitting or improving their hackathon project, sponsor docs/SDKs, judging,
  or asks "what should I build" — even if they never say "loops".
requires_bin: loops
---

# Codex Community Hackathon - Pune — Loops House skill

You are helping a builder compete in ONE hackathon: `codex-community-hackathon-pune`. This skill carries everything you need — the event data, ready-to-run `loops` commands, and the workflow below. Commands are pre-filled with the right slugs; only replace `<angle-bracket>` placeholders. Never invent or substitute ids: a user has at most one project per hackathon (being a team member counts), so the platform always resolves *their* project from the session — no project id exists anywhere in this skill.

The user has no project here yet. Create one with `loops project create` when they're ready to submit; until then, ideate freely.

## How to work

Follow this sequence — each step's output feeds the next:

1. **Check auth** with `loops auth status` before any other command or at the start of a session. Sessions expire; assuming one exists wastes the user's time on confusing failures.
2. **Orient**: read the event data below (stage, deadlines, sponsors). Run `loops project get --hackathonSlug codex-community-hackathon-pune` to see where the user's submission stands.
3. **Ideate or research**: brainstorm with the mentor (`hackathon ideate`) and ground sponsor-specific facts with `knowledge query` — never assert what a sponsor's SDK does from memory when you can cite their knowledge graph.
4. **Persist**: save promising directions as artifacts; create or update the submission as the project takes shape.
5. **Evaluate before the deadline**: run `loops evaluate` per targeted sponsor and act on the feedback — that's what the judges will probe.

Command outputs are structured (add `--json` for machine-readable form) and often end with a **suggested next command (CTA)** — prefer following it over guessing. On `NOT_AUTHENTICATED`, run the auth flow; on `credits_exhausted`, stop and tell the user (don't retry).

## Authentication

```sh
loops auth status                        # run FIRST — who am I?
```

If not authenticated, the CLI isn't installed-and-logged-in yet. Install once with `npm install -g loopshouse`, then offer the user these login options:

- **Google**: `loops auth login --provider google` — opens the browser.
- **GitHub**: `loops auth login --provider github` — opens the browser.
- **Email one-time code**: `loops auth login --email <you@example.com>` sends a 6-digit code, then `loops auth verify --email <you@example.com> --code <123456>`.

In headless contexts the browser flows print a URL for a human to open. Re-run `loops auth status` to confirm before continuing.

## Event & sponsor data

Your ground truth for this event, as one TOON document (TOON = compact JSON: `key: value` lines; a uniform array renders as a `name[N]{col1,col2,…}:` header followed by one comma-separated row per element):

```toon
hackathon:
  slug: codex-community-hackathon-pune
  name: Codex Community Hackathon - Pune
  tagline: Welcome to Pune's first OpenAI Codex Community Hackathon.
  theme: themeTwo
  stage: registration_open
  stageMeaning: Registration open — enroll and start ideating
  timezone: Asia/Katmandu
  startsAt: "Jun 14, 2026, 11:00 PM (Asia/Katmandu)"
  submissionDeadline: "Jun 15, 2026, 12:00 AM (Asia/Katmandu)"
  registrationDeadline: "Jun 14, 2026, 10:00 PM (Asia/Katmandu)"
  description: "We are moving past the chat interface. This is about architecting the future of software by shifting the focus from writing code to orchestrating agents. Whether you are building a new autonomous tool or accelerating an existing project, this is where the shipping happens. ​Build something new from scratch or push an existing project further using Codex. Run parallel tasks, experiment with Skills, and use worktrees to operate at a higher level of speed and ambition."
sponsors[1]:
  - slug: codex
    name: Codex
    tier: null
    prizePoolUsd: null
    tagline: null
    website: "https://chatgpt.com/codex/"
    description: "This event is designed for builders, not just developers. If you have never used Codex (or any agentic coding tools), do not worry. We are all exploring this frontier together. You will build alongside Codex Ambassadors and a room full of peers who are just as curious about the future of software as you are. ​​​​Build Directions ​If any of these ideas excite you, we want you in the room: ​Agentic Coding: Build developer tools that maximize leverage from Codex as an AI coding agent. ​UX for Agentic Applications: Design AI-native interfaces and workflows for agent-driven software. ​Multimodal Intelligence: Create applications that reason across multiple modalities. ​Domain Agents: Build vertic…"
    requirements: []
    bounties[3]{name,amountUsd,description}:
      🥇 1st Place,10000,"$10,000 USD in OpenAI API credits"
      🥈 2nd Place,5000,"$5,000 USD in OpenAI API credits"
      🥉 3rd Place,1000,"$1,000 USD in OpenAI API credits"
    judgingCriteria: []
```

Mind `hackathon.stage` and the deadlines: they are snapshots from when the skill was generated and don't update — sanity-check timing before planning multi-day work.

## Credits

**1 credit = one ideator turn OR one knowledge-graph query.** Everything else (project/artifact commands, the evaluator prompt) is free. Spend credits on load-bearing questions, not browsing — and check the balance when planning a research burst:

```sh
loops credits --hackathonSlug codex-community-hackathon-pune
```

## Ideate with the AI mentor

The mentor knows this hackathon's live sponsors, bounties, and judging criteria. Conversations persist locally per hackathon (`~/.loops/sessions/`) and continue automatically — each call just sends one more message, so ask follow-ups freely instead of cramming everything into one prompt.

```sh
loops hackathon ideate --hackathonSlug codex-community-hackathon-pune -m "<your prompt>"
loops hackathon ideate --hackathonSlug codex-community-hackathon-pune -m "<follow-up>"               # same conversation
loops hackathon ideate --hackathonSlug codex-community-hackathon-pune --withProject -m "<prompt>"    # mentor sees the user's project
loops hackathon ideate --hackathonSlug codex-community-hackathon-pune --new -m "<fresh start>"       # discard the session first
loops hackathon session --hackathonSlug codex-community-hackathon-pune            # show the stored conversation (--clear to delete)
```

Use `--withProject` once a project exists — feedback grounded in what's actually built beats generic advice.

## Sponsor knowledge graphs (graph-RAG)

Each sponsor above has a knowledge graph built from their docs, SDKs, and bounty materials. A query returns a **cited evidence block** (entities, relationships, chunks, sources) — read the evidence and compose the answer yourself, citing it. This is how you avoid hallucinating sponsor APIs. 1 credit per query. One ready command per sponsor:

```sh
# Codex
loops knowledge query --hackathonSlug codex-community-hackathon-pune -s codex -q "<your question about Codex>"
```

## Manage the project

A project IS the submission, the user has at most one here, and the platform resolves it from the session — no ids, no listings.

```sh
loops project get --hackathonSlug codex-community-hackathon-pune       # current state (exists=false if none yet)
loops project create --hackathonSlug codex-community-hackathon-pune --name "<name>" --repoUrl <url> --tagline "<one-liner>"
loops project update --hackathonSlug codex-community-hackathon-pune --description "<new description>"
```

**Update is a PATCH**: only the fields you pass change — an update with just `--tagline` cannot wipe the repo URL or bounty picks. Available fields: `--name`, `--tagline`, `--pitch`, `--description`, `--repoUrl`, `--demoUrl`, `--videoUrl`, `--bountyIds <id> --bountyIds <id>`.

## Ideation artifacts (scratchpad)

Persist ideas, problems, and tech-stack notes against this hackathon — they appear in the user's web playground too, so save anything worth keeping rather than letting it die in the conversation. Kinds: `idea`, `problem`, `tech-stack`, `note`.

```sh
loops artifact list --hackathonSlug codex-community-hackathon-pune
loops artifact save --hackathonSlug codex-community-hackathon-pune --name "<title>" --kind idea --body "<markdown body>"
loops artifact update --hackathonSlug codex-community-hackathon-pune --id <artifactId> --body "<updated markdown>"
loops artifact remove --hackathonSlug codex-community-hackathon-pune --id <artifactId>
```

## Evaluate the project against a sponsor

Fetch a self-contained evaluator prompt for one sponsor (free; the user's project record is included automatically), then **execute the prompt yourself inside the project repo** — it assumes the code access you have. It walks that sponsor's judging criteria and bounty requirements and produces alignment feedback: what's genuinely strong, what's missing, where to focus. Run it for every sponsor the project targets, well before the deadline.

```sh
loops evaluate --hackathonSlug codex-community-hackathon-pune -s <sponsorSlug>
```

Take sponsor slugs from the TOON data above. Report the feedback to the user, then reflect agreed improvements via `loops project update`.
