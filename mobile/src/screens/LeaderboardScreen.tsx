import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { Api, Leaderboard, LeaderboardRow } from "../services/api";
import { useRealtime } from "../context/RealtimeContext";
import { brand, radii } from "../constants/theme";
import type { TabParamList } from "../navigation/RootNavigator";

type Scope = "daily" | "weekly" | "alltime";

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This week" },
  { key: "alltime", label: "All time" },
];

export function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { liveBoard, connected } = useRealtime();

  const [scope, setScope] = useState<Scope>("daily");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: Scope) => {
    const res = await Api.leaderboard(next, 50);
    if (res.data) {
      setBoard(res.data);
      setError(null);
    } else {
      setError(res.error ?? "Could not load the leaderboard");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(scope);
    setRefreshing(false);
  }, [load, scope]);

  // The WebSocket pushes the daily board, so the live tab stays current
  // without polling.
  const entries: LeaderboardRow[] =
    scope === "daily" && liveBoard
      ? liveBoard.map((row) => ({
          rank: row.rank,
          userId: 0,
          playerId: row.playerId,
          name: row.name,
          city: null,
          score: row.score,
          runs: 0,
          isYou: false,
        }))
      : (board?.entries ?? []);

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.accent}
            colors={[brand.accent]}
          />
        }
      >
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.sub}>
          {scope === "daily" && connected
            ? "Live · updates as people finish"
            : "Top players in RushArena"}
        </Text>

        <View style={styles.tabs}>
          {SCOPES.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setScope(option.key)}
              style={[styles.tab, scope === option.key && styles.tabActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.tabText, scope === option.key && styles.tabTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {board?.you ? (
          <View style={styles.youBox}>
            <Text style={styles.youLabel}>YOUR RANK</Text>
            <Text style={styles.youValue}>#{board.you.rank.toLocaleString("en-IN")}</Text>
            <Text style={styles.youScore}>
              {board.you.score.toLocaleString("en-IN")} points
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={brand.accent} />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.loadingBox}>
            <Text style={styles.empty}>
              Nobody has played in this window yet. Be the first.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map((row) => (
              <View
                key={`${row.playerId}-${row.rank}`}
                style={[styles.row, row.isYou && styles.rowYou]}
              >
                <Text style={[styles.rank, row.rank <= 3 && styles.rankTop]}>
                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}
                </Text>

                <View style={styles.nameCol}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.name}
                    {row.isYou ? " (you)" : ""}
                  </Text>
                  {row.city ? (
                    <Text style={styles.city}>{row.city}</Text>
                  ) : null}
                </View>

                <Text style={styles.score}>{row.score.toLocaleString("en-IN")}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    color: brand.white,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  sub: { color: brand.muted, fontSize: 12, textAlign: "center", marginTop: 4 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: brand.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  tabActive: { backgroundColor: brand.accent, borderColor: brand.accent },
  tabText: { color: brand.textDim, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: brand.white },
  youBox: {
    margin: 16,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: brand.surfaceAlt,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.accent,
  },
  youLabel: { color: brand.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  youValue: { color: brand.gold, fontSize: 26, fontWeight: "900" },
  youScore: { color: brand.muted, fontSize: 12 },
  list: { paddingHorizontal: 16, gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: brand.border,
  },
  rowYou: { borderColor: brand.accent, backgroundColor: brand.surfaceAlt },
  rank: { width: 40, fontSize: 14, fontWeight: "900", color: brand.muted },
  rankTop: { fontSize: 18 },
  nameCol: { flex: 1 },
  name: { color: brand.white, fontSize: 14, fontWeight: "800" },
  city: { color: brand.muted, fontSize: 11 },
  score: { color: brand.gold, fontSize: 15, fontWeight: "900" },
  loadingBox: { padding: 34, alignItems: "center" },
  empty: { color: brand.muted, fontSize: 13, textAlign: "center" },
  error: { color: brand.danger, fontSize: 13, textAlign: "center", padding: 16 },
});