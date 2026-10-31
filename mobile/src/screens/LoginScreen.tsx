import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

/**
 * Sign in.
 *
 * Deliberately short: one field, one button. Every extra step before the first
 * game is a step where a download turns into an uninstall.
 */
export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { login, isSubmitting, error } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const submit = async () => {
    if (!email.trim() || !password) return;
    await login(email, password);
  };

  return (
    <LinearGradient
      colors={[brand.bg, brand.bgAlt, brand.bg]}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>RushArena</Text>
        <Text style={styles.tag}>60 Seconds. One Winner.</Text>

        <View style={styles.card}>
          {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={brand.mutedDark}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={brand.mutedDark}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Pressable
            onPress={submit}
            disabled={isSubmitting || !email.trim() || !password}
            style={({ pressed }) => [
              styles.button,
              (pressed || isSubmitting) && styles.buttonPressed,
              (!email.trim() || !password) && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Signing in..." : "PLAY NOW"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Signup")}
            style={styles.link}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>
              New here? <Text style={styles.linkBold}>Create an account</Text>
            </Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          Free to play. Coins unlock cosmetics and extra games — they are not cashable.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 22, flexGrow: 1 },
  logo: {
    color: brand.accent,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },
  tag: {
    color: brand.muted,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    fontWeight: "600",
  },
  card: {
    marginTop: 32,
    backgroundColor: brand.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: brand.border,
  },
  label: {
    color: brand.textDim,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: brand.bg,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: brand.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: brand.border,
  },
  button: {
    marginTop: 22,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: brand.mutedDark },
  buttonText: { color: brand.white, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  link: { marginTop: 18, alignItems: "center" },
  linkText: { color: brand.muted, fontSize: 13 },
  linkBold: { color: brand.accent, fontWeight: "800" },
  error: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: brand.danger,
  },
  errorText: { color: brand.danger, fontSize: 13, fontWeight: "700" },
  legal: {
    color: brand.mutedDark,
    fontSize: 11,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 1.6,
  },
});