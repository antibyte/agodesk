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
