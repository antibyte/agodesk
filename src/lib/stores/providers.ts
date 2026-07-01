import { writable } from "svelte/store";
import type {
  ConfigProvider,
  ConfigProviderCatalogEntry,
  ConfigProviderOauthStartedPayload,
  ConfigProviderOauthStatusPayload,
} from "../types/protocol";

export interface ProvidersState {
  providers: ConfigProvider[];
  selectedProvider: ConfigProvider | null;
  catalog: ConfigProviderCatalogEntry[];
  catalogEnabled: boolean;
  loading: boolean;
  catalogLoading: boolean;
  detailLoading: boolean;
  testLoadingProviderId: string | null;
  error: string;
  oauthPending: ConfigProviderOauthStartedPayload | null;
  oauthStatus: ConfigProviderOauthStatusPayload | null;
}

const initialState: ProvidersState = {
  providers: [],
  selectedProvider: null,
  catalog: [],
  catalogEnabled: false,
  loading: false,
  catalogLoading: false,
  detailLoading: false,
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
    setDetailLoading: (detailLoading: boolean) => update((state) => ({ ...state, detailLoading })),
    setTestLoadingProviderId: (testLoadingProviderId: string | null) =>
      update((state) => ({ ...state, testLoadingProviderId })),
    setError: (error: string) => update((state) => ({ ...state, error })),
    setProviders: (providers: ConfigProvider[]) =>
      update((state) => ({ ...state, providers, loading: false, error: "" })),
    setSelectedProvider: (selectedProvider: ConfigProvider | null) =>
      update((state) => ({ ...state, selectedProvider, detailLoading: false })),
    upsertProviderInList: (provider: ConfigProvider) =>
      update((state) => {
        const index = state.providers.findIndex((entry) => entry.id === provider.id);
        const providers =
          index >= 0
            ? state.providers.map((entry, idx) => (idx === index ? provider : entry))
            : [...state.providers, provider];
        return {
          ...state,
          providers,
          selectedProvider:
            state.selectedProvider?.id === provider.id ? provider : state.selectedProvider,
        };
      }),
    removeProviderFromList: (providerId: string) =>
      update((state) => ({
        ...state,
        providers: state.providers.filter((entry) => entry.id !== providerId),
        selectedProvider: state.selectedProvider?.id === providerId ? null : state.selectedProvider,
      })),
    setCatalog: (catalog: ConfigProviderCatalogEntry[], enabled = true) =>
      update((state) => ({
        ...state,
        catalog,
        catalogEnabled: enabled,
        catalogLoading: false,
      })),
    setOauthPending: (oauthPending: ConfigProviderOauthStartedPayload | null) =>
      update((state) => ({ ...state, oauthPending })),
    setOauthStatus: (oauthStatus: ConfigProviderOauthStatusPayload | null) =>
      update((state) => ({ ...state, oauthPending: null, oauthStatus })),
  };
}

export const providersState = createProvidersStore();
