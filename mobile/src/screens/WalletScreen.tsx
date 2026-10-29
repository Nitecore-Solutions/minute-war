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

import { Api, LedgerRow } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { brand, radii } from "../constants/theme";

/**
 * Coin wallet and its ledger.
 *
 * Coins are shown as progression currency, never as money. There is no
 * withdraw path anywhere in the product, and saying so plainly here is
 * deliberate: it is what keeps the app clear of gambling review guidelines.
 */
export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [balance, setBalance] = useState<number | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await Api.wallet(40);
    if (res.data) {
      setBalance(res.data.balance);
      setTotalEarned(res.data.totalEarned);
      setTransactions(res.data.transactions);
      setError(null);
    } else {
      setError(res.error ?? "Could not load your wallet");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
        <Text style={styles.title}>Your coins</Text>

        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>BALANCE</Text>
          <Text style={styles.balance}>
            {balance === null ? "—" : balance.toLocaleString("en-IN")}
          </Text>
          <Text style={styles.earned}>
            {totalEarned.toLocaleString("en-IN")} earned all time
          </Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Coins unlock avatars, themes and extra games. They cannot be
            withdrawn or converted to money.
          </Text>
        </View>

        {user ? (
          <View style={styles.referralBox}>
            <Text style={styles.referralLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.referralCode}>{`MW${user.playerId}`}</Text>
            <Text style={styles.referralHint}>
              A friend entering this at sign-up earns you both coins.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Activity</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={brand.accent} style={{ marginTop: 24 }} />
        ) : transactions.length === 0 ? (
          <Text style={styles.empty}>No coin activity yet. Play a round to earn some.</Text>
        ) : (
          <View style={styles.list}>
            {transactions.map((row) => (
              <View key={row.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowKind}>{friendlyKind(row.kind)}</Text>
                  {row.note ? (
                    <Text style={styles.rowNote} numberOfLines={1}>
                      {row.note}
                    </Text>
                  ) : null}
                  <Text style={styles.rowDate}>{formatDate(row.at)}</Text>
                </View>

                <View style={styles.rowRight}>
                  <Text
                    style={[
                      styles.rowDelta,
                      row.delta >= 0 ? styles.rowPlus : styles.rowMinus,
                    ]}
                  >
                    {row.delta >= 0 ? "+" : ""}
                    {row.delta.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.rowBalance}>
                    {row.balanceAfter.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

/** Turns an internal ledger kind into something a player can read. */
function friendlyKind(kind: string): string {
  const map: Record<string, string> = {
    signup_bonus: "Welcome bonus",
    daily_reward: "Daily login",
    streak_bonus: "Streak bonus",
    game_score: "Daily run",
    friend_win: "Won a challenge",
    friend_loss: "Challenge played",
    invite_bonus: "Friend joined",
    referral_bonus: "Referral",
    tournament_prize: "Battle win",
    ad_reward: "Reward",
    sponsor_reward: "Sponsored bonus",
    admin_credit: "Bonus",
    admin_debit: "Adjustment",
    account_close: "Account closed",
  };
  return map[kind] ?? kind;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(5, 16).replace("T", " ");
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { color: brand.white, fontSize: 24, fontWeight: "900", textAlign: "center" },
  balanceBox: {
    margin: 16,
    padding: 22,
    borderRadius: radii.lg,
    backgroundColor: brand.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  balanceLabel: { color: brand.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  balance: { color: brand.gold, fontSize: 46, fontWeight: "900" },
  earned: { color: brand.muted, fontSize: 12, marginTop: 2 },
  notice: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: "rgba(56,189,248,0.1)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.3)",
  },
  noticeText: { color: brand.info, fontSize: 11, lineHeight: 1.6 },
  referralBox: {
    margin: 16,
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: brand.surfaceAlt,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.accent,
  },
  referralLabel: { color: brand.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  referralCode: { color: brand.accent, fontSize: 26, fontWeight: "900", letterSpacing: 3, marginTop: 4 },
  referralHint: { color: brand.muted, fontSize: 11, marginTop: 6, textAlign: "center" },
  sectionTitle: {
    color: brand.white,
    fontSize: 16,
    fontWeight: "900",
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  list: { paddingHorizontal: 16, gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: brand.border,
  },
  rowInfo: { flex: 1 },
  rowKind: { color: brand.white, fontSize: 13, fontWeight: "800" },
  rowNote: { color: brand.muted, fontSize: 11 },
  rowDate: { color: brand.mutedDark, fontSize: 10, marginTop: 1 },
  rowRight: { alignItems: "flex-end" },
  rowDelta: { fontSize: 15, fontWeight: "900" },
  rowPlus: { color: brand.success },
  rowMinus: { color: brand.danger },
  rowBalance: { color: brand.mutedDark, fontSize: 10 },
  empty: { color: brand.muted, fontSize: 13, textAlign: "center", padding: 24 },
  error: { color: brand.danger, fontSize: 13, textAlign: "center", padding: 16 },
});