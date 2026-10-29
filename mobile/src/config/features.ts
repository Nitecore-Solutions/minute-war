/**
 * Build-time feature switches.
 *
 * EXPO_PUBLIC_* values are inlined by Expo, so changing these requires a new
 * build (or restarting Expo with --clear during development).
 *
 * Battles are the only feature that needs the standalone WebSocket server.
 * With this false, the app never opens a socket and all battle/challenge UI
 * is hidden. The normal REST API, daily run, quick play, wallet, profile and
 * leaderboard keep working over HTTPS.
 */
export const BATTLES_ENABLED = process.env.EXPO_PUBLIC_ENABLE_BATTLES === "true";
