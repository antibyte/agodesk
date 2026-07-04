import { writable } from "svelte/store";
import type {
  ConfigProvider,
  ConfigProviderCatalogEntry,
  ConfigProviderCatalogModel,
  ConfigProviderCatalogPayload,
  ConfigProviderOauthStartedPayload,
  ConfigProviderOauthStatusPayload,
} from "../types/protocol";

export interface ProvidersState {
  providers: ConfigProvider[];
  catalog: ConfigProviderCatalogEntry[];
  catalogModels: ConfigProviderCatalogModel[];
  catalogMetadata: Record<string, unknown> | null;
  catalogEnabled: boolean;
  loading: boolean;
  catalogLoading: boolean;
  testLoadingProviderId: string | null;
  error: string;
  oauthPending: ConfigProviderOauthStartedPayload | null;
  oauthStatus: ConfigProviderOauthStatusPayload | null;
}

const initialState: ProvidersState = {
  providers: [],
  catalog: [],
  catalogModels: [],
  catalogMetadata: null,
  catalogEnabled: false,
  loading: false,
  catalogLoading: false,
  testLoadingProviderId: null,
  error: "",
  oauthPending: null,
  oauthStatus: null,
};

function createProvidersStore() {
  const { subscribe, set, update } = writable<ProvidersState>(initialState);

  return {
    subscribe,
    reset: () => set(initialState),
    setLoading: (loading: boolean) => update((state) => ({ ...state, loading })),
    setCatalogLoading: (catalogLoading: boolean) =>
      update((state) => ({ ...state, catalogLoading })),
    setTestLoadingProviderId: (testLoadingProviderId: string | null) =>
      update((state) => ({ ...state, testLoadingProviderId })),
    setError: (error: string) => update((state) => ({ ...state, error })),
    setProviders: (providers: ConfigProvider[]) =>
      update((state) => ({ ...state, providers, loading: false, error: "" })),
    upsertProviderInList: (provider: ConfigProvider) =>
      update((state) => {
        const index = state.providers.findIndex((entry) => entry.id === provider.id);
        const providers =
          index >= 0
            ? state.providers.map((entry, idx) => (idx === index ? provider : entry))
            : [...state.providers, provider];
        return { ...state, providers };
      }),
    removeProviderFromList: (providerId: string) =>
      update((state) => ({
        ...state,
        providers: state.providers.filter((entry) => entry.id !== providerId),
      })),
    setCatalogPayload: (payload: ConfigProviderCatalogPayload) =>
      update((state) => ({
        ...state,
        catalog: payload.providers,
        catalogModels: payload.models ?? [],
        catalogMetadata: payload.metadata ?? null,
        catalogEnabled: payload.enabled ?? true,
        catalogLoading: false,
      })),
    setOauthPending: (oauthPending: ConfigProviderOauthStartedPayload | null) =>
      update((state) => ({ ...state, oauthPending })),
    setOauthStatus: (oauthStatus: ConfigProviderOauthStatusPayload | null) =>
      update((state) => ({ ...state, oauthPending: null, oauthStatus })),
  };
}

export const providersState = createProvidersStore();
