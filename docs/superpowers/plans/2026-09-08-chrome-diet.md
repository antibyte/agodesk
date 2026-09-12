# Chrome-Diät Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked chat banners with one approval rail (Remote / Shell / Pairing) and route Update, warnings, speech errors, plan, and activity into the existing bell inbox.

**Architecture:** Pure helpers in `chrome-placement.ts` decide rail kind and inbox items. `ApprovalRail` mounts outside the settings/chat swap and renders exactly one existing banner. `SystemWarningsPanel` becomes the inbox. Speech partials move to `InputBox`. TLS stays `CertificateTrustModal` and forces a empty rail.

**Tech Stack:** Svelte 5, TypeScript, existing stores, `node:test` via `tsx`, i18n JSON keyed off `de.json`

**Spec:** `docs/superpowers/specs/2026-09-08-chrome-diet-design.md`

## Global Constraints

- Do not change Settings-IA, theme chrome, onboarding steps, Vault/OAuth/Embed modals, or ArtifactInspector.
- No new persist store for inbox items. Derive from existing stores.
- Reuse i18n keys where they already exist. New keys only: `inbox.title`, `inputBox.partialTranscript.ariaLabel` (all 16 locales, or `src/lib/i18n/i18n.test.ts` fails).
- Never commit unless the user explicitly asks (project git rule overrides “frequent commits” below — treat commit steps as “ask user to commit”).
- Never run destructive git commands (`checkout --`, `reset --hard`, `clean -fd`).
- Verify with `npm run check` and targeted `node --import tsx --test <file>` before claiming a task done.
- Windows PowerShell: no `&&` chaining; use `;` or separate commands.
- Do not overwrite unrelated dirty files (`shell-access.ts`, `.superpowers/sdd/*`, deleted `.kiro` specs).

## File map

| File | Role |
| --- | --- |
| `src/lib/services/chrome-placement.ts` | `selectApproval`, `isPairingNeeded`, `deriveInboxItems`, `countInboxBadge` |
| `src/lib/services/chrome-placement.test.ts` | Priority, badge, TLS-empty, wiring greps |
| `src/lib/components/ApprovalRail.svelte` | Renders exactly one of Remote / Shell / Pairing |
| `src/lib/components/ChatView.svelte` | Mount rail; remove stacked Speech/Update/Plan/Activity banners; status + pair focus |
| `src/lib/components/StatusBar.svelte` | Status pill: reconnect or pairing focus, never Settings |
| `src/lib/components/SystemWarningsPanel.svelte` | Inbox: warnings + UpdateBanner + speech + embedded plan/activity |
| `src/lib/components/ChatPlanFloatingPanel.svelte` | `embedded` layout (static, not absolute) |
| `src/lib/components/ActivityTimelinePanel.svelte` | `embedded` layout |
| `src/lib/components/RemoteControlBanner.svelte` | Drop dialog / modal / focusTrap |
| `src/lib/components/ShellApprovalBanner.svelte` | Drop dialog / modal / focusTrap |
| `src/lib/components/UpdateBanner.svelte` | Drop dialog / modal / focusTrap; reused inside inbox |
| `src/lib/components/InputBox.svelte` | Partial-transcript line |
| `src/lib/stores/speech.ts` | `clearInboxErrors()` |
| `src/lib/i18n/messages/*.json` | `inbox.title`, `inputBox.partialTranscript.ariaLabel` |
| `docs/superpowers/specs/2026-09-08-chrome-diet-design.md` | Mark approved after last task |

`SpeechBanner.svelte` stays on disk, unused.

---

### Task 1: `selectApproval` + `isPairingNeeded`

**Files:**
- Create: `src/lib/services/chrome-placement.ts`
- Test: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: `SessionStatus` from `src/lib/types/protocol.ts`
- Produces:
  - `export type ApprovalKind = "remote" | "shell" | "pairing"`
  - `export interface ApprovalInput { certModalOpen: boolean; desktopControlEnabled: boolean; remoteControlPending: boolean; remoteControlActive: boolean; shellPending: boolean; hasShellRequest: boolean; sessionStatus: SessionStatus }`
  - `export function isPairingNeeded(sessionStatus: SessionStatus): boolean`
  - `export function selectApproval(input: ApprovalInput): ApprovalKind | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/chrome-placement.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isPairingNeeded, selectApproval, type ApprovalInput } from "./chrome-placement.ts";

const idle: ApprovalInput = {
  certModalOpen: false,
  desktopControlEnabled: true,
  remoteControlPending: false,
  remoteControlActive: false,
  shellPending: false,
  hasShellRequest: false,
  sessionStatus: "accepted",
};

test("isPairingNeeded nur awaiting_pairing und error", () => {
  assert.equal(isPairingNeeded("awaiting_pairing"), true);
  assert.equal(isPairingNeeded("error"), true);
  assert.equal(isPairingNeeded("pairing"), false);
  assert.equal(isPairingNeeded("accepted"), false);
  assert.equal(isPairingNeeded("idle"), false);
  assert.equal(isPairingNeeded("loopback"), false);
});

test("selectApproval leer wenn nichts ansteht", () => {
  assert.equal(selectApproval(idle), null);
});

test("selectApproval TLS-Modal erzwingt null", () => {
  assert.equal(
    selectApproval({
      ...idle,
      certModalOpen: true,
      remoteControlPending: true,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    null,
  );
});

test("selectApproval Remote schlaegt Shell und Pairing", () => {
  assert.equal(
    selectApproval({
      ...idle,
      remoteControlPending: true,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    "remote",
  );
  assert.equal(selectApproval({ ...idle, remoteControlActive: true }), "remote");
});

test("selectApproval Remote braucht Desktop-Control", () => {
  assert.equal(
    selectApproval({ ...idle, desktopControlEnabled: false, remoteControlPending: true }),
    null,
  );
});

test("selectApproval Shell schlaegt Pairing", () => {
  assert.equal(
    selectApproval({
      ...idle,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    "shell",
  );
});

test("selectApproval Shell ohne Request ist leer", () => {
  assert.equal(selectApproval({ ...idle, shellPending: true, hasShellRequest: false }), null);
});

test("selectApproval Pairing bei awaiting_pairing und error", () => {
  assert.equal(selectApproval({ ...idle, sessionStatus: "awaiting_pairing" }), "pairing");
  assert.equal(selectApproval({ ...idle, sessionStatus: "error" }), "pairing");
  assert.equal(selectApproval({ ...idle, sessionStatus: "pairing" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./chrome-placement.ts`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/services/chrome-placement.ts`:

```ts
import type { SessionStatus } from "../types/protocol";

export type ApprovalKind = "remote" | "shell" | "pairing";

export interface ApprovalInput {
  certModalOpen: boolean;
  desktopControlEnabled: boolean;
  remoteControlPending: boolean;
  remoteControlActive: boolean;
  shellPending: boolean;
  hasShellRequest: boolean;
  sessionStatus: SessionStatus;
}

export function isPairingNeeded(sessionStatus: SessionStatus): boolean {
  return sessionStatus === "awaiting_pairing" || sessionStatus === "error";
}

export function selectApproval(input: ApprovalInput): ApprovalKind | null {
  if (input.certModalOpen) {
    return null;
  }
  if (
    input.desktopControlEnabled &&
    (input.remoteControlPending || input.remoteControlActive)
  ) {
    return "remote";
  }
  if (input.shellPending && input.hasShellRequest) {
    return "shell";
  }
  if (isPairingNeeded(input.sessionStatus)) {
    return "pairing";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: PASS, all 8 tests

- [ ] **Step 5: Commit**

Ask the user before committing. If they say yes:

```bash
git add src/lib/services/chrome-placement.ts src/lib/services/chrome-placement.test.ts
git commit -m "feat: add approval-rail placement helper"
```

---

### Task 2: `deriveInboxItems` + `countInboxBadge`

**Files:**
- Modify: `src/lib/services/chrome-placement.ts`
- Modify: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: `SystemWarning`, `AgoDeskPlan`, `AgentActivityPayload` from `src/lib/types/protocol.ts`; `UpdateStatus` / `UpdateState` from `src/lib/services/update-flow.ts`; `isUpdateBannerVisible` from `src/lib/services/update-flow.ts`; `isChatPlanPanelVisible` from `src/lib/stores/chat-plan.ts`; `isActivityTimelineVisible` from `src/lib/stores/activity-timeline.ts`
- Produces:
  - `export type InboxItemKind = "warning" | "update" | "speech" | "plan" | "activity"`
  - `export interface InboxItem { id: string; kind: InboxItemKind; unread: boolean }`
  - `export interface InboxInput { warnings: SystemWarning[]; update: Pick<UpdateState, "status" | "dismissed">; speechErrorMessage: string; vadError: string; plan: AgoDeskPlan | null; activities: AgentActivityPayload[]; activityDismissed: boolean }`
  - `export function deriveInboxItems(input: InboxInput): InboxItem[]`
  - `export function countInboxBadge(items: InboxItem[]): number`
  - Stable ids: warning → `warning.id`; update → `"update"`; speech → `"speech-error"`; plan → `"plan"`; activity → `"activity"`
  - Order: warnings (store order), then update, speech, plan, activity

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/services/chrome-placement.test.ts`:

```ts
import { countInboxBadge, deriveInboxItems, type InboxInput } from "./chrome-placement.ts";
import type { AgentActivityPayload, AgoDeskPlan, SystemWarning } from "../types/protocol.ts";

const warning = (id: string, acknowledged: boolean): SystemWarning => ({
  id,
  severity: "warning",
  title: id,
  acknowledged,
});

const activity = (phase: AgentActivityPayload["phase"]): AgentActivityPayload => ({
  activity_id: "a1",
  session_id: "s",
  conversation_id: "c",
  kind: "agent",
  phase,
  title: "work",
});

const emptyInbox: InboxInput = {
  warnings: [],
  update: { status: "idle", dismissed: false },
  speechErrorMessage: "",
  vadError: "",
  plan: null,
  activities: [],
  activityDismissed: false,
};

test("deriveInboxItems zaehlt ungelesene Warning Update Speech, nicht Plan", () => {
  const plan: AgoDeskPlan = { status: "in_progress", title: "Build" };
  const items = deriveInboxItems({
    ...emptyInbox,
    warnings: [warning("w1", false), warning("w2", true)],
    update: { status: "available", dismissed: false },
    speechErrorMessage: "mic",
    plan,
    activities: [activity("started")],
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.kind, item.unread]),
    [
      ["w1", "warning", true],
      ["w2", "warning", false],
      ["update", "update", true],
      ["speech-error", "speech", true],
      ["plan", "plan", false],
      ["activity", "activity", false],
    ],
  );
  assert.equal(countInboxBadge(items), 3);
});

test("deriveInboxItems Update dismissed oder idle erzeugt kein Item", () => {
  assert.equal(
    deriveInboxItems({ ...emptyInbox, update: { status: "available", dismissed: true } }).length,
    0,
  );
  assert.equal(deriveInboxItems({ ...emptyInbox, update: { status: "idle", dismissed: false } }).length, 0);
});

test("deriveInboxItems Speech aus errorMessage oder vadError", () => {
  assert.equal(deriveInboxItems({ ...emptyInbox, vadError: "vad" })[0]?.id, "speech-error");
  assert.equal(deriveInboxItems(emptyInbox).some((item) => item.kind === "speech"), false);
});

test("deriveInboxItems Plan completed und Activity dismissed weglassen", () => {
  const items = deriveInboxItems({
    ...emptyInbox,
    plan: { status: "completed" },
    activities: [activity("started")],
    activityDismissed: true,
  });
  assert.equal(items.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL (`deriveInboxItems` is not exported)

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/services/chrome-placement.ts`:

```ts
import type { AgentActivityPayload, AgoDeskPlan, SystemWarning } from "../types/protocol";
import { isUpdateBannerVisible, type UpdateState } from "./update-flow";
import { isChatPlanPanelVisible } from "../stores/chat-plan";
import { isActivityTimelineVisible } from "../stores/activity-timeline";

export type InboxItemKind = "warning" | "update" | "speech" | "plan" | "activity";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  unread: boolean;
}

export interface InboxInput {
  warnings: SystemWarning[];
  update: Pick<UpdateState, "status" | "dismissed">;
  speechErrorMessage: string;
  vadError: string;
  plan: AgoDeskPlan | null;
  activities: AgentActivityPayload[];
  activityDismissed: boolean;
}

export function deriveInboxItems(input: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  for (const warning of input.warnings) {
    items.push({ id: warning.id, kind: "warning", unread: !warning.acknowledged });
  }
  if (isUpdateBannerVisible({ ...input.update, dismissed: input.update.dismissed })) {
    items.push({ id: "update", kind: "update", unread: true });
  }
  if (input.speechErrorMessage.trim() || input.vadError.trim()) {
    items.push({ id: "speech-error", kind: "speech", unread: true });
  }
  if (isChatPlanPanelVisible(input.plan)) {
    items.push({ id: "plan", kind: "plan", unread: false });
  }
  if (isActivityTimelineVisible(input.activities, input.activityDismissed)) {
    items.push({ id: "activity", kind: "activity", unread: false });
  }
  return items;
}

export function countInboxBadge(items: InboxItem[]): number {
  return items.filter((item) => item.unread).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: PASS including the four new tests

- [ ] **Step 5: Commit**

Ask the user before committing.

```bash
git add src/lib/services/chrome-placement.ts src/lib/services/chrome-placement.test.ts
git commit -m "feat: derive inbox items and badge count"
```

---

### Task 3: Approval banners are not modal dialogs

**Files:**
- Modify: `src/lib/components/RemoteControlBanner.svelte` (script import + root attributes)
- Modify: `src/lib/components/ShellApprovalBanner.svelte`
- Modify: `src/lib/components/UpdateBanner.svelte`
- Modify: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: none from Task 1/2
- Produces: the three banners stay the same callback props; they are `region`/`status` surfaces, not `dialog`

- [ ] **Step 1: Write the failing markup test**

Append to `src/lib/services/chrome-placement.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("Remote Shell Update Banner sind keine modalen Dialoge", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of [
    "RemoteControlBanner.svelte",
    "ShellApprovalBanner.svelte",
    "UpdateBanner.svelte",
  ]) {
    const src = readFileSync(path.join(dir, "..", "components", name), "utf8");
    assert.equal(src.includes('aria-modal="true"'), false, name);
    assert.equal(src.includes("use:focusTrap"), false, name);
    assert.equal(src.includes('role="dialog"'), false, name);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL on `aria-modal="true"` for at least `RemoteControlBanner.svelte`

- [ ] **Step 3: Strip dialog chrome**

In all three files:

1. Remove `import { focusTrap } from "../actions/focusTrap";`
2. Remove `use:focusTrap`
3. Replace `role="dialog"` and `aria-modal="true"` with `role="region"` (keep existing `aria-labelledby` / `aria-live`)

`UpdateBanner` keeps `aria-live="polite"`. Remote and Shell keep `aria-live="assertive"`.

Do not change buttons or copy.

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts src/lib/services/update-flow.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

Ask the user before committing.

```bash
git add src/lib/components/RemoteControlBanner.svelte src/lib/components/ShellApprovalBanner.svelte src/lib/components/UpdateBanner.svelte src/lib/services/chrome-placement.test.ts
git commit -m "fix: stop treating approval banners as modal dialogs"
```

---

### Task 4: `ApprovalRail` + unstack `ChatView`

**Files:**
- Create: `src/lib/components/ApprovalRail.svelte`
- Modify: `src/lib/components/ChatView.svelte`
- Modify: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: `selectApproval` / `ApprovalKind` from Task 1; existing banner props already in `ChatView`
- Produces: `ApprovalRail` props:
  - `kind: ApprovalKind | null`
  - `compact?: boolean` (true when `settingsOpen`)
  - same Remote / Shell / Pairing callbacks and fields `ChatView` already passes today

- [ ] **Step 1: Write the failing wiring test**

Append to `src/lib/services/chrome-placement.test.ts`:

```ts
test("ChatView haengt ApprovalRail ein und keine Stapel-Banner", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "ChatView.svelte"), "utf8");
  assert.equal(src.includes("<ApprovalRail"), true);
  assert.equal(src.includes("<SpeechBanner"), false);
  assert.equal(src.includes("<UpdateBanner"), false);
  assert.equal(src.includes("<ChatPlanFloatingPanel"), false);
  assert.equal(src.includes("<ActivityTimelinePanel"), false);
  assert.equal(src.includes("bannerStackCompact"), false);
  assert.equal(src.includes("info-banner"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL (`<ApprovalRail` missing)

- [ ] **Step 3: Add `ApprovalRail.svelte`**

```svelte
<script lang="ts">
  import PairingBanner from "./PairingBanner.svelte";
  import RemoteControlBanner from "./RemoteControlBanner.svelte";
  import ShellApprovalBanner from "./ShellApprovalBanner.svelte";
  import type { ApprovalKind } from "../services/chrome-placement";

  interface Props {
    kind?: ApprovalKind | null;
    compact?: boolean;
    remotePending?: boolean;
    remoteActive?: boolean;
    remoteOperation?: string;
    onApproveRemote?: () => void;
    onDenyRemote?: () => void;
    onStopRemote?: () => void;
    shellCommand?: string;
    shellCwdLabel?: string;
    shellCwdDisplay?: string;
    shellTimeoutMs?: number;
    onApproveShell?: () => void;
    onDenyShell?: () => void;
    onStopShellSession?: () => void;
    pairingBusy?: boolean;
    pairingServerUrl?: string;
    pairingErrorMessage?: string;
    pairingFocusRequest?: number;
    onPair?: (token: string) => void;
    onUnpair?: () => void;
  }

  let {
    kind = null,
    compact = false,
    remotePending = false,
    remoteActive = false,
    remoteOperation = "",
    onApproveRemote,
    onDenyRemote,
    onStopRemote,
    shellCommand = "",
    shellCwdLabel = "",
    shellCwdDisplay = "",
    shellTimeoutMs = 0,
    onApproveShell,
    onDenyShell,
    onStopShellSession,
    pairingBusy = false,
    pairingServerUrl = "",
    pairingErrorMessage = "",
    pairingFocusRequest = 0,
    onPair,
    onUnpair,
  }: Props = $props();
</script>

{#if kind}
  <div class="approval-rail" role="region" aria-live="assertive">
    {#if kind === "remote"}
      <RemoteControlBanner
        visible
        pending={remotePending}
        active={remoteActive}
        operation={remoteOperation}
        onApprove={onApproveRemote}
        onDeny={onDenyRemote}
        onStop={onStopRemote}
      />
    {:else if kind === "shell"}
      <ShellApprovalBanner
        visible
        command={shellCommand}
        cwdLabel={shellCwdLabel}
        cwdDisplay={shellCwdDisplay}
        timeoutMs={shellTimeoutMs}
        onApprove={onApproveShell}
        onDeny={onDenyShell}
        onStopSession={onStopShellSession}
      />
    {:else}
      <PairingBanner
        visible
        busy={pairingBusy}
        {compact}
        focusRequest={pairingFocusRequest}
        serverUrl={pairingServerUrl}
        errorMessage={pairingErrorMessage}
        {onPair}
        {onUnpair}
      />
    {/if}
  </div>
{/if}

<style>
  .approval-rail {
    flex-shrink: 0;
    z-index: var(--z-banner);
  }

  .approval-rail :global(.banner-glass) {
    margin-bottom: 0;
  }
</style>
```

- [ ] **Step 4: Rewire `ChatView.svelte`**

1. Add imports:

```ts
import ApprovalRail from "./ApprovalRail.svelte";
import { countInboxBadge, deriveInboxItems, selectApproval } from "../services/chrome-placement";
```

2. Remove imports of `SpeechBanner`, `UpdateBanner`, `ChatPlanFloatingPanel`, `ActivityTimelinePanel` (keep `isChatPlanPanelVisible` / activity helpers **out** of ChatView if unused after this task; inbox uses them in Task 6).

3. Delete `bannerStackCompact`.

4. Replace `remoteBannerVisible` / `shellBannerVisible` / `updateBannerVisible` usage for mounting with:

```ts
const approvalKind = $derived(
  selectApproval({
    certModalOpen,
    desktopControlEnabled: $settings.desktopControlEnabled,
    remoteControlPending: $sessionState.remoteControlPending,
    remoteControlActive: $sessionState.remoteControlActive,
    shellPending: $shellApprovalState.pending,
    hasShellRequest: $shellApprovalState.request !== null,
    sessionStatus: $sessionState.status,
  }),
);
```

5. In the markup, **outside** `{#if settingsOpen}`, replace the three sibling banners (`RemoteControlBanner`, `ShellApprovalBanner`, `UpdateBanner`) with one `ApprovalRail`. Keep `OnboardingFlow` and TLS modal where they are.

```svelte
  <ApprovalRail
    kind={approvalKind}
    compact={settingsOpen}
    remotePending={$sessionState.remoteControlPending}
    remoteActive={$sessionState.remoteControlActive}
    remoteOperation={remoteOperation}
    onApproveRemote={() => void handleApproveRemote()}
    onDenyRemote={() => void handleDenyRemote()}
    onStopRemote={() => void handleStopRemote()}
    shellCommand={$shellApprovalState.request?.command ?? ""}
    shellCwdLabel={$shellApprovalState.request?.cwdLabel ?? ""}
    shellCwdDisplay={$shellApprovalState.request?.cwdDisplay ?? ""}
    shellTimeoutMs={$shellApprovalState.request?.timeoutMs ?? 0}
    onApproveShell={() => void handleApproveShell()}
    onDenyShell={() => void handleDenyShell()}
    onStopShellSession={() => void handleStopSessionFromShell()}
    pairingBusy={pairingBusy}
    pairingServerUrl={$settings.serverUrl}
    pairingErrorMessage={$sessionState.errorMessage}
    pairingFocusRequest={pairingFocusRequest}
    onPair={(token) => void handlePair(token)}
    onUnpair={() => void handleUnpair()}
  />
```

6. Inside the chat branch, delete:
   - `<PairingBanner …>`
   - the `{#if $sessionState.status === "pairing"}` info-banner
   - `<SpeechBanner …>`
   - `<ChatPlanFloatingPanel …>`
   - `<ActivityTimelinePanel …>`

7. Leave `ChatHistoryPanel`, `IntegrationsPanel`, `SystemWarningsPanel`, `ArtifactInspectorPanel` in the header area.

8. Keep `handleInstallUpdate` / `dismissUpdate` in `ChatView`; Task 6 passes them into the inbox. You may leave unused-handler lint until Task 6 — or pass them already as new props on `SystemWarningsPanel` with empty extra UI. Prefer leaving the functions and wiring them in Task 6.

- [ ] **Step 5: Run tests + check**

Run:

```
node --import tsx --test src/lib/services/chrome-placement.test.ts
npm run check
```

Expected: placement tests PASS. `svelte-check` must not error on unused `SpeechBanner` imports (they must be gone). Temporary unused `handleInstallUpdate` is OK if still referenced; if `npm run check` flags unused vars, prefix with a void comment only as last resort — better wire a noop inbox prop in Task 6 immediately after if check fails.

- [ ] **Step 6: Commit**

Ask the user before committing.

```bash
git add src/lib/components/ApprovalRail.svelte src/lib/components/ChatView.svelte src/lib/services/chrome-placement.test.ts
git commit -m "feat: mount a single approval rail instead of stacked banners"
```

---

### Task 5: Status pill and empty-state pairing focus

**Files:**
- Modify: `src/lib/components/StatusBar.svelte`
- Modify: `src/lib/components/ChatView.svelte`
- Modify: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: `isPairingNeeded` from Task 1
- Produces: `StatusBar` new optional prop `onFocusPairing?: () => void`. Status pill never calls `onOpenSettings`.

- [ ] **Step 1: Write the failing wiring tests**

Append to `src/lib/services/chrome-placement.test.ts`:

```ts
test("StatusBar-Pille oeffnet keine Settings", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "StatusBar.svelte"), "utf8");
  const pillBlock = src.slice(src.indexOf("class=\"status-pill\""), src.indexOf("onToggleHistory"));
  assert.equal(pillBlock.includes("onOpenSettings"), false);
  assert.equal(src.includes("onFocusPairing"), true);
});

test("ChatView Empty-State Pairing oeffnet keine Device-Settings", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "ChatView.svelte"), "utf8");
  assert.equal(src.includes('openSettings("device")'), false);
  assert.equal(src.includes("onFocusPairing"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL (`onFocusPairing` missing)

- [ ] **Step 3: Change `StatusBar.svelte`**

Add to `Props` / destructure:

```ts
    onFocusPairing?: () => void;
```

```ts
    onFocusPairing,
```

Replace the status-pill `onclick` and aria strings:

```svelte
    <button
      class="status-pill"
      type="button"
      title={connectionStatus === "disconnected" || connectionStatus === "error"
        ? $i18n("statusBar.reconnect")
        : sessionStatus === "awaiting_pairing" || sessionStatus === "error"
          ? $i18n("pairing.title")
          : $i18n(`connection.status.${connectionStatus}`)}
      aria-label={connectionStatus === "disconnected" || connectionStatus === "error"
        ? $i18n("statusBar.reconnect")
        : sessionStatus === "awaiting_pairing" || sessionStatus === "error"
          ? $i18n("pairing.title")
          : $i18n(`connection.status.${connectionStatus}`)}
      onclick={() => {
        if (connectionStatus === "disconnected" || connectionStatus === "error") {
          handleReconnect();
          return;
        }
        if (sessionStatus === "awaiting_pairing" || sessionStatus === "error") {
          onFocusPairing?.();
        }
      }}
    >
```

Leave the gear button on `onOpenSettings`.

- [ ] **Step 4: Change `ChatView.svelte`**

Replace `handlePairDevice`:

```ts
  function handlePairDevice(): void {
    pairingFocusRequest += 1;
  }
```

On `<StatusBar>` add:

```svelte
          onFocusPairing={handlePairDevice}
```

- [ ] **Step 5: Run tests**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

Ask the user before committing.

```bash
git add src/lib/components/StatusBar.svelte src/lib/components/ChatView.svelte src/lib/services/chrome-placement.test.ts
git commit -m "fix: status pill reconnects or focuses pairing, not settings"
```

---

### Task 6: Inbox panel + i18n + speech clear + embedded plan/activity

**Files:**
- Modify: `src/lib/i18n/messages/de.json` and the other 15 locale files
- Modify: `src/lib/stores/speech.ts`
- Modify: `src/lib/components/ChatPlanFloatingPanel.svelte`
- Modify: `src/lib/components/ActivityTimelinePanel.svelte`
- Modify: `src/lib/components/SystemWarningsPanel.svelte`
- Modify: `src/lib/components/ChatView.svelte`

**Interfaces:**
- Consumes: `deriveInboxItems`, `countInboxBadge`, `InboxItem` from Task 2
- Produces:
  - `speechState.clearInboxErrors(): void` — sets `errorMessage` and `vadError` to `""`, does not change `status`
  - `ChatPlanFloatingPanel` / `ActivityTimelinePanel` new prop `embedded?: boolean` (default `false`). When true: `position: static`, `width: 100%`, `max-width: none`, `top/right` unset, hide dismiss-from-header if it would close a floating layer; keep expand/collapse and shell stop
  - `SystemWarningsPanel` additional props:
    - `items: InboxItem[]` (or derive internally if ChatView passes the raw stores — **pass raw fields**, derive inside ChatView, pass `items` plus the payloads needed to render)
    - `updateVisible`, `updateVersion`, `updateNotes`, `updateStatus`, `updateProgress`, `onInstallUpdate`, `onDismissUpdate`
    - `speechError: string`, `onDismissSpeechError`
    - `plan`, `planRequestId`, `planVisible`
    - `activities`, `activityVisible`, `onStopShell`, `onDismissActivity`
  - Badge: `StatusBar` `warningsUnacknowledged={inboxBadge}` where `inboxBadge = countInboxBadge(inboxItems)`
  - Panel title uses `$i18n("inbox.title")`

**i18n values** (add the same two keys to every file in `src/lib/i18n/messages/`):

| Key | de | en | fr | es | zh | ja | nl | pt | pl | cs | it | sv | no | da | el | hi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `inbox.title` | Hinweise | Inbox | Notifications | Avisos | 通知 | 通知 | Meldingen | Avisos | Powiadomienia | Oznámení | Avvisi | Aviseringar | Varsler | Underretninger | Ειδοποιήσεις | सूचनाएं |
| `inputBox.partialTranscript.ariaLabel` | Live-Transkription | Live transcript | Transcription en direct | Transcripción en vivo | 实时转写 | リアルタイム文字起こし | Live-transcriptie | Transcrição ao vivo | Transkrypcja na żywo | Živý přepis | Trascrizione live | Live-transkription | Live-transkripsjon | Live-transskription | Ζωντανή μεταγραφή | लाइव ट्रांसक्रिप्ट |

Keep keys alphabetically sorted in each JSON file (`inbox.title` after `hotkey` / before `inputBox.*` as the file’s current A–Z order dictates; `de.json` is A–Z so `inbox.title` goes between `i18n`/`hotkey` cluster and `inputBox.*`).

- [ ] **Step 1: Write failing i18n + speech tests**

In `src/lib/i18n/i18n.test.ts` no new test is required if keys exist in `de.json` — the existing parity test covers others.

Add to `src/lib/services/chrome-placement.test.ts` (or a tiny `speech` store test). Prefer appending a speech-store test in a new `src/lib/stores/speech-inbox.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { speechState } from "./speech.ts";

test("clearInboxErrors leert Fehler ohne Status zu setzen", () => {
  speechState.reset();
  speechState.setError("mic");
  speechState.setVadError("vad");
  const before = get(speechState).status;
  speechState.clearInboxErrors();
  const next = get(speechState);
  assert.equal(next.errorMessage, "");
  assert.equal(next.vadError, "");
  assert.equal(next.status, before);
  speechState.reset();
});
```

- [ ] **Step 2: Run speech test to verify it fails**

Run: `node --import tsx --test src/lib/stores/speech-inbox.test.ts`

Expected: FAIL (`clearInboxErrors` missing)

- [ ] **Step 3: Implement `clearInboxErrors`**

In `src/lib/stores/speech.ts` add:

```ts
    clearInboxErrors(): void {
      update((state) => ({ ...state, errorMessage: "", vadError: "" }));
    },
```

- [ ] **Step 4: Add `embedded` to plan and activity panels**

`ChatPlanFloatingPanel.svelte` and `ActivityTimelinePanel.svelte`:

```ts
    embedded?: boolean;
```

```ts
    embedded = false,
```

On the root element add `class:is-embedded={embedded}`.

CSS in both:

```css
  .plan-panel.is-embedded,
  .activity-panel.is-embedded {
    position: static;
    top: auto;
    right: auto;
    width: 100%;
    max-width: none;
    z-index: auto;
    margin: 0;
  }
```

When `embedded` is true, hide the floating dismiss control that calls `onDismiss` on the whole layer **or** keep it and let ChatView map dismiss to `activityTimelineState.dismiss()` / `planDismissed = true` (same as today). Keep expand/collapse.

- [ ] **Step 5: Expand `SystemWarningsPanel.svelte`**

Import `UpdateBanner`, `ChatPlanFloatingPanel`, `ActivityTimelinePanel`, `ChatMessageBody` stays. Add props listed above.

Render order inside the panel:

1. Existing warning list (unchanged acknowledge UI)
2. If an inbox item `kind === "update"`: `<UpdateBanner visible version notes status progress onInstall onDismiss />` — strip extra outer `banner-glass` margin via local CSS `:global(.update-banner) { margin: 0; }`
3. If `kind === "speech"`: a list row with the error text (`speechError`) and a button `$i18n("common.close")` → `onDismissSpeechError`
4. If `kind === "plan"`: `<ChatPlanFloatingPanel visible embedded plan requestId onDismiss />`
5. If `kind === "activity"`: `<ActivityTimelinePanel visible embedded activities onDismiss onStopShell />`

Empty state: show `$i18n("warnings.empty")` only when `items.length === 0`.

Title: `$i18n("inbox.title")`. Keep acknowledge-all for warnings only.

- [ ] **Step 6: Wire `ChatView.svelte`**

```ts
  const inboxItems = $derived(
    deriveInboxItems({
      warnings: $chatMediaState.systemWarnings,
      update: { status: $updateState.status, dismissed: $updateState.dismissed },
      speechErrorMessage: $speechState.errorMessage,
      vadError: $speechState.vadError,
      plan: $chatPlanState.plan,
      activities: $activityTimelineState.activities,
      activityDismissed: $activityTimelineState.dismissed,
    }),
  );
  const inboxBadge = $derived(countInboxBadge(inboxItems));
```

Pass `warningsUnacknowledged={inboxBadge}` to `StatusBar`.

Pass new props into `SystemWarningsPanel`. Speech dismiss:

```ts
onDismissSpeechError={() => speechState.clearInboxErrors()}
```

Keep `handleToggleWarnings` mutex with history/integrations.

- [ ] **Step 7: Add i18n keys to all 16 locale files, then run tests**

Run:

```
node --import tsx --test src/lib/stores/speech-inbox.test.ts src/lib/i18n/i18n.test.ts src/lib/services/chrome-placement.test.ts
npm run check
```

Expected: PASS, 0 `svelte-check` errors

- [ ] **Step 8: Commit**

Ask the user before committing.

```bash
git add src/lib/i18n/messages src/lib/stores/speech.ts src/lib/stores/speech-inbox.test.ts src/lib/components/ChatPlanFloatingPanel.svelte src/lib/components/ActivityTimelinePanel.svelte src/lib/components/SystemWarningsPanel.svelte src/lib/components/ChatView.svelte
git commit -m "feat: route notices into the bell inbox"
```

---

### Task 7: Composer live transcript

**Files:**
- Modify: `src/lib/components/InputBox.svelte`
- Modify: `src/lib/components/ChatView.svelte`
- Modify: `src/lib/services/chrome-placement.test.ts`

**Interfaces:**
- Consumes: `inputBox.partialTranscript.ariaLabel` from Task 6
- Produces: `InputBox` new prop `speechTranscript?: string` (default `""`). When non-empty after trim, render a `role="status"` line above the composer row. `vadLoading` is **not** an inbox badge; if `$speechState.vadLoading` and no transcript, show `$i18n("speechBanner.vad.loading")` in that same line.

- [ ] **Step 1: Write the failing wiring test**

Append:

```ts
test("InputBox kann Live-Transkription zeigen", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "InputBox.svelte"), "utf8");
  assert.equal(src.includes("speechTranscript"), true);
  assert.equal(src.includes("inputBox.partialTranscript.ariaLabel"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/services/chrome-placement.test.ts`

Expected: FAIL (`speechTranscript` missing)

- [ ] **Step 3: Implement the composer line**

In `InputBox.svelte` props:

```ts
    speechTranscript?: string;
    vadLoading?: boolean;
```

Above `<div class="composer">` (after hint / pending files):

```svelte
  {#if speechTranscript.trim() || vadLoading}
    <p class="speech-transcript" role="status" aria-label={$i18n("inputBox.partialTranscript.ariaLabel")}>
      {#if vadLoading && !speechTranscript.trim()}
        {$i18n("speechBanner.vad.loading")}
      {:else}
        <span class="speech-transcript-label">{$i18n("speechBanner.recognizing.label")}</span>
        {speechTranscript}
      {/if}
    </p>
  {/if}
```

CSS (no new animation):

```css
  .speech-transcript {
    margin: 0;
    padding: 0 var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    line-height: var(--line-height-normal);
  }

  .speech-transcript-label {
    font-weight: 600;
    margin-right: var(--space-2);
    color: var(--color-text);
  }
```

In `ChatView` `<InputBox>`:

```svelte
        speechTranscript={$speechState.partialTranscript}
        vadLoading={$speechState.vadLoading}
```

- [ ] **Step 4: Run tests + check**

Run:

```
node --import tsx --test src/lib/services/chrome-placement.test.ts src/lib/i18n/i18n.test.ts
npm run check
```

Expected: PASS

- [ ] **Step 5: Commit**

Ask the user before committing.

```bash
git add src/lib/components/InputBox.svelte src/lib/components/ChatView.svelte src/lib/services/chrome-placement.test.ts
git commit -m "feat: show speech partials on the composer"
```

---

### Task 8: Final verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-chrome-diet-design.md` (status line only)

**Interfaces:**
- Consumes: all previous tasks
- Produces: spec status `approved · implemented`

- [ ] **Step 1: Run the full JS test slice that this plan owns, plus existing neighbors**

```
node --import tsx --test src/lib/services/chrome-placement.test.ts src/lib/stores/speech-inbox.test.ts src/lib/i18n/i18n.test.ts src/lib/services/update-flow.test.ts src/lib/services/companion-presence.test.ts
npm run check
```

Expected: all PASS, `svelte-check` 0 errors

- [ ] **Step 2: Manual smoke (if a desktop window is available)**

1. Idle connected: only status bar + empty chat + composer.
2. Pairing: one rail, no second form in empty state; empty-state button focuses the token field.
3. Remote while pairing pending: only Remote rail.
4. Update available: no top banner; bell badge ≥ 1; inbox shows `UpdateBanner`.
5. Speech error: badge + inbox row; dismiss clears errors; partial transcript only on composer while listening.
6. Open Settings during Shell approval: rail still visible above Settings.
7. TLS modal: rail hidden.

If no window is available, record that in the task report and rely on Step 1.

- [ ] **Step 3: Update spec status**

First line of the spec becomes:

```md
Status: approved · implemented · Date: 2026-09-08
```

- [ ] **Step 4: Commit**

Ask the user before committing.

```bash
git add docs/superpowers/specs/2026-09-08-chrome-diet-design.md
git commit -m "docs: mark chrome-diet spec implemented"
```

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| `selectApproval` priority + TLS empty | 1 |
| Pairing needed = `awaiting_pairing` \| `error` | 1, 5 |
| Inbox derive + badge (no plan/activity count) | 2, 6 |
| Update / speech not chat banners | 4, 6 |
| Remote/Shell/Update not `aria-modal` | 3 |
| ApprovalRail outside settings swap | 4 |
| Remove Speech/Plan/Activity/info-banner/`bannerStackCompact` | 4 |
| Status pill ≠ Settings | 5 |
| Empty-state pair = focus only | 5 |
| Inbox renders Update + speech + embedded plan/activity | 6 |
| `clearInboxErrors` | 6 |
| Composer transcript (+ VAD loading line) | 7 |
| Existing update/companion tests stay green | 8 |

## Placeholder / type check

- Function names are `selectApproval`, `isPairingNeeded`, `deriveInboxItems`, `countInboxBadge`, `clearInboxErrors` in every task that uses them.
- Inbox ids are `"update"`, `"speech-error"`, `"plan"`, `"activity"`, plus warning ids.
- `ApprovalKind` is only `"remote" | "shell" | "pairing"`.
- No “similar to Task N”, no TBD.
