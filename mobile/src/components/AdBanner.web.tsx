import React from "react";

/**
 * Web build of the ad slot.
 *
 * AdMob is native-only. Metro still statically follows the lazy require in the
 * native component, which fails the web bundle even though no ad would ever
 * render there. This stub is selected by the `.web.tsx` platform extension, so
 * Expo Web stays usable for previews and UI checks.
 */
export default function AdBanner() {
  return null;
}

export function resetAdBannerCache() {}
