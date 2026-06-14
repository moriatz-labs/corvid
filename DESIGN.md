# Corvin PM Local Agent Design MD

## Product Feel

Corvin is a quiet, high-trust SaaS operations tool for product managers and engineering teams. It should feel controlled, technical, and calm. The UI is a workbench, not a marketing page.

Primary impression:

- A PM can understand what is ready, what is running, and what needs engineering attention.
- A PM must be visibly represented as the actor making and approving the change.
- An engineer can see the exact workspace blueprint and command boundaries.
- Dangerous actions are visible, confirmed, and never styled like normal actions.
- All AI-based planning surfaces must name OpenAI as the provider. No other AI providers should appear.

## Visual Language

Use the neutral Corvin palette:

```txt
Background    #fbfbfa
Foreground    #1f1f23
Card          #ffffff
Muted         #f6f6f5
Muted Text    #6f6f76
Border        #e8e8e5
Primary       #2a2a2f
Primary Text  #fbfbfa
```

Use monochrome hierarchy first. Use status colors only for actual states:

- Green: healthy service.
- Amber: waiting, partial setup, needs attention.
- Red: failed run or destructive warning.
- Blue: informational link or preview only when needed.

No decorative gradients, no color-heavy hero art, no oversized marketing hero section, no nested cards.

## Typography

Use:

- Primary/display: Alata or a similar clean sans.
- Body: Lora if available; otherwise system serif for body copy.
- Utility/labels: Roboto or system sans.
- Mono: system monospace for commands, ports, logs, repo paths, commit IDs.

Rules:

- Dashboard headings are compact.
- Do not use hero-scale type inside panels.
- Keep letter spacing normal.
- Long labels must wrap rather than overflow.

## Layout

Desktop-first dashboard with responsive mobile fallback:

- Left sidebar, 240px.
- Top bar, 56px.
- Main content max width around 1280px.
- Two-column operational layout: primary workspace status and secondary run timeline/logs.
- Use full-width page bands or direct layout regions, not card sections inside card sections.

Mobile:

- Sidebar becomes a sheet.
- Primary action remains visible near the top.
- Logs and timelines stack under service status.

## Core Screens

### Workspace Dashboard

Purpose: show whether the PM can run and preview the product stack.

Content:

- Visible PM identity and intent.
- Workspace selector.
- Integration strip:
  - WhatsApp: connected, needs configuration, or failed.
  - GitHub: connected, needs configuration, or failed.
  - Docker: local status.
- Services list with health badges and preview links.
- Primary button: Run workspace.
- Secondary button: Stop.
- Destructive option: Stop and remove volumes, hidden behind confirmation.
- Blueprint timeline.
- Log preview.
- OpenAI-only change planning panel.
- Local, staging, and production app previews.

### Setup Instructions

Purpose: let engineering define how repos work together.

Content:

- Repository list.
- Services and ports.
- Environment variables.
- Health checks.
- Compose preview.
- Validation results.

### Task Request Drawer

Purpose: let a PM describe a small change.

Content:

- Request type segmented control: copy change, bug fix, product idea.
- Request field.
- Affected surface field.
- Expected preview URL.
- Submit button disabled when workspace is not healthy.

## Component Guidance

Use shadcn/ui as the component floor:

- Button.
- Card for repeated workspace/service items only.
- Tabs.
- Table.
- Badge.
- Alert.
- AlertDialog.
- Sheet.
- Tooltip.
- Progress.
- ScrollArea.
- Separator.

Use Lucide icons for universal actions:

- Play for run.
- Square for stop.
- RefreshCw for retry.
- Settings for configuration.
- MessageCircle for WhatsApp entry point.
- Github for GitHub/repository sync if brand icon package is available; otherwise use FolderGit2 or Database.
- ExternalLink for previews.
- ShieldCheck for safe command policy.

Every icon-only button must have a tooltip and screen-reader text.

## Safe Controls

Buttons must communicate safety:

- Primary actions are explicit and idempotent.
- Disabled actions explain why through tooltip or adjacent status.
- Loading buttons cannot be double-submitted.
- Destructive actions use `AlertDialog`.
- Commands are never built from raw PM text.
- Show command categories, not full secret-bearing commands.

## Motion

Use motion sparingly:

- Service status changes can fade and slide.
- Blueprint steps can animate progress from pending to running to complete.
- Drawers and dialogs can use standard shadcn/Radix transitions.
- Logs should not animate line-by-line in a distracting way.

## Stitch Generation Instructions

Generate a desktop SaaS dashboard for "Corvin PM Local Agent".

The first screen should show:

- Sidebar navigation.
- Top workspace header.
- Integration status strip.
- Service health grid.
- Blueprint timeline.
- Run logs.
- PM task request drawer entry point.

Show WhatsApp and GitHub/repository sync as active hackathon entry-point controls.

Show OpenAI as the only AI provider. Show local, staging, and production previews so the PM can visibly review a change and push it to the production app demo.

Keep the design monochrome, precise, and production-grade. Avoid a landing page.
