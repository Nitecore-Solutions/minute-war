import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { brand, radii } from "../constants/theme";

interface Props {
  balance: number;
  streak?: number;
  onPress?: () => void;
}

/**
 * Top-right coin pill.
 *
 * Pops on every change so the user notices coins landing. Silent balance
 * changes read as the app being broken, which matters most right after a run
 * finishes and the user is deciding whether to play again.
 */
export default function CoinPill({ balance, streak, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(balance);

  useEffect(() => {
    if (previous.current === balance) return;
    previous.current = balance;

    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.18,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [balance, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={styles.wrap}>
        <Text style={styles.coin}>🪙</Text>
        <Text style={styles.value}>{balance.toLocaleString("en-IN")}</Text>
        {streak && streak > 0 ? (
          <View style={styles.streak}>
            <Text style={styles.streakText}>🔥{streak}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.45)",
  },
  coin: { fontSize: 14 },
  value: { color: brand.white, fontSize: 15, fontWeight: "800" },
  streak: {
    backgroundColor: brand.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 2,
  },
  streakText: { color: brand.white, fontSize: 10, fontWeight: "900" },
});