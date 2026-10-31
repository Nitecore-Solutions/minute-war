import React, { useCallback, useEffect, useState } from "react";
import {
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

import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { BATTLES_ENABLED } from "../config/features";
import { Api, DailyRun, MiniGame } from "../services/api";
import { brand, categories, radii } from "../constants/theme";
import GameCard from "../components/GameCard";
import CoinPill from "../components/CoinPill";
import AdBanner from "../components/AdBanner";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, wallet, streak, refresh } = useAuth();
  const { online, connected } = useRealtime();

  const [daily, setDaily] = useState<DailyRun | null>(null);
  const [allGames, setAllGames] = useState<MiniGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [dailyRes, gamesRes] = await Promise.all([Api.daily(), Api.games()]);

    if (dailyRes.data) {
      setDaily(dailyRes.data);
      setError(null);
    } else {
      setError(dailyRes.error ?? "Could not load today's challenge");
    }

    if (gamesRes.data) setAllGames(gamesRes.data.games);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void refresh();
  }, [load, refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  }, [load, refresh]);

  const playGame = (game: MiniGame, inRun: boolean) => {
    navigation.navigate("Game", {
      code: game.code,
      name: game.name,
      emoji: game.emoji,
      durationSeconds: game.durationSeconds,
      colorFrom: game.colorFrom,
      colorTo: game.colorTo,
      inRun,
    });
  };

  // Free-play list: every enabled game, so a player is never bored even after
  // the daily run is done.
  const freeGames: MiniGame[] = daily
    ? allGames.length > 0
      ? allGames
      : daily.games
    : [];

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.accent}
            colors={[brand.accent]}
          />
        }
      >
        {/* header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.trim()?.[0]?.toUpperCase() ?? "P"}
            </Text>
          </View>

          <View style={styles.brandWrap}>
            <Text style={styles.brand} numberOfLines={1}>RushArena</Text>
            <View style={styles.statusLine}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: connected ? brand.success : brand.mutedDark },
                ]}
              />
              <Text style={styles.statusText} numberOfLines={1}>
                {BATTLES_ENABLED
                  ? connected
                    ? `${online} online`
                    : "connecting..."
                  : "Solo play"}
                {user ? ` · ID ${user.playerId}` : ""}
              </Text>
            </View>
          </View>

          <CoinPill
            balance={wallet?.balance ?? 0}
            streak={streak.current}
            onPress={() => navigation.getParent()?.navigate("WalletTab" as never)}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh} style={styles.retry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* daily challenge */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🔥 Daily Challenge</Text>
            {daily ? (
              <Text style={styles.sectionMeta}>{daily.playersToday} played today</Text>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.skeleton}>
              <Text style={styles.skeletonText}>Loading today's games...</Text>
            </View>
          ) : daily && daily.games.length > 0 ? (
            <>
              <View style={styles.dailyGames}>
                {daily.games.slice(0, 3).map((game) => (
                  <GameCard
                    key={game.code}
                    title={game.name}
                    emoji={game.emoji}
                    from={game.colorFrom}
                    to={game.colorTo}
                    subtitle={`${game.durationSeconds}s`}
                    locked={game.isPremium && !user?.isPremium}
                    onPress={() => playGame(game, true)}
                  />
                ))}
              </View>

              <Pressable
                onPress={() => navigation.navigate("DailyRun")}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>
                  {daily.alreadyPlayed ? "PLAY AGAIN · BEAT YOUR SCORE" : "START DAILY RUN · 3 GAMES"}
                </Text>
              </Pressable>

              {daily.alreadyPlayed ? (
                <Text style={styles.bestLine}>
                  Your best today:{" "}
                  <Text style={styles.bestValue}>{daily.yourBest.toLocaleString("en-IN")}</Text>
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.skeleton}>
              <Text style={styles.skeletonText}>No games are available right now.</Text>
            </View>
          )}
        </View>

        <AdBanner placement="home_banner" label="AD" style={styles.ad} />

        {/* free play */}
        {freeGames.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚡ Quick Play</Text>
            <Text style={styles.sectionMeta}>One game, no daily limit</Text>

            <View style={styles.grid}>
              {freeGames.map((game) => (
                <GameCard
                  key={game.code}
                  title={game.name}
                  emoji={game.emoji}
                  from={game.colorFrom || categories[game.category]?.from}
                  to={game.colorTo || categories[game.category]?.to}
                  subtitle={game.tagline ?? `${game.durationSeconds}s`}
                  locked={game.isPremium && !user?.isPremium}
                  style={styles.quickCard}
                  onPress={() => playGame(game, false)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <AdBanner placement="between_games" label="SPONSORED" style={styles.ad} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: brand.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: brand.white, fontSize: 19, fontWeight: "900" },
  brandWrap: { flex: 1 },
  brand: { color: brand.white, fontSize: 17, fontWeight: "900", letterSpacing: 1.2 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: brand.muted, fontSize: 11, fontWeight: "600" },
  errorBox: {
    margin: 16,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: brand.danger,
  },
  errorText: { color: brand.danger, fontSize: 13, fontWeight: "700" },
  retry: { marginTop: 8, alignSelf: "flex-start" },
  retryText: {
    color: brand.danger,
    fontWeight: "900",
    fontSize: 13,
    // Styled here rather than via textDecoration because StyleSheet.create
    // infers this entry as a ViewStyle from `retry` being a View.
    textDecorationLine: "underline",
  },
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { color: brand.text, fontSize: 16, fontWeight: "900" },
  sectionMeta: { color: brand.muted, fontSize: 11, fontWeight: "600" },
  dailyGames: { flexDirection: "row", gap: 10, marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  // 48%, not 50%: with the 10px gap this wraps into two columns even on a
  // 320px-wide screen, where the sibling percentage plus the gap would tip a
  // fraction over the row and drop to one card per line.
  quickCard: { flexBasis: "48%" },
  primaryButton: {
    marginTop: 14,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: { color: brand.white, fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
  pressed: { opacity: 0.85 },
  bestLine: { color: brand.muted, fontSize: 12, textAlign: "center", marginTop: 10 },
  bestValue: { color: brand.gold, fontWeight: "900" },
  skeleton: {
    marginTop: 12,
    padding: 24,
    borderRadius: radii.md,
    backgroundColor: brand.surface,
    alignItems: "center",
  },
  skeletonText: { color: brand.muted, fontSize: 13 },
  ad: { marginHorizontal: 16, marginTop: 20, backgroundColor: "rgba(255,255,255,0.03)" },
});