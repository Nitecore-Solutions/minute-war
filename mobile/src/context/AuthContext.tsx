import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Api, AuthUser, Badge, Streak, Wallet, setToken, getToken } from "../services/api";

/**
 * Session and profile state.
 *
 * On boot the stored token is checked against /auth/me rather than trusted,
 * because a session can be revoked (sign-out, admin action) while the token
 * is still unexpired. Skipping that check is how a banned user keeps playing.
 */

interface AuthContextValue {
  user: AuthUser | null;
  wallet: Wallet | null;
  streak: Streak;
  badges: Badge[];
  /** False until AsyncStorage has been read and /auth/me has been checked. */
  isBooting: boolean;
  isSubmitting: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    city?: string;
    referralCode?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Permanently closes the account, then clears the local session. */
  deleteAccount: (password: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
  /** Applies a balance the server just returned, avoiding a round trip. */
  applyBalance: (balance: number) => void;
  /** Applies the full wallet after a run, coin grant or battle. */
  applyWallet: (wallet: Wallet | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "@minutewar_session";

const EMPTY_STREAK: Streak = { current: 0, longest: 0, totalDays: 0 };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [streak, setStreak] = useState<Streak>(EMPTY_STREAK);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- boot: restore token, then confirm it is still valid -----------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const token = stored ? (JSON.parse(stored) as { token: string }).token : null;
        if (!token) return;

        setToken(token);

        const res = await Api.me();
        if (cancelled) return;

        if (res.data) {
          setUser(res.data.user);
          setWallet(res.data.wallet);
          setStreak(res.data.streak ?? EMPTY_STREAK);
          setBadges(res.data.badges ?? []);
        } else {
          setToken(null);
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.warn("[auth] restore failed", err);
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    const res = await Api.me();
    if (res.data) {
      setUser(res.data.user);
      setWallet(res.data.wallet);
      setStreak(res.data.streak ?? EMPTY_STREAK);
      setBadges(res.data.badges ?? []);
    }
  }, []);

  const applyBalance = useCallback((balance: number) => {
    setWallet((prev) => (prev ? { ...prev, balance } : prev));
  }, []);

  const applyWallet = useCallback((next: Wallet | null) => {
    setWallet(next);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true);
    setError(null);

    const res = await Api.login(email.trim().toLowerCase(), password);
    setIsSubmitting(false);

    if (!res.data) {
      setError(res.error ?? "Sign in failed");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return false;
    }

    setToken(res.data.token);
    setUser(res.data.user);
    setWallet(res.data.wallet);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.data.token }));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Pull the streak and badges in the background so the header is correct
    // without making the user wait on a second round trip.
    void refresh();
    return true;
  }, [refresh]);

  const signup = useCallback<AuthContextValue["signup"]>(
    async ({ name, email, password, city, referralCode }) => {
      setIsSubmitting(true);
      setError(null);

      const res = await Api.signup(name, email, password, city, referralCode);
      setIsSubmitting(false);

      if (!res.data) {
        setError(res.error ?? "Could not create your account");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return { ok: false, error: res.error };
      }

      setToken(res.data.token);
      setUser(res.data.user);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.data.token }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      void refresh();
      return { ok: true };
    },
    [refresh]
  );

  /** Clears every local trace of the session without calling the API. */
  const clearSession = useCallback(async () => {
    setToken(null);
    setUser(null);
    setWallet(null);
    setStreak(EMPTY_STREAK);
    setBadges([]);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {
      // A storage failure must not leave the in-memory session alive.
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch {
      // Signing out locally is enough.
    }
    await clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(
    async (password) => {
      const res = await Api.deleteAccount(password);

      if (!res.data?.deleted) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return {
          ok: false,
          error: res.error ?? "Could not delete your account. Please try again.",
        };
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await clearSession();
      return { ok: true };
    },
    [clearSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      wallet,
      streak,
      badges,
      isBooting,
      isSubmitting,
      error,
      login,
      signup,
      logout,
      deleteAccount,
      refresh,
      applyBalance,
      applyWallet,
    }),
    [user, wallet, streak, badges, isBooting, isSubmitting, error, login, signup, logout, deleteAccount, refresh, applyBalance, applyWallet]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};