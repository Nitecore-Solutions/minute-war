import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Api, ChallengeSummary, webUrl } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { BATTLES_ENABLED } from "../config/features";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, wallet, streak, badges, logout, refresh } = useAuth();
  const { online, connected } = useRealtime();

  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!BATTLES_ENABLED) return;

    const res = await Api.challenges();
    if (res.data) setChallenges(res.data.challenges);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), load()]);
    setRefreshing(false);
  }, [refresh, load]);

  const signOut = () => {
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  /**
   * Legal pages live on the same Render origin as the API, so the user does
   * not need a separate website URL baked into the app.
   */
  const openLegal = (path: string) => {
    const url = webUrl(path);
    void Linking.openURL(url).catch(() => {
      Alert.alert("Could not open link", url);
    });
  };

  const pending = challenges.filter((c) => c.status === "pending").length;
  const won = challenges.filter((c) => c.won).length;

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.accent}
            colors={[brand.accent]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.trim()?.[0]?.toUpperCase() ?? "P"}
            </Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.name}>{user?.name ?? "Player"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <Text style={styles.playerId}>PLAYER ID {user?.playerId}</Text>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat value={wallet?.balance ?? 0} label="Coins" />
          <Stat value={streak.current} label="Day streak" />
          {BATTLES_ENABLED ? <Stat value={won} label="Challenges won" /> : null}
        </View>

        {streak.current > 0 ? (
          <View style={styles.streakBox}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              <Text style={styles.streakValue}>{streak.current}</Text> day streak ·{" "}
              <Text style={styles.streakValue}>{streak.longest}</Text> best ·{" "}
              <Text style={styles.streakValue}>{streak.totalDays}</Text> days played
            </Text>
          </View>
        ) : (
          <View style={styles.streakBox}>
            <Text style={styles.streakText}>
              Play a daily run today to start a streak. Consecutive days earn bonus coins.
            </Text>
          </View>
        )}

        <Section title="Badges">
          {badges.length === 0 ? (
            <Text style={styles.empty}>No badges yet. Play more rounds to earn them.</Text>
          ) : (
            <View style={styles.badges}>
              {badges.map((badge) => (
                <View key={badge.code} style={styles.badge}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeName} numberOfLines={1}>
                    {badge.name}
                  </Text>
                  <Text
                    style={[
                      styles.badgeTier,
                      badge.tier === "gold" && styles.badgeGold,
                      badge.tier === "silver" && styles.badgeSilver,
                    ]}
                  >
                    {badge.tier}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {BATTLES_ENABLED ? (
          <Section title="Challenges">
            {challenges.length === 0 ? (
              <Text style={styles.empty}>
                No challenges yet. Finish a run and challenge a friend from the result screen.
              </Text>
            ) : (
              <View style={styles.list}>
                {challenges.slice(0, 10).map((c, i) => (
                  <View key={`${c.code}-${i}`} style={styles.row}>
                    <Text style={styles.rowEmoji}>
                      {c.direction === "sent" ? "📤" : c.won ? "🏆" : "🤝"}
                    </Text>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.direction === "sent" ? `You: ${c.yourScore ?? 0}` : c.opponentName}
                      </Text>
                      <Text style={styles.rowSub}>
                        {c.direction === "received"
                          ? `You scored ${c.yourScore ?? 0} against ${c.theirScore ?? 0}`
                          : c.theirScore === null
                            ? "waiting for a reply"
                            : `They scored ${c.theirScore}`}
                      </Text>
                    </View>
                    <StatusPill status={c.status} won={c.won} />
                  </View>
                ))}
              </View>
            )}
            {pending > 0 ? (
              <Text style={styles.pendingNote}>
                {pending} challenge{pending > 1 ? "s" : ""} waiting for a reply.
              </Text>
            ) : null}
          </Section>
        ) : null}

        <Section title="Account & legal">
          <View style={styles.legalList}>
            <Pressable
              onPress={() => navigation.navigate("DeleteAccount")}
              style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={styles.legalCopy}>
                <Text style={[styles.legalLabel, styles.legalDanger]}>
                  Delete account
                </Text>
                <Text style={styles.legalHint}>
                  Permanently remove your profile and data
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={() => openLegal("/privacy")}
              style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
              accessibilityRole="link"
            >
              <Text style={styles.legalLabel}>Privacy Policy</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={() => openLegal("/terms")}
              style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
              accessibilityRole="link"
            >
              <Text style={styles.legalLabel}>Terms of Use</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        </Section>

        <View style={styles.footer}>
          {BATTLES_ENABLED ? (
            <View style={styles.onlineRow}>
              <View
                style={[styles.dot, { backgroundColor: connected ? brand.success : brand.danger }]}
              />
              <Text style={styles.onlineText}>
                {connected ? `${online} players online` : "reconnecting..."}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={signOut}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Text style={styles.version}>MINUTE WAR · v1.0.0</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString("en-IN")}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatusPill({ status, won }: { status: string; won: boolean }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "Waiting", color: brand.warning },
    won: { label: "Won", color: brand.success },
    lost: { label: "Lost", color: brand.danger },
    expired: { label: "Expired", color: brand.mutedDark },
  };
  const entry = map[status] ?? { label: status, color: brand.muted };
  return (
    <View style={[styles.pill, { borderColor: entry.color }]}>
      <Text style={[styles.pillText, { color: entry.color }]}>{entry.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: brand.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: brand.white, fontSize: 26, fontWeight: "900" },
  headerInfo: { flex: 1 },
  name: { color: brand.white, fontSize: 20, fontWeight: "900" },
  email: { color: brand.muted, fontSize: 12, marginTop: 1 },
  playerId: { color: brand.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.6, marginTop: 2 },
  stats: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 20 },
  stat: {
    flex: 1,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  statValue: { color: brand.gold, fontSize: 19, fontWeight: "900" },
  statLabel: { color: brand.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  streakBox: {
    margin: 16,
    padding: 13,
    borderRadius: radii.md,
    backgroundColor: brand.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: brand.border,
  },
  streakEmoji: { fontSize: 22 },
  streakText: { color: brand.textDim, fontSize: 12, flex: 1, lineHeight: 1.5 },
  streakValue: { color: brand.gold, fontWeight: "900" },
  section: { paddingHorizontal: 16, marginTop: 18 },
  sectionTitle: {
    color: brand.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    width: 84,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: brand.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  badgeIcon: { fontSize: 24 },
  badgeName: { color: brand.white, fontSize: 10, fontWeight: "800", marginTop: 3, textAlign: "center" },
  badgeTier: { color: brand.mutedDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  badgeGold: { color: brand.gold },
  badgeSilver: { color: "#cbd5e1" },
  list: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 11,
    borderWidth: 1,
    borderColor: brand.border,
  },
  rowEmoji: { fontSize: 16 },
  rowInfo: { flex: 1 },
  rowTitle: { color: brand.white, fontSize: 13, fontWeight: "800" },
  rowSub: { color: brand.muted, fontSize: 11 },
  pill: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: "900" },
  pendingNote: { color: brand.warning, fontSize: 11, marginTop: 8 },
  empty: { color: brand.muted, fontSize: 12, lineHeight: 1.6 },
  legalList: { gap: 6 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  legalCopy: { flex: 1 },
  legalLabel: { color: brand.white, fontSize: 13, fontWeight: "800" },
  legalDanger: { color: brand.danger },
  legalHint: { color: brand.muted, fontSize: 11, marginTop: 2 },
  chevron: { color: brand.muted, fontSize: 20, fontWeight: "300" },
  footer: { marginTop: 26, alignItems: "center", gap: 12 },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { color: brand.muted, fontSize: 11, fontWeight: "700" },
  signOut: {
    paddingHorizontal: 26,
    paddingVertical: 11,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: brand.danger,
  },
  signOutText: { color: brand.danger, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.8 },
  version: { color: brand.mutedDark, fontSize: 10 },
});