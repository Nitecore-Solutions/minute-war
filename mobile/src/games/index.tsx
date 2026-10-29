import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { Api, PublicQuestion } from "../services/api";
import { useCountdown } from "../hooks/useTimer";
import { brand, radii } from "../constants/theme";
import TimerBar from "../components/TimerBar";
import CelebCloseupGame from "./CelebCloseupGame";
import type { GameProps } from "./types";

export type { GameProps } from "./types";

/**
 * The six mini games.
 *
 * All of them share one contract: given a duration, play until time is up,
 * then report a score. That is what lets the daily run and quick play drive
 * them identically instead of maintaining two copies of each mechanic.
 *
 * TRUST MODEL
 * -----------
 * Reaction, tap, colour-switch, memory and celeb close-up compute their scores
 * on the device, because the physics of a tap cannot live on a server. A
 * modified client could therefore claim a higher score for those. The server
 * clamps every score to the game's declared max_score.
 *
 * The quiz is different: it reports which questions were served, and the
 * server re-grades them from its own answer key. A modified client gains
 * nothing from lying about a quiz score.
 *
 * If coin value per game ever rises enough to matter, that is where server
 * side verification belongs. This is called out in the schema and the API for
 * exactly that reason.
 */

// ---------------------------------------------------------------------------
// India Quiz
// ---------------------------------------------------------------------------
export function QuizGame({ durationMs, onFinish, onScoreChange, code = "india-quiz" }: GameProps & { code?: string }) {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number[]>([]);

  const scoreRef = useRef(0);

  useEffect(() => {
    Api.questions(code, 10).then((res) => {
      setQuestions(res.data?.questions ?? []);
    });
  }, [code]);

  const finish = useCallback(() => {
    onFinish(scoreRef.current, { served: answered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFinish]);

  const { remainingMs, running } = useCountdown(durationMs, finish, questions.length > 0);

  const choose = (optionIndex: number) => {
    if (picked !== null || !running) return;

    // The client cannot know the answer, so it awards the face value locally
    // for feedback only. The server re-grades from its own key on submit, and
    // that is the number that decides coins.
    const question = questions[index];
    const points = question?.points ?? 100;

    scoreRef.current += points;
    onScoreChange?.(scoreRef.current);
    setAnswered((prev) => [...prev, question?.id].filter(Boolean) as number[]);

    setPicked(optionIndex);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    setTimeout(() => {
      setPicked(null);
      setIndex((i) => i + 1);
    }, 200);
  };

  if (questions.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={brand.gold} />
        <Text style={styles.loading}>Loading questions...</Text>
      </View>
    );
  }

  const question = questions[index];

  if (!question) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Finishing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View style={styles.quizMeta}>
        <Text style={styles.quizCount}>
          Question {index + 1}/{questions.length}
        </Text>
        <Text style={styles.quizScore}>⭐ {scoreRef.current.toLocaleString("en-IN")}</Text>
      </View>

      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />

      <ScrollView contentContainerStyle={styles.quizContent}>
        <Text style={styles.question}>{question.prompt}</Text>

        <View style={styles.options}>
          {question.options.map((option, i) => (
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
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reaction Rush
// ---------------------------------------------------------------------------
type ReactionPhase = "wait" | "go" | "early" | "done";

export function ReactionGame({ durationMs, onFinish, onScoreChange }: GameProps) {
  const [phase, setPhase] = useState<ReactionPhase>("wait");
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const goAtRef = useRef(0);
  const scoreRef = useRef(0);
  const lastMsRef = useRef<number | null>(null);
  const falseStartsRef = useRef(0);
  const finishedRef = useRef(false);

  const { remainingMs } = useCountdown(
    durationMs,
    () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setPhase("done");
      onFinish(scoreRef.current, {
        lastMs: lastMsRef.current,
        falseStarts: falseStartsRef.current,
      });
    },
    true
  );

  // Schedule the next "go" only when the wait begins. This effect used to
  // depend on remainingMs, which re-ran it every 100 ms and kept cancelling
  // the random timeout before it could turn the pad green.
  useEffect(() => {
    if (phase !== "wait") return;

    const delay = 800 + Math.random() * 2600;
    const timer = setTimeout(() => {
      if (finishedRef.current) return;
      goAtRef.current = Date.now();
      setPhase("go");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, delay);

    return () => clearTimeout(timer);
  }, [phase]);

  // A false start costs a short pause and the current round, not the whole
  // run. Ending at zero on an accidental tap made the game feel broken.
  useEffect(() => {
    if (phase !== "early") return;
    const timer = setTimeout(() => {
      if (!finishedRef.current) setPhase("wait");
    }, 700);
    return () => clearTimeout(timer);
  }, [phase]);

  const tap = () => {
    if (finishedRef.current || phase === "done" || phase === "early") return;

    if (phase === "wait") {
      falseStartsRef.current += 1;
      setPhase("early");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    const ms = Math.max(0, Date.now() - goAtRef.current);
    lastMsRef.current = ms;
    setLastMs(ms);

    // An exponential curve rather than a linear one: the difference between
    // 200ms and 300ms matters far more to a player than 900ms and 1000ms.
    const gained = Math.max(50, Math.round(1000 * Math.exp(-ms / 450)));
    scoreRef.current += gained;
    setScore(scoreRef.current);
    onScoreChange?.(scoreRef.current);

    setPhase("wait");
  };

  return (
    <View style={styles.body}>
      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />

      <Pressable
        onPress={tap}
        style={({ pressed }) => [
          styles.pad,
          phase === "go" && styles.padGo,
          phase === "early" && styles.padEarly,
          phase === "done" && styles.padDone,
          pressed && phase !== "early" && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Reaction pad"
        accessibilityHint="Wait for the pad to turn green, then tap"
      >
        <Text style={styles.padLabel}>
          {phase === "go"
            ? "TAP NOW!"
            : phase === "early"
              ? "TOO SOON!"
              : phase === "done"
                ? "TIME UP"
                : "WAIT FOR GREEN"}
        </Text>
        <Text style={styles.padSub}>
          {phase === "early"
            ? "Wait for the green pad"
            : `⭐ ${score.toLocaleString("en-IN")}`}
        </Text>
        {lastMs !== null && phase !== "early" ? (
          <Text style={styles.padLast}>
            {lastMs} ms · {falseStartsRef.current} false start
            {falseStartsRef.current === 1 ? "" : "s"}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tap Master
// ---------------------------------------------------------------------------
export function TapGame({ durationMs, onFinish, onScoreChange }: GameProps) {
  const [taps, setTaps] = useState(0);
  const tapsRef = useRef(0);

  const { remainingMs, running } = useCountdown(
    durationMs,
    () => onFinish(tapsRef.current, { taps: tapsRef.current }),
    true
  );

  const tap = () => {
    if (!running) return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    onScoreChange?.(tapsRef.current * 10);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View style={styles.body}>
      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />

      <View style={styles.tapArea}>
        <Text style={styles.tapCount}>{taps}</Text>
        <Text style={styles.tapLabel}>TAPS</Text>
      </View>

      <Pressable
        onPress={tap}
        style={({ pressed }) => [styles.tapButton, pressed && styles.tapButtonPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.tapButtonText}>TAP!</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Color Switch — Stroop effect
// ---------------------------------------------------------------------------
const SWITCH_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"] as const;
const SWITCH_NAMES = ["RED", "BLUE", "GREEN", "YELLOW"] as const;

export function ColorSwitchGame({ durationMs, onFinish, onScoreChange }: GameProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const [inkIndex, setInkIndex] = useState(0);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const { remainingMs, running } = useCountdown(
    durationMs,
    () => onFinish(scoreRef.current, { correct: scoreRef.current / 100 }),
    true
  );

  const next = useCallback(() => {
    setWordIndex(Math.floor(Math.random() * SWITCH_NAMES.length));
    setInkIndex(Math.floor(Math.random() * SWITCH_NAMES.length));
  }, []);

  // The pair changes on its own roughly once a second, so the player has to
  // keep re-reading rather than lock onto one answer.
  useEffect(() => {
    const timer = setInterval(next, 1100);
    return () => clearInterval(timer);
  }, [next]);

  const tap = () => {
    if (!running) return;

    if (wordIndex === inkIndex) {
      scoreRef.current += 100;
      setScore(scoreRef.current);
      onScoreChange?.(scoreRef.current);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      // A wrong tap costs points, so mashing is a losing strategy.
      scoreRef.current = Math.max(0, scoreRef.current - 50);
      setScore(scoreRef.current);
      onScoreChange?.(scoreRef.current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    next();
  };

  return (
    <View style={styles.body}>
      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />
      <Text style={styles.scoreLine}>⭐ {score.toLocaleString("en-IN")}</Text>

      <Pressable
        onPress={tap}
        style={({ pressed }) => [styles.stroopPad, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.stroopWord, { color: SWITCH_COLORS[inkIndex] }]}>
          {SWITCH_NAMES[wordIndex]}
        </Text>
        <Text style={styles.stroopHint}>Tap only if the word matches its colour</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Memory Master
// ---------------------------------------------------------------------------
const MEMORY_FACES = ["🍎", "🍌", "🍇", "🍉", "🍊", "🥝", "🍓", "🥑"];

interface Card {
  id: number;
  face: string;
  up: boolean;
  done: boolean;
}

export function MemoryGame({ durationMs, onFinish, onScoreChange }: GameProps) {
  const [cards, setCards] = useState<Card[]>(() => buildDeck());
  const [matches, setMatches] = useState(0);

  const cardsRef = useRef(cards);
  const firstRef = useRef<number | null>(null);
  const lockRef = useRef(false);
  const pairsRef = useRef(0);
  const finishedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    onScoreChange?.(pairsRef.current * 250);
    onFinish(pairsRef.current * 250, { pairs: pairsRef.current });
  }, [onFinish, onScoreChange]);

  const { remainingMs, pause } = useCountdown(durationMs, finish, true);

  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    []
  );

  const updateCards = useCallback((updater: (prev: Card[]) => Card[]) => {
    const next = updater(cardsRef.current);
    cardsRef.current = next;
    setCards(next);
  }, []);

  const flip = (id: number) => {
    if (lockRef.current || finishedRef.current) return;

    const card = cardsRef.current[id];
    if (!card || card.done || card.up) return;

    const first = firstRef.current;

    if (first === null) {
      firstRef.current = id;
      updateCards((prev) => prev.map((c) => (c.id === id ? { ...c, up: true } : c)));
      return;
    }

    if (first === id) return;

    const firstCard = cardsRef.current[first];
    if (!firstCard || firstCard.done) {
      firstRef.current = null;
      return;
    }

    lockRef.current = true;

    // The pair has to be visible before it resolves, so the player can see the
    // second choice. The first card was already turned face-up by its tap.
    updateCards((prev) => prev.map((c) => (c.id === id ? { ...c, up: true } : c)));

    const isMatch = firstCard.face === card.face;

    // A shorter reveal for a match keeps the flow fast; a longer one for a
    // miss is what makes the mistake legible.
    revealTimerRef.current = setTimeout(
      () => {
        revealTimerRef.current = null;
        if (finishedRef.current) return;

        if (isMatch) {
          pairsRef.current += 1;
          setMatches(pairsRef.current);
          onScoreChange?.(pairsRef.current * 250);
          updateCards((prev) =>
            prev.map((c) =>
              c.id === id || c.id === first ? { ...c, done: true, up: true } : c
            )
          );
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          // This was the bug that made the board unplayable: a miss left both
          // cards face-up and flagged as already flipped, so they could never
          // be selected again. Turn them back over before releasing the lock.
          updateCards((prev) =>
            prev.map((c) =>
              c.id === id || c.id === first ? { ...c, up: false } : c
            )
          );
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }

        firstRef.current = null;
        lockRef.current = false;

        if (pairsRef.current === MEMORY_FACES.length) {
          pause();
          finish();
        }
      },
      isMatch ? 240 : 680
    );
  };

  return (
    <View style={styles.body}>
      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />
      <Text style={styles.scoreLine}>
        ⭐ {(matches * 250).toLocaleString("en-IN")} · {matches}/{MEMORY_FACES.length} pairs
      </Text>

      <View style={styles.memoryGrid}>
        {cards.map((card) => (
          <Pressable
            key={card.id}
            onPress={() => flip(card.id)}
            style={[
              styles.memoryCard,
              card.up && styles.memoryCardUp,
              card.done && styles.memoryCardDone,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Card ${card.id + 1}, ${
              card.done ? `matched ${card.face}` : card.up ? card.face : "face down"
            }`}
          >
            <Text style={styles.memoryFace}>{card.up ? card.face : "?"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function buildDeck(): Card[] {
  const faces = [...MEMORY_FACES, ...MEMORY_FACES];

  // Fisher-Yates: the old sort(() => Math.random() - 0.5) shuffles unevenly,
  // which can leave pairs clustered together.
  for (let i = faces.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }

  return faces.map((face, i) => ({ id: i, face, up: false, done: false }));
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
/**
 * Maps a game code to its renderer. The daily run and quick play both go
 * through this, so adding a game is one entry here plus a component.
 */
export function renderGame(code: string, props: GameProps): React.ReactElement {
  switch (code) {
    case "india-quiz":
      return <QuizGame {...props} />;
    case "reaction-rush":
      return <ReactionGame {...props} />;
    case "tap-master":
      return <TapGame {...props} />;
    case "color-switch":
      return <ColorSwitchGame {...props} />;
    case "memory-master":
      return <MemoryGame {...props} />;
    case "celeb-closeup":
      return <CelebCloseupGame {...props} />;
    default:
      return <UnknownGame {...props} />;
  }
}

function UnknownGame({ durationMs, onFinish }: GameProps) {
  useCountdown(durationMs, () => onFinish(0, {}), true);
  return (
    <View style={styles.center}>
      <Text style={styles.loading}>This game is not installed yet.</Text>
      <Text style={styles.loading}>Pull down to refresh on the home screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  loading: { color: brand.white, fontSize: 15, fontWeight: "800", textAlign: "center" },

  quizMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  quizCount: { color: brand.white, fontSize: 13, fontWeight: "800" },
  quizScore: { color: brand.gold, fontSize: 13, fontWeight: "900" },
  quizContent: { flexGrow: 1, paddingTop: 18 },
  question: {
    color: brand.white,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 28,
    marginBottom: 20,
    textAlign: "center",
  },
  options: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.34)",
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },
  optionPicked: { borderColor: brand.gold, backgroundColor: "rgba(251,191,36,0.18)" },
  optionLetter: { color: brand.gold, fontSize: 16, fontWeight: "900", width: 22 },
  optionText: { color: brand.white, fontSize: 15, fontWeight: "700", flex: 1 },

  pad: {
    flex: 1,
    marginTop: 18,
    borderRadius: radii.xl,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.2)",
  },
  padGo: { backgroundColor: brand.success, borderColor: "#bbf7d0" },
  padEarly: { backgroundColor: brand.danger, borderColor: "#fecaca" },
  padDone: { backgroundColor: "rgba(0,0,0,0.55)" },
  padLabel: { color: brand.white, fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  padSub: { color: "rgba(255,255,255,0.85)", fontSize: 15, marginTop: 12, fontWeight: "800" },
  padLast: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 8, fontWeight: "700" },

  tapArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  tapCount: { color: brand.white, fontSize: 80, fontWeight: "900" },
  tapLabel: { color: brand.muted, fontSize: 13, fontWeight: "900", letterSpacing: 3 },
  tapButton: {
    backgroundColor: brand.accent,
    borderRadius: radii.lg,
    paddingVertical: 22,
    alignItems: "center",
    marginBottom: 18,
  },
  tapButtonPressed: { transform: [{ scale: 0.97 }] },
  tapButtonText: { color: brand.white, fontSize: 24, fontWeight: "900", letterSpacing: 2 },

  scoreLine: {
    color: brand.gold,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 14,
  },
  stroopPad: {
    flex: 1,
    marginTop: 16,
    marginBottom: 18,
    borderRadius: radii.xl,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  stroopWord: { fontSize: 44, fontWeight: "900", letterSpacing: 3 },
  stroopHint: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 24, fontWeight: "700" },

  memoryGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    marginBottom: 18,
    alignContent: "center",
    justifyContent: "center",
  },
  memoryCard: {
    width: "22%",
    aspectRatio: 1,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: brand.border,
  },
  memoryCardUp: { backgroundColor: "rgba(255,255,255,0.14)" },
  memoryCardDone: { backgroundColor: "rgba(34,197,94,0.3)", borderColor: brand.success },
  memoryFace: { fontSize: 26 },

  pressed: { opacity: 0.88 },
});