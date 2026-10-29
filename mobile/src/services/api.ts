/**
 * Backend API client.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL and is baked into the build, so it
 * must be set BEFORE `eas build`. See .env.example.
 *
 * Every response is either { data } or { error, code }. Nothing throws, so
 * screens handle failure by rendering a message rather than a try/catch.
 */

const BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3000/api";

const TOKEN_KEY = "@minutewar_token";

let cachedToken: string | null = null;

export function getToken(): string | null {
  return cachedToken;
}

export function setToken(token: string | null) {
  cachedToken = token;
}

/** Where the WebSocket connects. Falls back to the API host when unset. */
export function wsUrl(path = "/"): string {
  const configured = process.env.EXPO_PUBLIC_WS_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}${path}`;

  try {
    const url = new URL(BASE);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    // The API is on 3000 and the realtime server on 3002.
    const port = url.port === "3000" ? "3002" : url.port;
    return `${proto}//${url.hostname}${port ? `:${port}` : ""}${path}`;
  } catch {
    return "";
  }
}

type Envelope<T> = { data?: T; error?: string; code?: string };

async function request<T>(
  endpoint: string,
  options: RequestInit & { auth?: boolean; idem?: string } = {}
): Promise<{ data?: T; error?: string; code?: string }> {
  const { auth = true, idem, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };

  if (auth && cachedToken) {
    requestHeaders.Authorization = `Bearer ${cachedToken}`;
  }
  if (idem) {
    requestHeaders["Idempotency-Key"] = idem;
  }

  try {
    const res = await fetch(`${BASE}${endpoint}`, { ...rest, headers: requestHeaders });
    const json = (await res.json().catch(() => ({}))) as Envelope<T>;

    if (!res.ok) {
      return {
        error: json.error || `Request failed (${res.status})`,
        code: json.code,
      };
    }
    return { data: json.data };
  } catch (err) {
    // The most common cause by far is the app pointing at an address the phone
    // cannot reach. Say so rather than surfacing a raw socket error.
    const raw = err instanceof Error ? err.message : String(err);
    const isLocalhost = /localhost|127\.0\.0\.1/.test(BASE);

    const hint = isLocalhost
      ? `${BASE} is the phone itself. Set EXPO_PUBLIC_API_URL in mobile/.env to this PC's LAN address.`
      : `Is the backend running, and is the phone on the same network as this PC (${BASE})?`;

    console.warn("[api] network failure", BASE, raw);

    return { error: `Cannot reach the server. ${hint}`, code: "network" };
  }
}

const post = <T,>(p: string, body: unknown, idem?: string) =>
  request<T>(p, { method: "POST", body: JSON.stringify(body), idem });

// --- types -----------------------------------------------------------------

export type AuthUser = {
  id: number;
  playerId: number;
  name: string;
  email: string;
  role: "admin" | "player";
  isPremium: boolean;
  premiumUntil: string | null;
  avatarSeed: number;
};

export type Wallet = {
  balance: number;
  frozen: boolean;
  lifetimeEarned: number;
};

export type Streak = { current: number; longest: number; totalDays: number };

export type Badge = {
  code: string;
  name: string;
  icon: string;
  tier: string;
  earned_at: string;
};

export type MiniGame = {
  code: string;
  name: string;
  emoji: string;
  tagline: string | null;
  category: "fast" | "india" | "memory" | "word";
  durationSeconds: number;
  maxScore: number;
  coinsPer1000: number;
  config: Record<string, unknown>;
  colorFrom: string;
  colorTo: string;
  isPremium: boolean;
};

export type DailyRun = {
  today: string;
  seed: string;
  games: MiniGame[];
  alreadyPlayed: boolean;
  yourBest: number;
  playersToday: number;
};

export type QuestionMedia = {
  eyes?: string;
  nose?: string;
  lips?: string;
  hair?: string;
  reveal?: string;
};

export type PublicQuestion = {
  id: number;
  prompt: string;
  options: string[];
  points: number;
  /** Feature-crop paths for picture quizzes, relative to the API host. */
  media?: QuestionMedia;
  /** Present only for client-graded games that opt into immediate feedback. */
  correctIndex?: number;
};

/**
 * Static files (celebrity crops) live beside /api on the same Next server.
 * EXPO_PUBLIC_API_URL points at /api, so strip exactly that suffix rather
 * than assuming the host is at the origin.
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const root = BASE.replace(/\/api$/, "");
  return `${root}${path.startsWith("/") ? path : `/${path}`}`;
}

export type SubmitResult = {
  runId: number;
  totalScore: number;
  bestGame: number;
  isNewBest: boolean;
  coinsEarned: number;
  coinsAwarded: boolean;
  balance: number;
  percentile: number | null;
  indiaRank: number | null;
  breakdown: Array<{ code: string; score: number; durationMs: number }>;
};

export type ChallengeSummary = {
  code: string;
  direction: "sent" | "received";
  opponentName: string;
  yourScore: number | null;
  theirScore: number | null;
  won: boolean;
  status: string;
  createdAt: string;
  expiresAt: string;
};

export type ChallengeInvite = {
  code: string;
  challengerName: string;
  challengerScore: number;
  status: string;
  expiresAt: string;
  appName: string;
  games: Array<{ code: string; name: string; emoji: string; durationSeconds: number }>;
};

export type LeaderboardRow = {
  rank: number;
  userId: number;
  playerId: number;
  name: string;
  city: string | null;
  score: number;
  runs: number;
  isYou: boolean;
};

export type Leaderboard = {
  scope: string;
  date: string;
  entries: LeaderboardRow[];
  you: { rank: number; score: number } | null;
};

export type LedgerRow = {
  id: number;
  delta: number;
  balanceAfter: number;
  kind: string;
  note: string | null;
  at: string;
};

// --- endpoints -------------------------------------------------------------

export const Api = {
  health: () => request<{ status: string; database: string }>("/health", { auth: false }),

  signup: (
    name: string,
    email: string,
    password: string,
    city?: string,
    referralCode?: string
  ) =>
    post<{
      token: string;
      user: AuthUser;
      signupBonus: number;
      referredBy: number | null;
    }>("/auth/signup", { name, email, password, city, referralCode }),

  login: (email: string, password: string) =>
    post<{
      token: string;
      user: AuthUser;
      wallet: Wallet | null;
      rewards: { dailyLogin: number; streak: number };
    }>("/auth/login", { email, password }),

  me: () =>
    request<{
      user: AuthUser;
      wallet: Wallet | null;
      streak: Streak;
      badges: Badge[];
    }>("/auth/me"),

  logout: () => request<{ signedOut: boolean }>("/auth/logout", { method: "POST" }),

  daily: () => request<DailyRun>("/game/daily"),

  /** Public catalogue, used for Quick Play on the home screen. */
  games: () => request<{ games: MiniGame[] }>("/games", { auth: false }),

  /**
   * Ad placements and unit ids. Public and unauthenticated: the app asks for
   * this before the player has necessarily signed in, and it contains nothing
   * sensitive. Fails soft, so a network problem just means no ads.
   */
  adsConfig: () =>
    request<{
      enabled: boolean;
      placements: Array<{
        id: "home_banner" | "result_banner" | "between_games" | "interstitial_result";
        active: boolean;
        unitId: string | null;
        provider: string;
      }>;
    }>("/ads/config", { auth: false }),

  questions: (code: string, count = 10, seed?: string) =>
    request<{ questions: PublicQuestion[]; total: number }>(
      `/game/questions?code=${encodeURIComponent(code)}&count=${count}${
        seed ? `&seed=${seed}` : ""
      }`
    ),

  submitRun: (seed: string, scores: Array<{ gameCode: string; score: number; durationMs: number }>) =>
    post<SubmitResult>("/game/daily/submit", { seed, scores }, `run:${Date.now()}`),

  challenges: () => request<{ challenges: ChallengeSummary[] }>("/challenges"),

  createChallenge: (score: number, gameCodes: string[]) =>
    post<{ code: string; shareUrl: string; message: string }>(
      "/challenges",
      { score, gameCodes }
    ),

  /** Public: this is what a shared link hits before the player has an account. */
  openChallenge: (code: string) => request<ChallengeInvite>(`/challenges/${code}`, { auth: false }),

  acceptChallenge: (code: string, score: number, runId?: number) =>
    post<{
      won: boolean;
      status: string;
      yourScore: number;
      opponentName: string;
      opponentScore: number;
      margin: number;
      balance: number;
    }>(`/challenges/${code}/accept`, { score, runId }, `accept:${code}:${Date.now()}`),

  leaderboard: (scope: "daily" | "weekly" | "alltime" = "daily", limit = 50) =>
    request<Leaderboard>(`/leaderboard?scope=${scope}&limit=${limit}`),

  wallet: (limit = 30) =>
    request<{
      balance: number;
      frozen: boolean;
      lifetimeEarned: number;
      totalEarned: number;
      totalSpent: number;
      transactions: LedgerRow[];
    }>(`/wallet?limit=${limit}`),
};

export { BASE as API_BASE_URL, TOKEN_KEY };