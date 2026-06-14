# Corvin Public Home Flow

## Goal

The main Corvin screen is a public application setup console. It should not show demo job evidence, review panels, or seeded Acme repositories. Those hardcoded values belong only in Demo mode.

The public path is:

1. Configure settings.
2. Connect WhatsApp and GitHub.
3. Select repositories when GitHub repository context is available.
4. Save and validate the generated `exec.md` packet.
5. Capture a new request.

## Screen Map

### Home Shell

- Sidebar links: `Configure settings`, `New request`, and `Demo mode`.
- Header shows workspace readiness and API connectivity.
- No public `Start job`, `Review`, completed-job evidence, raw logs, deployment controls, or demo repository data.

### Configure Settings

- Connector cards show WhatsApp, GitHub, and local runner state.
- Connected connectors remove their setup button and show ready copy.
- WhatsApp ready copy states that Corvin listens to incoming text messages on the linked account, including direct chats and groups.
- GitHub is the gate for repository selection.

### Repository Selection

- Lives inside the connector section, not as a separate flat markdown editor.
- If GitHub is disconnected, show an empty state asking the user to connect GitHub.
- If GitHub is connected but no repository metadata is available, show an empty repository state.
- If repositories are available, show selectable repository cards and generate `exec.md` behind the scenes.
- The public UI does not expose a raw `exec.md` textarea.

### New Request

- Shows a focused request form only after setup is ready.
- If setup is incomplete, show a setup gate that links back to Configure settings.
- The public app does not show job execution or review sections.

### Demo Mode

- Available from the main sidebar at `/demo`.
- Uses hardcoded Acme repositories, commands, screenshots, and completed-job evidence for presentation.
- Demo values must not leak into the public home setup flow.

## Flow Rules

- Public state starts empty: no Acme workspace, no seeded request, no completed job.
- `exec.md` is generated from selected repositories, then saved and validated through the API.
- Demo mode remains the only place where hardcoded repository values are visible.
- Styling uses Corvin neutral tokens, compact dashboard typography, and restrained status colors.
