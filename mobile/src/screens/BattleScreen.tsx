import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { Api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { brand, radii } from "../constants/theme";
import TimerBar from "../components/TimerBar";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Battle">;

type Phase = "waiting" | "playing" | "result" | "error";

/**
 * A live 1v1 battle.
 *
 * Every question, option and score comes over the WebSocket. The server sends
 * the question WITHOUT the answer key, so a modified client cannot read the
 * right answer off the wire — it has to actually play.
 */
export default function BattleScreen({ route, navigation }: Props) {
  const { code } = route.params;
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();

  const {
    connected,
    battleQuestion,
    battleResult,
    battleOpponent,
    leaveBattle,
    answerQuestion,
    clearBattle,
  } = useRealtime();

  const [phase, setPhase] = useState<Phase>("waiting");
  const [picked, setPicked] = useState<number | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [deadline, setDeadline] = useState<number>(Date.now());
  const [remaining, setRemaining] = useState(0);
  const [status, setStatus] = useState("Waiting for your opponent...");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Guards against a double answer on the same question, which would otherwise
  // be worth farming points.
  const answeredRef = useRef<Set<number>>(new Set());
  const totalRef = useRef(0);

  // --- question loop -----------------------------------------------------
  useEffect(() => {
    if (!battleQuestion) return;

    if (battleQuestion.index === 0) {
      setPhase("playing");
    }

    setPicked(null);
    setDeadline(Date.now() + battleQuestion.durationMs);
  }, [battleQuestion?.questionId, battleQuestion?.index]);

  // --- countdown, measured from a deadline so it survives backgrounding ----
  useEffect(() => {
    if (phase !== "playing") return;

    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      if (left > 0) frame.current = setTimeout(tick, 100);
    };

    const frame = { current: null as ReturnType<typeof setTimeout> | null };
    tick();
    return () => {
      if (frame.current) clearTimeout(frame.current);
    };
  }, [phase, deadline]);

  // --- result ------------------------------------------------------------
  const settle = useCallback(async () => {
    if (submitted) return;
    setSubmitted(true);

    try {
      const res = await Api.acceptChallenge(code, totalRef.current);
      if (!res.data) console.warn("[battle] settle failed", res.error);
    } catch (err) {
      console.warn("[battle] settle error", err);
    } finally {
      await refresh();
    }
  }, [submitted, code, refresh]);

  useEffect(() => {
    if (battleResult) {
      setPhase("result");
      void settle();
    }
  }, [battleResult, settle]);

  // Declared before the early return below, which would otherwise read it as
  // being used before assignment.
  const shareChallenge = useCallback(async () => {
    const res = await Api.createChallenge(totalRef.current, ["india-quiz"]);
    if (res.data) navigation.navigate("Challenge", { code: res.data.code });
  }, [navigation]);

  // Leaving the screen tears the room down server-side, so a stale battle
  // cannot sit waiting forever.
  useEffect(() => {
    return () => {
      leaveBattle();
      clearBattle();
    };
  }, [leaveBattle, clearBattle]);

  const choose = (optionIndex: number) => {
    if (phase !== "playing" || picked !== null) return;
    const question = battleQuestion;
    if (!question) return;
    if (answeredRef.current.has(question.questionId)) return;

    answeredRef.current.add(question.questionId);
    setPicked(optionIndex);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // The provisional local score keeps the UI responsive; the server's grade
    // is what actually settles the challenge.
    totalRef.current += question.points;
    setMyScore(totalRef.current);

    answerQuestion(code, question.questionId, optionIndex);

    setTimeout(() => setPicked(null), 220);
  };

  // --- states ------------------------------------------------------------

  if (phase === "result" && battleResult) {
    return (
      <LinearGradient colors={[brand.bg, brand.bgAlt]} style={styles.root}>
        <View style={[styles.body, { paddingTop: insets.top + 40 }]}>
          <Text style={styles.resultEmoji}>{battleResult.youWon ? "🔥" : "😤"}</Text>
          <Text style={styles.resultTitle}>
            {battleResult.youWon ? "YOU BEAT THEM!" : "YOU LOST THIS ONE"}
          </Text>

          <View style={styles.resultScores}>
            <ScoreRow label="You" score={battleResult.youWon ? battleResult.guestScore : battleResult.hostScore} win={battleResult.youWon} />
            <ScoreRow
              label={battleResult.players[0]?.name ?? "Them"}
              score={battleResult.youWon ? battleResult.hostScore : battleResult.guestScore}
              win={!battleResult.youWon}
            />
          </View>

          <Pressable
            onPress={shareChallenge}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>CHALLENGE THEM BACK</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Back to home</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[brand.bg, brand.bgAlt, brand.bg]} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Leave battle"
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={styles.liveRow}>
          <View style={[styles.dot, { backgroundColor: connected ? brand.success : brand.danger }]} />
          <Text style={styles.liveText}>
            {connected ? "LIVE" : "reconnecting..."}
          </Text>
        </View>
      </View>

      {/* scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.scoreSide}>
          <Text style={styles.scoreLabel}>YOU</Text>
          <Text style={styles.scoreValue}>{myScore.toLocaleString("en-IN")}</Text>
        </View>

        <Text style={styles.vs}>VS</Text>

        <View style={[styles.scoreSide, styles.scoreSideRight]}>
          <Text style={styles.scoreLabel}>
            {battleOpponent?.name?.toUpperCase() ?? "OPPONENT"}
          </Text>
          <Text style={styles.scoreValue}>
            {(battleOpponent?.score ?? 0).toLocaleString("en-IN")}
          </Text>
        </View>
      </View>

      {phase === "waiting" ? (
        <View style={styles.waiting}>
          <ActivityIndicator size="large" color={brand.accent} />
          <Text style={styles.waitingText}>{status}</Text>
          <Text style={styles.waitingHint}>
            Send the link to your opponent if they are not here yet.
          </Text>
        </View>
      ) : battleQuestion ? (
        <View style={styles.playArea}>
          <View style={styles.questionMeta}>
            <Text style={styles.questionCount}>
              {battleQuestion.index + 1}/{battleQuestion.total}
            </Text>
            <Text style={styles.points}>{battleQuestion.points} pts</Text>
          </View>

          <TimerBar remainingMs={remaining} totalMs={battleQuestion.durationMs} />

          <Text style={styles.question}>{battleQuestion.prompt}</Text>

          <View style={styles.options}>
            {battleQuestion.options.map((option, i) => (
              <Pressable
                key={i}
                onPress={() => choose(i)}
                disabled={picked !== null}
                style={({ pressed }) => [
                  styles.option,
                  picked === i && styles.optionPicked,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
                <Text style={styles.optionText} numberOfLines={2}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.waiting}>
          <ActivityIndicator size="large" color={brand.accent} />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </LinearGradient>
  );
}

function ScoreRow({ label, score, win }: { label: string; score: number; win: boolean }) {
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, win && styles.resultLabelWin]}>
        {win ? "🏆 " : ""}
        {label}
      </Text>
      <Text style={[styles.resultScore, win && styles.resultScoreWin]}>
        {score.toLocaleString("en-IN")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  close: { color: brand.white, fontSize: 20, fontWeight: "800" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: brand.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  scoreboard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginTop: 10,
  },
  scoreSide: { flex: 1, alignItems: "flex-start" },
  scoreSideRight: { alignItems: "flex-end" },
  scoreLabel: { color: brand.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  scoreValue: { color: brand.white, fontSize: 30, fontWeight: "900" },
  vs: { color: brand.accent, fontSize: 15, fontWeight: "900" },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  waitingText: { color: brand.white, fontSize: 16, fontWeight: "800", marginTop: 16, textAlign: "center" },
  waitingHint: { color: brand.muted, fontSize: 12, marginTop: 8, textAlign: "center" },
  playArea: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  questionMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  questionCount: { color: brand.white, fontSize: 13, fontWeight: "800" },
  points: { color: brand.gold, fontSize: 13, fontWeight: "900" },
  question: {
    color: brand.white,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 27,
    marginTop: 22,
    marginBottom: 18,
    textAlign: "center",
  },
  options: { gap: 9 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 2,
    borderColor: brand.border,
  },
  optionPicked: { borderColor: brand.gold },
  optionLetter: { color: brand.gold, fontSize: 16, fontWeight: "900", width: 22 },
  optionText: { color: brand.white, fontSize: 14, fontWeight: "700", flex: 1 },
  resultEmoji: { fontSize: 56, textAlign: "center" },
  resultTitle: {
    color: brand.white,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: 1,
  },
  resultScores: {
    marginTop: 28,
    backgroundColor: brand.surface,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: brand.border,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  resultLabel: { color: brand.textDim, fontSize: 15, fontWeight: "800" },
  resultLabelWin: { color: brand.gold },
  resultScore: { color: brand.white, fontSize: 20, fontWeight: "900" },
  resultScoreWin: { color: brand.gold },
  primary: {
    marginTop: 26,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: { color: brand.white, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  secondary: { marginTop: 16, alignItems: "center" },
  secondaryText: { color: brand.muted, fontSize: 13, fontWeight: "800" },
  error: { color: brand.danger, fontSize: 12, textAlign: "center", marginBottom: 12 },
  pressed: { opacity: 0.88 },
});