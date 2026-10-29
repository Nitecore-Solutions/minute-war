import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { wsUrl, getToken } from "../services/api";
import { BATTLES_ENABLED } from "../config/features";
import { useAuth } from "./AuthContext";

/**
 * The single WebSocket connection.
 *
 * One socket is shared by every screen that needs realtime data rather than
 * each screen opening its own. Multiple sockets on mobile drain the battery
 * and each one would need its own reconnect and heartbeat logic.
 *
 * Reconnection is exponential backoff with jitter. The jitter matters: when the
 * server restarts, every client would otherwise retry at the same instant and
 * hammer it back down.
 */

export type BattleQuestion = {
  code: string;
  index: number;
  total: number;
  questionId: number;
  prompt: string;
  options: string[];
  points: number;
  durationMs: number;
};

export interface RealtimeState {
  connected: boolean;
  online: number;
  /** Live daily leaderboard, pushed by the server. */
  liveBoard: Array<{ rank: number; name: string; playerId: number; score: number }> | null;

  joinBattle: (code: string) => void;
  leaveBattle: () => void;
  answerQuestion: (code: string, questionId: number, answerIndex: number) => void;

  /** Latest question pushed for a battle, or null. */
  battleQuestion: BattleQuestion | null;
  battleCode: string | null;
  battleOpponent: { name: string; score: number } | null;
  /** Set when the battle ends; the screen clears it on dismiss. */
  battleResult: BattleResult | null;
  clearBattle: () => void;
}

export interface BattleResult {
  code: string;
  hostScore: number;
  guestScore: number;
  winnerId: number;
  youWon: boolean;
  players: Array<{ userId: number; name: string; score: number }>;
}

interface RealtimeContextValue extends RealtimeState {
  socket: WebSocket | null;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [liveBoard, setLiveBoard] = useState<RealtimeState["liveBoard"]>(null);

  const [battleQuestion, setBattleQuestion] = useState<BattleQuestion | null>(null);
  const [battleCode, setBattleCode] = useState<string | null>(null);
  const [battleOpponent, setBattleOpponent] = useState<{ name: string; score: number } | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read inside the message handler without making it a dependency, which
  // would tear the socket down on every sign-in.
  const userIdRef = useRef<number | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!BATTLES_ENABLED) return;

    const token = getToken();
    if (!token) return;

    const url = wsUrl(`/?token=${encodeURIComponent(token)}`);
    if (!url) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn("[ws] could not open socket", err);
      scheduleReconnect();
      return;
    }

    socketRef.current = ws;
    setSocket(ws);

    ws.onopen = () => {
      setConnected(true);
      attemptsRef.current = 0;

      // Ask for the live board on connect so the leaderboard screen has data
      // without a separate HTTP call.
      ws.send(JSON.stringify({ type: "leaderboard:subscribe" }));

      clearTimers();
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return; // ignore malformed frames
      }

      switch (msg.type) {
        case "connected":
        case "presence":
          setOnline(Number(msg.online ?? 0));
          break;

        case "leaderboard":
          setLiveBoard(
            Array.isArray(msg.entries)
              ? (msg.entries as RealtimeState["liveBoard"])
              : null
          );
          break;

        case "battle:created":
          setBattleCode(String(msg.code ?? ""));
          break;

        case "battle:joined":
          setBattleCode(String(msg.code ?? ""));
          break;

        case "battle:opponent_joined":
          setBattleOpponent((prev) => ({ name: String(msg.name ?? "Opponent"), score: prev?.score ?? 0 }));
          break;

        case "battle:question":
          setBattleQuestion(msg as unknown as BattleQuestion);
          break;

        case "battle:opponent_scored":
          setBattleOpponent((prev) => ({
            name: prev?.name ?? "Opponent",
            score: Number(msg.theirScore ?? 0),
          }));
          break;

        case "battle:end":
          setBattleResult({
            code: String(msg.code ?? ""),
            hostScore: Number(msg.hostScore ?? 0),
            guestScore: Number(msg.guestScore ?? 0),
            winnerId: Number(msg.winnerId ?? 0),
            // The server reports the winner's id; compare with ours.
            youWon: Number(msg.winnerId ?? 0) === userIdRef.current,
            players: Array.isArray(msg.players) ? (msg.players as BattleResult["players"]) : [],
          });
          break;

        case "battle:left":
          setBattleQuestion(null);
          setBattleCode(null);
          setBattleOpponent(null);
          break;

        default:
          break;
      }
    };

    ws.onerror = () => {
      // onclose always follows, which is where reconnection is handled.
    };

    ws.onclose = () => {
      setConnected(false);
      setSocket(null);
      socketRef.current = null;
      clearTimers();
      scheduleReconnect();
    };

    function scheduleReconnect() {
      // Backoff with jitter so a fleet of clients does not retry in lockstep
      // after the server comes back.
      const base = Math.min(INITIAL_BACKOFF_MS * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
      const delay = base / 2 + Math.random() * (base / 2);
      attemptsRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    }
  }, [clearTimers]);

  // Open a socket only while signed in, and tear it down on sign-out so a
  // revoked token is never left connected. When battles are disabled there is
  // no socket at all, so the rest of the app cannot spend battery retrying an
  // optional service that was never deployed.
  useEffect(() => {
    if (!BATTLES_ENABLED) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setOnline(0);
      setLiveBoard(null);
      setBattleQuestion(null);
      setBattleCode(null);
      setBattleOpponent(null);
      setBattleResult(null);
      return;
    }

    if (!user) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setOnline(0);
      setLiveBoard(null);
      return;
    }

    connect();

    return () => {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user?.id, connect, clearTimers]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const joinBattle = useCallback(
    (code: string) => {
      setBattleResult(null);
      setBattleQuestion(null);
      setBattleOpponent(null);
      send({ type: "battle:join", code });
    },
    [send]
  );

  const leaveBattle = useCallback(() => {
    send({ type: "battle:leave" });
    setBattleQuestion(null);
    setBattleCode(null);
    setBattleOpponent(null);
  }, [send]);

  const answerQuestion = useCallback(
    (code: string, questionId: number, answerIndex: number) => {
      send({ type: "battle:answer", code, questionId, answerIndex });
    },
    [send]
  );

  const clearBattle = useCallback(() => {
    setBattleQuestion(null);
    setBattleCode(null);
    setBattleOpponent(null);
    setBattleResult(null);
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      socket,
      connected,
      online,
      liveBoard,
      joinBattle,
      leaveBattle,
      answerQuestion,
      battleQuestion,
      battleCode,
      battleOpponent,
      battleResult,
      clearBattle,
    }),
    [
      socket,
      connected,
      online,
      liveBoard,
      joinBattle,
      leaveBattle,
      answerQuestion,
      battleQuestion,
      battleCode,
      battleOpponent,
      battleResult,
      clearBattle,
    ]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = () => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
};