import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { Api, ChallengeInvite } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { BATTLES_ENABLED } from "../config/features";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Challenge">;

/**
 * A friend's challenge, opened from a shared link.
 *
 * This is the first screen an un-installed player sees, so it never demands
 * an account: the challenge details load on an unauthenticated request, and
 * signing up is framed as the way to actually play it rather than as a
 * wall.
 */
export default function ChallengeScreen({ route, navigation }: Props) {
  const { code } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { joinBattle } = useRealtime();

  const [invite, setInvite] = useState<ChallengeInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!BATTLES_ENABLED) {
      setLoading(false);
      return;
    }

    (async () => {
      const res = await Api.openChallenge(code);
      if (res.data) setInvite(res.data);
      else setError(res.error ?? "That challenge link is not valid");
      setLoading(false);
    })();
  }, [code]);

  const accept = () => {
    if (!BATTLES_ENABLED) return;

    if (!user) {
      // Send them to sign-up carrying the code, so the referral is credited
      // once the account exists.
      navigation.navigate("Signup");
      return;
    }

    setStarting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // The 1v1 battle is the fairest way to settle a challenge: both players
    // answer the same questions on the same server, so neither can win by
    // tapping faster on a laggy connection.
    joinBattle(code);
    navigation.navigate("Battle", { code });
  };

  if (!BATTLES_ENABLED) {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.errorEmoji}>⚔️</Text>
          <Text style={styles.errorText}>
            Challenges are not available in this version of MINUTE WAR.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>GO TO MINUTE WAR</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  if (loading) {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.accent} />
        </View>
      </LinearGradient>
    );
  }

  if (error || !invite) {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>GO TO MINUTE WAR</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <View style={[styles.body, { paddingTop: insets.top + 30 }]}>
        <Text style={styles.challengeOf}>🔥 CHALLENGE FROM</Text>
        <Text style={styles.name}>{invite.challengerName}</Text>

        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>THEIR SCORE</Text>
          <Text style={styles.score}>{invite.challengerScore.toLocaleString("en-IN")}</Text>
          <Text style={styles.question}>Can you beat it?</Text>
        </View>

        {invite.games.length > 0 ? (
          <View style={styles.games}>
            {invite.games.map((game) => (
              <View key={game.code} style={styles.gameRow}>
                <Text style={styles.gameEmoji}>{game.emoji}</Text>
                <Text style={styles.gameName}>{game.name}</Text>
                <Text style={styles.gameTime}>{game.durationSeconds}s</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={accept}
          disabled={starting}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          {starting ? (
            <ActivityIndicator color={brand.white} />
          ) : (
            <Text style={styles.primaryText}>
              {user ? "ACCEPT & PLAY" : "CREATE ACCOUNT TO PLAY"}
            </Text>
          )}
        </Pressable>

        {!user ? (
          <Text style={styles.signupNote}>
            It takes 20 seconds and you get 500 coins to start.
          </Text>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate("Home")}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Maybe later</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorEmoji: { fontSize: 52 },
  errorText: {
    color: brand.text,
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  challengeOf: {
    color: brand.accent,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },
  name: {
    color: brand.white,
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
  },
  scoreBox: {
    marginTop: 28,
    backgroundColor: brand.surface,
    borderRadius: radii.lg,
    padding: 26,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  scoreLabel: { color: brand.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  score: { color: brand.gold, fontSize: 52, fontWeight: "900", marginTop: 4 },
  question: { color: brand.text, fontSize: 15, fontWeight: "800", marginTop: 8 },
  games: { marginTop: 20, gap: 8 },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radii.md,
    padding: 12,
  },
  gameEmoji: { fontSize: 20 },
  gameName: { color: brand.text, fontSize: 14, fontWeight: "700", flex: 1 },
  gameTime: { color: brand.muted, fontSize: 12, fontWeight: "800" },
  primary: {
    marginTop: 28,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 17,
    alignItems: "center",
  },
  primaryText: { color: brand.white, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  signupNote: { color: brand.muted, fontSize: 12, textAlign: "center", marginTop: 10 },
  secondary: { marginTop: 16, alignItems: "center" },
  secondaryText: { color: brand.muted, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.85 },
});