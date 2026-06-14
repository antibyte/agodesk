import type { PersonaState } from "../stores/persona";

export interface PersonaDisplayImage {
  imageUrl: string;
  fallbackImageUrl: string;
}

type PersonaAssetFields = Pick<
  PersonaState,
  "avatarUrl" | "avatarFallbackUrl" | "iconUrl" | "iconFallbackUrl"
>;

/** Willkommensbildschirm: grosses Avatar-Bild bevorzugen. */
export function resolvePersonaWelcomeImage(state: PersonaAssetFields): PersonaDisplayImage {
  return {
    imageUrl: state.avatarUrl || state.iconUrl,
    fallbackImageUrl: state.avatarFallbackUrl || state.iconFallbackUrl,
  };
}

/** Chat-Nachrichten: kleines Icon bevorzugen, Avatar als Fallback. */
export function resolvePersonaChatImage(state: PersonaAssetFields): PersonaDisplayImage {
  return {
    imageUrl: state.iconUrl || state.avatarUrl,
    fallbackImageUrl: state.iconFallbackUrl || state.avatarFallbackUrl,
  };
}
