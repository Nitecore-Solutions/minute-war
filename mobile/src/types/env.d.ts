/**
 * Ambient types for the Expo/Metro environment.
 *
 * `process.env.EXPO_PUBLIC_*` is inlined at build time by Expo, so the types
 * have to be declared somewhere. Declaring them here means a typo in an env
 * key is caught by tsc rather than silently becoming undefined at runtime.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of the REST API, including the /api path. */
    EXPO_PUBLIC_API_URL?: string;
    /** WebSocket origin. Derived from the API URL when omitted. */
    EXPO_PUBLIC_WS_URL?: string;
    /**
     * Set to "true" only when the WebSocket server is deployed. Anything else
     * disables battles, challenge links and the socket connection entirely.
     */
    EXPO_PUBLIC_ENABLE_BATTLES?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};