import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { RealtimeProvider } from "./src/context/RealtimeContext";
import { AdsProvider } from "./src/context/AdsContext";
import AppErrorBoundary from "./src/components/AppErrorBoundary";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        {/* RealtimeProvider sits inside AuthProvider because the socket needs
            the session token, and it must not connect while signed out. */}
        <AuthProvider>
          <RealtimeProvider>
            {/* Ads is outermost: the kill switch must work whether or not
                anyone is signed in. */}
            <AdsProvider>
              <StatusBar style="light" />
              <RootNavigator />
            </AdsProvider>
          </RealtimeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}