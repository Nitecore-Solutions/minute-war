import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Api } from "../services/api";
import { renderGame } from "../games";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Game">;

/**
 * Quick play: one game, played on its own.
 *
 * Delegates straight to the shared game registry, so a game behaves exactly the
 * same here as it does inside the daily run. Quitting mid-game banks whatever
 * was earned rather than discarding it.
 */
export default function GamePlayScreen({ route, navigation }: Props) {
  const { code, name, emoji, durationSeconds, colorFrom, colorTo, inRun } = route.params;
  const insets = useSafeAreaInsets();

  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = useCallback(
    async (value: number) => {
      setScore(value);
      setFinished(true);

      if (!inRun) return;

      setSubmitting(true);
      const res = await Api.submitRun("", [
        { gameCode: code, score: value, durationMs: durationSeconds * 1000 },
      ]);
      setSubmitting(false);

      if (!res.data) setError(res.error ?? "Could not save your score");
    },
    [code, durationSeconds, inRun]
  );

  return (
    <LinearGradient colors={[colorFrom, colorTo, brand.bg]} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{emoji}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        </View>

        <View style={styles.close} />
      </View>

      {renderGame(code, {
        durationMs: durationSeconds * 1000,
        onFinish,
        onScoreChange: setScore,
      })}

      {finished ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayEmoji}>{error ? "⚠️" : "🎉"}</Text>
          <Text style={styles.overlayScore}>{score.toLocaleString("en-IN")}</Text>
          <Text style={styles.overlayLabel}>
            {submitting ? "Saving..." : error ?? (inRun ? "Added to your run" : "points")}
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.overlayButton, pressed && styles.pressed]}
          >
            <Text style={styles.overlayButtonText}>CONTINUE</Text>
          </Pressable>
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 8 },
  close: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  closeText: { color: brand.white, fontSize: 20, fontWeight: "800" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerEmoji: { fontSize: 22 },
  headerTitle: { color: brand.white, fontSize: 15, fontWeight: "900" },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(6,3,24,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  overlayEmoji: { fontSize: 52 },
  overlayScore: { color: brand.gold, fontSize: 52, fontWeight: "900", marginTop: 8 },
  overlayLabel: { color: brand.muted, fontSize: 14, marginTop: 4, marginBottom: 26, textAlign: "center" },
  overlayButton: { backgroundColor: brand.accent, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 40 },
  overlayButtonText: { color: brand.white, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.85 },
});