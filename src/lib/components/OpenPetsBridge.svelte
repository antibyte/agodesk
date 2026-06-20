<script lang="ts">
  import { connectionStatus } from "../stores/connection";
  import { chatConversationState } from "../stores/chat-conversation";
  import { chatPlanState, isChatPlanPanelVisible } from "../stores/chat-plan";
  import { sessionState } from "../stores/session";
  import { speechState } from "../stores/speech";
  import { settings } from "../stores/settings";
  import { openPetsContext } from "../stores/openpets-context";
  import {
    deriveOpenPetsReaction,
    deriveOpenPetsStatusMessage,
    publishOpenPetsLifecycle,
    resetOpenPetsLifecyclePublisher,
  } from "../services/openpets-flow";

  let prevRequestInFlight = $state(false);
  let requestJustFinished = $state(false);
  let finishResetTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const requestInFlight =
      $openPetsContext.pending || $chatConversationState.requestInFlight;
    if (prevRequestInFlight && !requestInFlight) {
      requestJustFinished = true;
      if (finishResetTimer) {
        clearTimeout(finishResetTimer);
      }
      finishResetTimer = setTimeout(() => {
        requestJustFinished = false;
        finishResetTimer = null;
      }, 1200);
    }
    prevRequestInFlight = requestInFlight;
  });

  $effect(() => {
    const openPets = $settings.openPets;
    if (!openPets.enabled) {
      resetOpenPetsLifecyclePublisher();
      return;
    }

    const input = {
      enabled: openPets.enabled,
      requestInFlight: $openPetsContext.pending || $chatConversationState.requestInFlight,
      hasActivePlan: isChatPlanPanelVisible($chatPlanState.plan),
      remoteOperation: $openPetsContext.remoteOperation,
      speechActive: $speechState.isActive,
      reactToSpeech: openPets.reactToSpeech,
      connectionError: $connectionStatus === "error",
      sessionError: $sessionState.status === "error",
      requestJustFinished,
      requestFailed: $openPetsContext.requestFailed,
      showMessages: openPets.showMessages,
    };

    const reaction = deriveOpenPetsReaction(input);
    const message = deriveOpenPetsStatusMessage(reaction, input);
    void publishOpenPetsLifecycle(reaction, message);
  });

  $effect(() => {
    return () => {
      if (finishResetTimer) {
        clearTimeout(finishResetTimer);
      }
    };
  });
</script>
