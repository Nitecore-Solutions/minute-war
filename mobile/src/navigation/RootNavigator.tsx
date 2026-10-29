import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { useAuth } from "../context/AuthContext";
import { BATTLES_ENABLED } from "../config/features";
import { brand } from "../constants/theme";
import HomeScreen from "../screens/HomeScreen";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import DailyRunScreen from "../screens/DailyRunScreen";
import GamePlayScreen from "../screens/GamePlayScreen";
import ResultScreen from "../screens/ResultScreen";
import ChallengeScreen from "../screens/ChallengeScreen";
import BattleScreen from "../screens/BattleScreen";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { WalletScreen } from "../screens/WalletScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

export type RootStackParamList = {
  Login: undefined;
  Signup: { referralCode?: string } | undefined;
  Home: undefined;
  DailyRun: undefined;
  Game: { code: string; name: string; emoji: string; durationSeconds: number; colorFrom: string; colorTo: string; inRun?: boolean };
  Result: {
    totalScore: number;
    coinsEarned: number;
    coinsAwarded: boolean;
    balance: number;
    percentile: number | null;
    indiaRank: number | null;
    breakdown: Array<{ code: string; score: number; durationMs: number }>;
    gameNames: Record<string, string>;
    challengeCode?: string;
    againstName?: string;
  };
  Challenge: { code: string };
  Battle: { code: string };
};

export type TabParamList = {
  HomeTab: undefined;
  LeaderboardTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: brand.accent,
    background: brand.bg,
    card: brand.surface,
    text: brand.text,
    border: brand.border,
  },
};

/** Bottom tab bar with text labels only, so no icon font is needed. */
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: brand.bgAlt,
          borderTopColor: brand.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: brand.accent,
        tabBarInactiveTintColor: brand.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800" },
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: "Play" }} />
      <Tab.Screen name="LeaderboardTab" component={LeaderboardScreen} options={{ title: "Ranks" }} />
      <Tab.Screen name="WalletTab" component={WalletScreen} options={{ title: "Coins" }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, isBooting } = useAuth();

  /**
   * `initialRouteName` is only read the first time the navigator mounts, so
   * it cannot react to signing in later. The route is swapped by hand instead.
   */
  useEffect(() => {
    if (isBooting) return;
    if (!navigationRef.isReady()) return;

    const onAuthScreen = navigationRef.getCurrentRoute()?.name === "Login" ||
      navigationRef.getCurrentRoute()?.name === "Signup";

    if (user && onAuthScreen) {
      navigationRef.reset({ routes: [{ name: "Home" }] });
    }
  }, [user, isBooting]);

  if (isBooting) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitle}>MINUTE WAR</Text>
        <Text style={styles.splashTag}>60 Seconds. One Winner.</Text>
        <ActivityIndicator size="large" color={brand.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator
        id="root"
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: brand.bg },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Home" component={Tabs} />
        <Stack.Screen name="DailyRun" component={DailyRunScreen} />
        <Stack.Screen name="Game" component={GamePlayScreen} />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ animation: "fade", gestureEnabled: false }}
        />
        {BATTLES_ENABLED ? (
          <>
            <Stack.Screen name="Challenge" component={ChallengeScreen} />
            <Stack.Screen name="Battle" component={BattleScreen} />
          </>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: brand.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  splashTitle: {
    color: brand.accent,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 2,
  },
  splashTag: { color: brand.muted, fontSize: 13, marginTop: 6, fontWeight: "600" },
});