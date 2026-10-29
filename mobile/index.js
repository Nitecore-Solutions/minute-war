import { registerRootComponent } from "expo";

import App from "./App";

// Surface unhandled async errors in the Metro terminal before Expo Go's generic
// "Something went wrong" screen swallows them.
if (global.ErrorUtils?.getGlobalHandler) {
  const previous = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(
      "[global-error]",
      isFatal ? "FATAL" : "non-fatal",
      error?.stack ?? error
    );
    previous?.(error, isFatal);
  });
}

registerRootComponent(App);