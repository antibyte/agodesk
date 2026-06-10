import { chatMediaState } from "../stores/chat-media-state";
import type { IntegrationsWebhostsPayload } from "../types/protocol";
import { normalizeIntegrationsWebhostsPayload } from "../types/protocol";

export function handleIntegrationsWebhostsMessage(
  payload: unknown,
): IntegrationsWebhostsPayload | null {
  const normalized = normalizeIntegrationsWebhostsPayload(payload);
  if (!normalized) {
    return null;
  }
  chatMediaState.setIntegrationWebhosts(normalized.webhosts);
  return normalized;
}
