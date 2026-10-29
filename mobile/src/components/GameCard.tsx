import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { brand, radii } from "../constants/theme";

interface Props {
  title: string;
  emoji: string;
  from: string;
  to: string;
  subtitle?: string;
  locked?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  onPress: () => void;
}

/**
 * The game tile on the home screen.
 *
 * Locked and disabled are separate: locked means Premium, which is
 * upsellable, while disabled means the admin switched the game off, which is
 * not something to sell.
 */
export default function GameCard({
  title,
  emoji,
  from,
  to,
  subtitle,
  locked,
  disabled,
  style,
  onPress,
}: Props) {
  const handle = () => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}${locked ? ", Premium only" : ""}`}
      style={({ pressed }) => [
        styles.press,
        style,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.card}
      >
        {locked ? (
          <View style={styles.lockBadge}>
            <Text style={styles.lockText}>PREMIUM</Text>
          </View>
        ) : null}

        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {disabled ? "Coming soon" : subtitle}
          </Text>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  disabled: { opacity: 0.45 },
  card: {
    flex: 1,
    minHeight: 128,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 4,
  },
  emoji: { fontSize: 38, lineHeight: 46 },
  title: {
    color: brand.white,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  sub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  lockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  lockText: { color: brand.gold, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
});