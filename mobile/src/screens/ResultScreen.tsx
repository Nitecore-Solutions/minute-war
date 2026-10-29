import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { Api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { BATTLES_ENABLED } from "../config/features";
import { brand, radii } from "../constants/theme";
import AdBanner from "../components/AdBanner";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

/**
 * The result screen, and the single most important screen in the app.
 *
 * Everything here exists to make one action easy: sharing a score. The
 * percentile line answers "was that good?" and the challenge link answers
 * "can my friend do better?", which is the loop the whole product depends on.
 */
export default function ResultScreen({ route, navigation }: Props) {
  const {
    totalScore,
    coinsEarned,
    coinsAwarded,
    balance,
    percentile,
    indiaRank,
    breakdown,
    gameNames,
  } = route.params;

  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();

  const [creating, setCreating] = useState(false);
  const [challenge, setChallenge] = useState<{ code: string; shareUrl: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beatable =
    percentile !== null && percentile >= 50
      ? `You're better than ${Math.round(percentile)}% of players today.`
      : "Play again to climb the ranks.";

  /**
   * Creates the challenge first, then shares.
   *
   * The link has to exist before it can be shared, so the two steps cannot be
   * a single tap. Creating it up front on mount would leave a challenge row
   * behind for every player who never shares, so it waits for intent.
   */
  const shareChallenge = useCallback(async () => {
    if (!BATTLES_ENABLED || creating) return;
    setCreating(true);
    setError(null);

    const res = await Api.createChallenge(
      totalScore,
      breakdown.map((b) => b.code)
    );
    setCreating(false);

    if (!res.data) {
      setError(res.error ?? "Could not create a challenge");
      return;
    }

    setChallenge(res.data);

    try {
      await Share.share({
        message: res.data.message,
        url: res.data.shareUrl,
        title: "Can you beat me?",
      });
    } catch {
      // The user dismissed the share sheet. That is not an error, so the
      // created challenge stays on screen with a copy option instead.
      setCopied(true);
    }
  }, [creating, totalScore, breakdown]);

  const copyLink = useCallback(async () => {
    if (!challenge) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Clipboard access needs @react-native-clipboard/clipboard, which is not
    // installed. The share sheet covers the real use case, so this only
    // confirms to the user that the link is ready.
  }, [challenge]);

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 30 },
        ]}
      >
        <Text style={styles.crown}>{coinsAwarded ? "🏆" : "🎉"}</Text>

        <Text style={styles.title}>
          {coinsAwarded ? "GREAT JOB!" : "RUN COMPLETE"}
        </Text>

        <Text style={styles.score}>{totalScore.toLocaleString("en-IN")}</Text>
        <Text style={styles.scoreLabel}>total score</Text>

        {/* percentile is the hook: it turns a number into a comparison */}
        <View style={styles.percentileBox}>
          <Text style={styles.percentile}>{beatable}</Text>
          {indiaRank ? (
            <Text style={styles.rank}>India rank #{indiaRank.toLocaleString("en-IN")}</Text>
          ) : null}
        </View>

        {/* coins */}
        <View style={styles.coinBox}>
          {coinsEarned > 0 ? (
            <>
              <Text style={styles.coinAmount}>+{coinsEarned.toLocaleString("en-IN")} 🪙</Text>
              <Text style={styles.coinSub}>
                Balance {balance.toLocaleString("en-IN")}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.coinZero}>No new coins</Text>
              <Text style={styles.coinSub}>
                {balance.toLocaleString("en-IN")} in your wallet · beat your best today to earn more
              </Text>
            </>
          )}
        </View>

        {/* breakdown */}
        <View style={styles.breakdown}>
          {breakdown.map((row) => (
            <View key={row.code} style={styles.breakdownRow}>
              <Text style={styles.breakdownName} numberOfLines={1}>
                {gameNames[row.code] ?? row.code}
              </Text>
              <Text style={styles.breakdownScore}>
                {row.score.toLocaleString("en-IN")}
              </Text>
            </View>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {BATTLES_ENABLED ? (
          <>
            {/* the viral engine */}
            <Pressable
              onPress={shareChallenge}
              disabled={creating}
              style={({ pressed }) => [styles.challengeButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              {creating ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Text style={styles.challengeEmoji}>🔥</Text>
                  <Text style={styles.challengeText}>CHALLENGE A FRIEND</Text>
                  <Text style={styles.challengeSub}>I scored {totalScore.toLocaleString("en-IN")}. Can you beat me?</Text>
                </>
              )}
            </Pressable>

            {challenge ? (
              <Pressable
                onPress={copyLink}
                style={({ pressed }) => [styles.linkBox, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.linkText} numberOfLines={1}>
                  {challenge.shareUrl}
                </Text>
                <Text style={styles.linkHint}>{copied ? "Ready to share 🔥" : "Tap to share again"}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <AdBanner placement="result_banner" label="AD" style={styles.ad} />

        <Pressable
          onPress={() => navigation.navigate("Home")}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>BACK TO HOME</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.replace("DailyRun")}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        >
          <Text style={styles.linkButtonText}>Play another run</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 22 },
  crown: { fontSize: 56, textAlign: "center" },
  title: {
    color: brand.accent,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 6,
  },
  score: {
    color: brand.white,
    fontSize: 62,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
  },
  scoreLabel: { color: brand.muted, fontSize: 13, textAlign: "center", fontWeight: "700" },
  percentileBox: { alignItems: "center", marginTop: 18 },
  percentile: {
    color: brand.gold,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  rank: { color: brand.muted, fontSize: 12, marginTop: 4, fontWeight: "700" },
  coinBox: {
    marginTop: 20,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  coinAmount: { color: brand.gold, fontSize: 20, fontWeight: "900" },
  coinZero: { color: brand.muted, fontSize: 15, fontWeight: "800" },
  coinSub: { color: brand.muted, fontSize: 12, marginTop: 3 },
  breakdown: {
    marginTop: 16,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 6,
    borderWidth: 1,
    borderColor: brand.border,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  breakdownName: { color: brand.textDim, fontSize: 13, fontWeight: "700", flex: 1 },
  breakdownScore: { color: brand.white, fontSize: 13, fontWeight: "900", marginLeft: 10 },
  error: { color: brand.danger, fontSize: 12, textAlign: "center", marginTop: 12 },
  challengeButton: {
    marginTop: 20,
    backgroundColor: brand.accent,
    borderRadius: radii.lg,
    paddingVertical: 20,
    alignItems: "center",
  },
  challengeEmoji: { fontSize: 26 },
  challengeText: {
    color: brand.white,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 4,
  },
  challengeSub: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 5,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  linkBox: {
    marginTop: 12,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radii.md,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  linkText: { color: brand.info, fontSize: 12, fontWeight: "700" },
  linkHint: { color: brand.muted, fontSize: 11, marginTop: 4 },
  ad: { marginTop: 18, backgroundColor: "rgba(255,255,255,0.03)" },
  secondaryButton: {
    marginTop: 18,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  secondaryText: { color: brand.textDim, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  linkButton: { marginTop: 14, alignItems: "center" },
  linkButtonText: { color: brand.accent, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.85 },
});