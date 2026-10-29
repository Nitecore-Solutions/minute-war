import { NativeModules, Platform } from "react-native";
import { Api } from "./api";

/**
 * Ad configuration, fetched once at startup.
 *
 * WHY SERVER-DRIVEN
 * -----------------
 * Turning an ad placement on or off, or pointing it at a different AdMob unit,
 * has to be instant. If the ids lived in the app binary, every change would
 * need a Play Store release. The admin dashboard writes to ad_config, this
 * reads it, and the change is live on the next app launch.
 *
 * WHY THIS DEGRADES SILENTLY
 * --------------------------
 * The Google Mobile Ads SDK is native code, so it is ABSENT when running in
 * Expo Go. Rather than crash, `isAvailable` reports false and the UI renders
 * nothing. That keeps the app fully usable in Expo Go for all other work, and
 * only the ads themselves appear once a development build is installed.
 */

export type AdPlacement = "home_banner" | "result_banner" | "between_games" | "interstitial_result";

export interface AdConfig {
  enabled: boolean;
  placements: Array<{
    id: AdPlacement;
    active: boolean;
    unitId: string | null;
    provider: string;
  }>;
}

let config: AdConfig | null = null;
let loading: Promise<AdConfig | null> | null = null;

/**
 * True only when the native ads module is actually linked.
 *
 * This is the check that keeps Expo Go working. It is deliberately a runtime
 * probe rather than a try/catch around the import, because importing the ads
 * package in Expo Go throws at module load and would take the whole app with
 * it.
 */
export function isNativeModuleAvailable(): boolean {
  if (Platform.OS === "web") return false;
  // Either name, because the package has used both across versions.
  return Boolean(NativeModules.RNGMobileAdsModule ?? NativeModules.RNGMobileAds);
}

/** True when the app should attempt to show ads at all. */
export function isAvailable(): boolean {
  return isNativeModuleAvailable() && Boolean(config?.enabled);
}

/**
 * Loads ad config.
 *
 * Defaults to the in-memory cache, which is what repeated calls within one
 * screen want. Pass `refresh` to force a re-fetch.
 *
 * WHY REFRESH EXISTS
 * ------------------
 * An ad kill switch that only takes effect after an app restart is not a kill
 * switch. The home screen re-fetches on every mount, so pulling ads becomes
 * effective within one navigation rather than one install.
 */
export function loadAdConfig(options?: { refresh?: boolean }): Promise<AdConfig | null> {
  if (config && !options?.refresh) return Promise.resolve(config);
  if (loading) return loading;

  loading = Api.adsConfig()
    .then((res) => {
      config = res.data ?? null;
      return config;
    })
    .catch((err) => {
      // A failure here must never break the app. Ads are not worth an error
      // state; they simply do not show.
      console.warn("[ads] config unavailable, showing no ads", err);
      config = null;
      return null;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/** Whether one specific placement should render right now. */
export function isPlacementActive(placement: AdPlacement): boolean {
  if (!isAvailable()) return false;
  return Boolean(config?.placements.find((p) => p.id === placement)?.active);
}

/** The AdMob unit id for a placement, or null when it is not usable. */
export function unitIdFor(placement: AdPlacement): string | null {
  if (!isAvailable()) return null;
  return config?.placements.find((p) => p.id === placement)?.unitId ?? null;
}

/**
 * Test ids.
 *
 * Google's own sample ids, so a real test ad renders in a development build
 * before a real AdMob account exists. Using a real unit id while still in
 * development can get an AdMob account suspended for invalid traffic, so this
 * distinction matters more than it looks.
 */
export const TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
export const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";

/** True when the configured unit is one of Google's public test ids. */
export function isTestUnit(unitId: string): boolean {
  return unitId.startsWith("ca-app-pub-3940256099942544");
}

/** Clears the cache. Used by tests. */
export function resetAdConfig(): void {
  config = null;
  loading = null;
}