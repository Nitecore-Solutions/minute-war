import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { brand, radii } from "../constants/theme";
import { useAds } from "../context/AdsContext";
import type { AdPlacement } from "../services/ads";

/**
 * An ad slot.
 *
 * Renders one of three things:
 *   1. A live AdMob banner        - native module linked AND placement active
 *   2. A labelled dev placeholder - build exists, but the slot is off or has
 *                                   no unit id, so the space is still visible
 *   3. Nothing at all             - Expo Go, or ads globally off
 *
 * Case 3 is the important one. The Google Mobile Ads SDK is native code and is
 * absent in Expo Go, so this must degrade to nothing rather than crash or
 * leave a grey gap. That keeps Expo Go usable for everything else; only the ads
 * need a real build.
 *
 * The ads package is imported lazily behind a runtime check for the same
 * reason: a module-scope import throws where the native module is missing and
 * takes the whole bundle with it.
 */

interface Props {
  placement: AdPlacement;
  /** Shown in the placeholder so the slots can be told apart. */
  label?: string;
  style?: ViewStyle;
  /** Suppresses the placeholder. Used where an empty box would look wrong. */
  silentWhenOff?: boolean;
}

export default function AdBanner({
  placement,
  label = "YOUR AD HERE",
  style,
  silentWhenOff = false,
}: Props) {
  const { nativeAvailable, isActive, unitIdFor } = useAds();

  // No native SDK: render nothing. This is the Expo Go path.
  if (!nativeAvailable) return null;

  const active = isActive(placement);
  const unitId = unitIdFor(placement);
  const Banner = active && unitId ? loadBannerComponent() : null;

  if (Banner && unitId) {
    return (
      <View style={[styles.slot, style]}>
        <Banner unitId={unitId} size="BANNER" />
      </View>
    );
  }

  if (silentWhenOff) return null;

  // A development build with the slot off or unconfigured. The placeholder
  // makes the position and spacing judgeable before going live.
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.placeholderLabel}>{label}</Text>
      <Text style={styles.placeholderMeta}>
        {placement}
        {!unitId ? " · no ad unit configured" : " · switched off in admin"}
      </Text>
    </View>
  );
}

/**
 * Resolves the banner component at runtime, once.
 *
 * Returns null when the package is not usable in this environment, which is the
 * Expo Go case. Held in module scope lazily rather than imported at the top,
 * so a missing native module cannot break the import graph.
 */
let bannerComponent: React.ComponentType<{ unitId: string; size?: string }> | null = null;
let bannerLookupDone = false;

function loadBannerComponent() {
  if (bannerLookupDone) return bannerComponent;
  bannerLookupDone = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-google-mobile-ads");
    bannerComponent = mod?.BannerAd ?? mod?.default ?? null;
  } catch {
    bannerComponent = null;
  }

  return bannerComponent;
}

/** Invalidates the cached lookup. Used by tests. */
export function resetAdBannerCache() {
  bannerLookupDone = false;
  bannerComponent = null;
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    // Reserve the banner height so the layout does not jump when the ad
    // finishes loading.
    minHeight: 50,
    overflow: "hidden",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(251,191,36,0.4)",
    paddingVertical: 12,
  },
  placeholderLabel: { fontSize: 13, fontWeight: "900", color: brand.gold, letterSpacing: 1 },
  placeholderMeta: { marginTop: 3, fontSize: 9, fontWeight: "700", color: brand.muted },
});