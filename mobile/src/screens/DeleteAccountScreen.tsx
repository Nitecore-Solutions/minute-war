import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "DeleteAccount">;

/**
 * In-app account deletion.
 *
 * Google Play requires both an in-app path and a public web path. The web form
 * lives on the Render site; this screen calls the same endpoint with the
 * bearer token and asks for the password again so a borrowed unlocked phone
 * cannot destroy the account.
 */
export default function DeleteAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { deleteAccount } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = password.length > 0 && confirmation === "DELETE" && !busy;

  const submit = async () => {
    if (!canDelete) {
      setError("Enter your password and type DELETE to confirm.");
      return;
    }

    setBusy(true);
    setError(null);

    const res = await deleteAccount(password);

    if (!res.ok) {
      setError(res.error ?? "Could not delete your account. Please try again.");
      setBusy(false);
      return;
    }

    setBusy(false);
    Alert.alert(
      "Account deleted",
      "Your account and personal data have been removed. You have been signed out.",
      [{ text: "OK" }]
    );
  };

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Text style={styles.title}>Delete account</Text>
          <Text style={styles.lead}>
            This permanently closes your RushArena account. It cannot be undone.
          </Text>

          <View style={styles.warning}>
            <Text style={styles.warningTitle}>You will lose</Text>
            <Text style={styles.warningItem}>• Your coins, badges and streak</Text>
            <Text style={styles.warningItem}>• Your leaderboard history</Text>
            <Text style={styles.warningItem}>• Access to this account and email</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your current password"
              placeholderTextColor={brand.mutedDark}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              style={styles.input}
              editable={!busy}
            />

            <Text style={styles.label}>
              Type <Text style={styles.deleteWord}>DELETE</Text> to confirm
            </Text>
            <TextInput
              value={confirmation}
              onChangeText={(value) => setConfirmation(value.toUpperCase())}
              placeholder="DELETE"
              placeholderTextColor={brand.mutedDark}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              style={styles.input}
              editable={!busy}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void submit()}
              disabled={!canDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                !canDelete && styles.disabled,
                pressed && canDelete && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canDelete, busy }}
            >
              {busy ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <Text style={styles.deleteButtonText}>Delete my account</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Need help? Email support@minutewar.in from the address on the account.
            Never send your password by email.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 18 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 16 },
  backText: { color: brand.muted, fontSize: 13, fontWeight: "800" },
  title: {
    color: brand.white,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 12,
  },
  lead: {
    color: brand.textDim,
    fontSize: 14,
    lineHeight: 1.6,
    marginTop: 8,
    marginBottom: 20,
  },
  warning: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 16,
  },
  warningTitle: {
    color: brand.danger,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  warningItem: { color: "#fecaca", fontSize: 13, lineHeight: 1.6 },
  card: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radii.lg,
    padding: 16,
  },
  label: { color: brand.textDim, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  deleteWord: { color: brand.danger, fontWeight: "900" },
  input: {
    backgroundColor: brand.bg,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radii.md,
    color: brand.white,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: "#fecaca", fontSize: 12, fontWeight: "700", lineHeight: 1.5 },
  deleteButton: {
    backgroundColor: brand.danger,
    borderRadius: radii.md,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  deleteButtonText: { color: brand.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  footnote: {
    color: brand.mutedDark,
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: "center",
    marginTop: 18,
  },
});
