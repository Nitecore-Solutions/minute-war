import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";

import { loadAdConfig, isNativeModuleAvailable } from "../services/ads";
import type { AdConfig, AdPlacement } from "../services/ads";

/**
 * Ad config as React state.
 *
 * WHY THIS EXISTS
 * ---------------
 * The config arrives from the network, so a screen that reads it once during
 * its first render would always see the initial empty state and never show an
 * ad. This holds the config in state, re-fetches when the app comes back to
 * the foreground, and exposes the placement checks as plain booleans.
 *
 * The re-fetch on foreground matters for the same reason the kill switch
 * matters at all: an admin who pulls ads should not have to wait for the user
 * to reinstall.
 */

interface AdsContextValue {
  ready: boolean;
  enabled: boolean;
  nativeAvailable: boolean;
  isActive: (placement: AdPlacement) => boolean;
  unitIdFor: (placement: AdPlacement) => string | null;
  reload: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | undefined>(undefined);

export const AdsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AdConfig | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const next = await loadAdConfig({ refresh: true });
    if (next) setConfig(next);
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Coming back from the background is exactly when a just-changed switch
  // should be picked up, so refresh then rather than only on mount.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });

    return () => subscription.remove();
  }, [reload]);

  const value = useMemo<AdsContextValue>(
    () => ({
      ready,
      enabled: Boolean(config?.enabled),
      nativeAvailable: isNativeModuleAvailable(),
      isActive: (placement: AdPlacement) => {
        if (!isNativeModuleAvailable() || !config?.enabled) return false;
        return Boolean(config.placements.find((p) => p.id === placement)?.active);
      },
      unitIdFor: (placement: AdPlacement) => {
        if (!isNativeModuleAvailable() || !config?.enabled) return null;
        return config.placements.find((p) => p.id === placement)?.unitId ?? null;
      },
      reload,
    }),
    [config, ready, reload]
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
};

export const useAds = () => {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error("useAds must be used inside <AdsProvider>");
  return ctx;
};