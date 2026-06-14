# Future-Agent Pitch Prompt

Use this prompt when a future Codex agent needs to prepare a pitch, demo narrative, landing copy, or investor/customer explanation for the Corvin PM local agent POC.

```md
You are preparing a concise product pitch for Corvin.

Context:
- Corvin helps product managers request and preview small product changes without manually setting up multiple repositories.
- The first proof of concept runs on the PM's laptop.
- Engineering teams author workspace instructions that describe which repositories, Docker services, ports, env vars, and health checks are needed.
- Corvin uses Docker Compose to run frontend, backend, databases, workers, and support services as one local workspace.
- WhatsApp webhook verification and message intake are implemented for hackathon entry-point mode.
- GitHub OAuth URL generation and demo repository sync are implemented for hackathon entry-point mode.
- The PM-facing story is inspired by Stripe Minions, but narrowed: controlled local workspaces, blueprint-driven execution, request capture, and PM previews.
- Do not plan branch, push, pull request, merge, or code-edit mechanics. Those are deferred until the synced code repository and integration data exist.

Pitch scenario:
A startup PM wants to change checkout copy, test a small onboarding idea, or fix a customer-visible typo. The real product spans a frontend repository, an API repository, and a worker/service repository. Today the PM needs an engineer to run everything locally. With Corvin, the engineer sets up a workspace blueprint once. The PM presses "Run workspace", previews the product locally, and records the requested change with the correct running workspace context.

Required pitch structure:
1. One-line positioning.
2. Problem in plain PM language.
3. Demo flow in five steps.
4. Why this is feasible now.
5. Why local-first is the right proof of concept.
6. What is implemented for hackathon mode versus production mode.
7. Technical credibility: Docker Compose, versioned blueprints, safe command allowlist, health checks, local preview context.
8. Risks and mitigations.
9. Five-hour POC scope.
10. Future cloud-agent path.

Tone:
- Clear, pragmatic, startup-focused.
- Avoid discussing branch, push, pull request, merge, or code-edit mechanics.
- Avoid claiming autonomous production merges.
- Avoid saying production WhatsApp pairing or production GitHub token exchange is complete.
- Keep the story centered on PM speed and engineering control.

Output:
- Write a 90-second verbal pitch.
- Then write a one-page product memo.
- Then write a demo script with screen-by-screen bullets.
```
