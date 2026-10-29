import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
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
import { webUrl } from "../services/api";
import { brand, radii } from "../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Signup">;

const CITIES = [
  "Jaipur", "Delhi", "Mumbai", "Bengaluru", "Chennai", "Kolkata",
  "Lucknow", "Pune", "Ahmedabad", "Hyderabad", "Kochi", "Indore",
];

/**
 * Sign up.
 *
 * Email + name + password only. No SMS, no OTP, no email verification before
 * playing: a 6-digit player ID is assigned immediately. Verification can be
 * added later without changing this flow, because the account already exists
 * and only needs an extra column.
 */
export default function SignupScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { signup, isSubmitting, error } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [referral, setReferral] = useState(route.params?.referralCode ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);

    // Checked here as well as on the server so the user is not made to wait
    // for a round trip to be told the obvious.
    if (name.trim().length < 2) return setLocalError("Enter your name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setLocalError("Enter a valid email");
    if (password.length < 8) return setLocalError("Use at least 8 characters");

    await signup({
      name: name.trim(),
      email: email.trim(),
      password,
      city: city ?? undefined,
      referralCode: referral.trim() || undefined,
    });
  };

  const message = localError ?? error;

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>You get 500 coins to start. Takes 20 seconds.</Text>

          {message ? (
            <View style={styles.error}>
              <Text style={styles.errorText}>{message}</Text>
            </View>
          ) : null}

          <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.label}>City (helps with local leaderboards)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {CITIES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setCity(city === option ? null : option)}
                style={[styles.chip, city === option && styles.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, city === option && styles.chipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Field
            label="Referral code (optional)"
            value={referral}
            onChangeText={setReferral}
            placeholder="Friend's code"
            autoCapitalize="characters"
            maxLength={12}
          />

          <Pressable
            onPress={submit}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Creating..." : "CREATE ACCOUNT"}
            </Text>
          </Pressable>

          <Text style={styles.legal}>
            By creating an account you agree to the{" "}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(webUrl("/terms"))}
              accessibilityRole="link"
            >
              Terms of Use
            </Text>{" "}
            and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(webUrl("/privacy"))}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({
  label,
  value,
  onChangeText,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={brand.mutedDark}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 22 },
  back: { marginBottom: 16 },
  backText: { color: brand.muted, fontSize: 14, fontWeight: "700" },
  title: { color: brand.text, fontSize: 24, fontWeight: "900" },
  sub: { color: brand.muted, fontSize: 13, marginTop: 6 },
  label: {
    color: brand.textDim,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: brand.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: brand.border,
  },
  chips: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: brand.accent, borderColor: brand.accent },
  chipText: { color: brand.textDim, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: brand.white },
  button: {
    marginTop: 26,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: brand.mutedDark },
  buttonText: { color: brand.white, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  legal: {
    color: brand.mutedDark,
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: "center",
    marginTop: 14,
  },
  legalLink: { color: brand.gold, textDecorationLine: "underline" },
  error: {
    marginTop: 16,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: radii.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: brand.danger,
  },
  errorText: { color: brand.danger, fontSize: 13, fontWeight: "700" },
});