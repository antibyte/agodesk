<script lang="ts">
  import { connectionStatus } from "../stores/connection";
  import { sessionState } from "../stores/session";
  import { playUiSound } from "../services/ui-sounds";

  let prevConnection = $state<string | null>(null);
  let prevSession = $state<string | null>(null);

  $effect(() => {
    const conn = $connectionStatus;
    const prev = prevConnection;
    const session = $sessionState.status;

    if (prev === "connecting" && conn === "connected") {
      if (session === "accepted" || session === "loopback") {
        playUiSound("success");
      }
    } else if (prev !== null && conn === "error" && prev !== "error") {
      playUiSound("error");
    }

    prevConnection = conn;
  });

  $effect(() => {
    const status = $sessionState.status;
    const prev = prevSession;

    if (
      prev !== null &&
      (prev === "pairing" || prev === "awaiting_pairing") &&
      (status === "accepted" || status === "loopback")
    ) {
      playUiSound("success");
    } else if (prev !== null && status === "error" && prev !== "error") {
      playUiSound("error");
    }

    prevSession = status;
  });
</script>
