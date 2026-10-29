import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { Api, DailyRun, MiniGame } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { renderGame } from "../games";
import { brand, radii } from "../constants/theme";
import TimerBar from "../components/TimerBar";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "DailyRun">;

type Phase = "loading" | "countdown" | "playing" | "between" | "submitting" | "error";

/**
 * The daily challenge runner: three games back to back, one combined score.
 *
 * This screen owns the run bookkeeping and the interstitial countdown. The
 * games themselves come from the shared registry, so quick play and the daily
 * run can never drift apart in behaviour.
 */
export default function DailyRunScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();

  const [run, setRun] = useState<DailyRun | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState(3);
  const [error, setError] = useState<string | null>(null);

  // Keyed by gameCode because that is what the submit endpoint expects.
  const scoresRef = useRef<Array<{ gameCode: string; score: number; durationMs: number }>>([]);
  const [runningTotal, setRunningTotal] = useState(0);
  const [gameScore, setGameScore] = useState(0);

  const gameNamesRef = useRef<Record<string, string>>({});
  const currentGame = run?.games[index] ?? null;

  // --- load the run ------------------------------------------------------
  useEffect(() => {
    (async () => {
      const res = await Api.daily();

      if (!res.data || res.data.games.length === 0) {
        setError(res.error ?? "No daily challenge is available right now.");
        setPhase("error");
        return;
      }

      setRun(res.data);
      gameNamesRef.current = Object.fromEntries(res.data.games.map((g) => [g.code, g.name]));
      setPhase("countdown");
    })();
  }, []);

  // --- countdown interstitial -------------------------------------------
  useEffect(() => {
    if (phase !== "countdown" && phase !== "between") return;

    if (countdown <= 0) {
      setGameScore(0);
      setPhase("playing");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 700);

    return () => clearTimeout(timer);
  }, [phase, countdown]);

  // --- a game finished ---------------------------------------------------
  const onGameFinished = useCallback(
    (score: number) => {
      const game = currentGame;
      if (!game) return;

      scoresRef.current.push({
        gameCode: game.code,
        score,
        durationMs: game.durationSeconds * 1000,
      });

      const total = scoresRef.current.reduce((sum, s) => sum + s.score, 0);
      setRunningTotal(total);

      const isLast = index >= (run?.games.length ?? 1) - 1;

      if (isLast) {
        setPhase("submitting");
      } else {
        setIndex((i) => i + 1);
        setCountdown(3);
        setPhase("between");
      }
    },
    [currentGame, index, run]
  );

  // --- submit the run ----------------------------------------------------
  useEffect(() => {
    if (phase !== "submitting") return;

    (async () => {
      const res = await Api.submitRun(run?.seed ?? "", scoresRef.current);

      if (!res.data) {
        setError(res.error ?? "Could not save your score");
        setPhase("error");
        return;
      }

      await refresh();

      void Haptics.notificationAsync(
        res.data.isNewBest
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});

      navigation.replace("Result", {
        totalScore: res.data.totalScore,
        coinsEarned: res.data.coinsEarned,
        coinsAwarded: res.data.coinsAwarded,
        balance: res.data.balance,
        percentile: res.data.percentile,
        indiaRank: res.data.indiaRank,
        breakdown: res.data.breakdown,
        gameNames: gameNamesRef.current,
      });
    })();
  }, [phase, run, refresh, navigation]);

  /** Quitting mid-run still banks what was earned. */
  const quit = useCallback(() => {
    if (scoresRef.current.length > 0) {
      setPhase("submitting");
    } else {
      navigation.goBack();
    }
  }, [navigation]);

  // --- states ------------------------------------------------------------

  if (phase === "loading") {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.centerTitle}>Preparing your challenge</Text>
          <ActivityIndicator size="large" color={brand.accent} style={{ marginTop: 20 }} />
        </View>
      </LinearGradient>
    );
  }

  if (phase === "error") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>BACK</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "submitting") {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.centerTitle}>Scoring your run</Text>
          <Text style={styles.centerSub}>{runningTotal.toLocaleString("en-IN")} points</Text>
          <ActivityIndicator size="large" color={brand.gold} style={{ marginTop: 20 }} />
        </View>
      </LinearGradient>
    );
  }

  if (phase === "countdown" || phase === "between") {
    return (
      <LinearGradient
        colors={[currentGame?.colorFrom ?? brand.bg, currentGame?.colorTo ?? brand.bgAlt]}
        style={[styles.root, { paddingTop: insets.top }]}
      >
        <View style={styles.countdownBox}>
          <Text style={styles.countdownEmoji}>{currentGame?.emoji}</Text>
          <Text style={styles.countdownName}>{currentGame?.name}</Text>
          <Text style={styles.countdownHint}>
            Game {index + 1} of {run?.games.length}
          </Text>

          <Text style={styles.countdownNumber}>{countdown > 0 ? countdown : "GO"}</Text>

          <View style={styles.progressRow}>
            {(run?.games ?? []).map((game, i) => (
              <View
                key={game.code}
                style={[
                  styles.progressDot,
                  i < index && styles.progressDotDone,
                  i === index && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          {runningTotal > 0 ? (
            <Text style={styles.runningTotal}>
              Running total {runningTotal.toLocaleString("en-IN")}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    );
  }

  // --- playing -----------------------------------------------------------
  return (
    <View style={styles.root}>
      <View style={[styles.runHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={quit} hitSlop={12} accessibilityRole="button">
          <Text style={styles.quit}>QUIT</Text>
        </Pressable>

        <View style={styles.runHeaderCenter}>
          <Text style={styles.runTitle}>
            {currentGame?.emoji} {currentGame?.name}
          </Text>
          <Text style={styles.runMeta}>
            Game {index + 1}/{run?.games.length}
          </Text>
        </View>

        <Text style={styles.runScore}>{gameScore.toLocaleString("en-IN")}</Text>
      </View>

      {/*
        Keyed on the game code so switching games unmounts the previous
        renderer and its timer with it. Without this a finished game's state
        would leak into the next one.
      */}
      {currentGame ? (
        <View key={currentGame.code} style={{ flex: 1 }}>
          {renderGame(currentGame.code, {
            durationMs: currentGame.durationSeconds * 1000,
            onFinish: onGameFinished,
            onScoreChange: setGameScore,
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerTitle: { color: brand.text, fontSize: 18, fontWeight: "900" },
  centerSub: { color: brand.muted, fontSize: 14, marginTop: 6, fontWeight: "700" },
  errorEmoji: { fontSize: 52 },
  errorText: { color: brand.text, fontSize: 15, textAlign: "center", marginTop: 12, marginBottom: 24, paddingHorizontal: 30 },
  countdownBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  countdownEmoji: { fontSize: 64 },
  countdownName: { color: brand.white, fontSize: 26, fontWeight: "900", marginTop: 12 },
  countdownHint: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6, fontWeight: "700" },
  countdownNumber: { color: brand.white, fontSize: 92, fontWeight: "900", marginTop: 16 },
  progressRow: { flexDirection: "row", gap: 8, marginTop: 26 },
  progressDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.3)" },
  progressDotDone: { backgroundColor: brand.success },
  progressDotActive: { backgroundColor: brand.gold, transform: [{ scale: 1.4 }] },
  runningTotal: { color: brand.gold, fontSize: 13, marginTop: 18, fontWeight: "900" },
  runHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  quit: { color: brand.muted, fontSize: 12, fontWeight: "900", width: 46 },
  runHeaderCenter: { flex: 1, alignItems: "center" },
  runTitle: { color: brand.white, fontSize: 15, fontWeight: "900" },
  runMeta: { color: brand.muted, fontSize: 10, marginTop: 1, fontWeight: "700" },
  runScore: { color: brand.gold, fontSize: 15, fontWeight: "900", width: 56, textAlign: "right" },
  primaryButton: { backgroundColor: brand.accent, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 40 },
  primaryButtonText: { color: brand.white, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.85 },
});