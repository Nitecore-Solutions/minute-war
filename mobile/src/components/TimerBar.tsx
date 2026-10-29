import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { brand, radii } from "../constants/theme";

/**
 * The countdown ring used by every timed game.
 *
 * Animation is driven by requestAnimationFrame against a wall-clock deadline
 * rather than by decrementing a counter on an interval. Intervals drift and
 * pause with the app, which would let a timer run long; measuring from
 * `Date.now()` means a backgrounded or throttled game still ends on time.
 */
export default function TimerBar({
  remainingMs,
  totalMs,
  height = 10,
}: {
  remainingMs: number;
  totalMs: number;
  height?: number;
}) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;

  // Green, then amber, then red. The last three seconds use a pulse so the
  // urgency is felt without reading the number.
  const color =
    fraction > 0.5 ? brand.success : fraction > 0.25 ? brand.warning : brand.danger;

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgent = seconds <= 3 && remainingMs > 0;

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${fraction * 100}%`,
              height,
              borderRadius: height / 2,
              backgroundColor: color,
            },
          ]}
        />
      </View>

      <Text style={[styles.seconds, { color }, urgent && styles.urgent]}>
        {seconds}s
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  track: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  fill: {},
  seconds: {
    fontSize: 15,
    fontWeight: "900",
    minWidth: 38,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  urgent: { fontSize: 19 },
});