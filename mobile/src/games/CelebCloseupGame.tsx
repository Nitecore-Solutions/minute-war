import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Api, assetUrl, PublicQuestion } from "../services/api";
import { useCountdown } from "../hooks/useTimer";
import { brand, radii } from "../constants/theme";
import TimerBar from "../components/TimerBar";
import type { GameProps } from "./types";

/**
 * Celeb Close-Up.
 *
 * Four close crops (eyes, nose, lips, hair) cut from one portrait are shown
 * together; pick whose face they belong to. The `media` payload and the
 * `correctIndex` are only sent for games whose config opts into revealAnswer,
 * so this component can grade locally and show the full portrait immediately.
 *
 * Ten questions at 100 points each, with the whole run capped by the game
 * clock. Answering the last question ends the run early; otherwise the shared
 * countdown calls onFinish.
 */

const FEATURES = [
  { key: "eyes", label: "EYES" },
  { key: "nose", label: "NOSE" },
  { key: "lips", label: "LIPS" },
  { key: "hair", label: "HAIR" },
] as const;

export default function CelebCloseupGame({
  durationMs,
  onFinish,
  onScoreChange,
}: GameProps) {
  const insets = useSafeAreaInsets();
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [imagesReady, setImagesReady] = useState(false);

  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const answeredRef = useRef(0);
  const finishedRef = useRef(false);
  const lockedRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    Api.questions("celeb-closeup", 10).then((res) => {
      if (!active) return;

      const loaded = res.data?.questions ?? [];
      if (loaded.length === 0) {
        setError(res.error ?? "No celebrity pictures are available right now.");
        return;
      }
      setQuestions(loaded);
    });

    return () => {
      active = false;
    };
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish(scoreRef.current, {
      correct: correctRef.current,
      answered: answeredRef.current,
    });
  }, [onFinish]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const { remainingMs, running } = useCountdown(
    durationMs,
    finish,
    questions.length > 0 && imagesReady
  );

  // Warm the image cache before the clock starts, then fetch the rest in the
  // background. Without the first-question gate, a slow connection eats the
  // run's 45 seconds while four grey boxes load. The reveal portraits are part
  // of the same set so feedback is instant too.
  useEffect(() => {
    if (questions.length === 0) return;

    const urlsFor = (question: PublicQuestion | undefined) => {
      const media = question?.media;
      if (!media) return [];
      return [media.eyes, media.nose, media.lips, media.hair, media.reveal]
        .map(assetUrl)
        .filter((url): url is string => Boolean(url));
    };

    if (typeof Image.prefetch !== "function") {
      setImagesReady(true);
      return;
    }

    let cancelled = false;
    const firstUrls = urlsFor(questions[0]);
    const allUrls = questions.flatMap(urlsFor);

    // Never block the game for more than five seconds, even if a prefetch
    // stalls. The Image elements can still fetch on demand after that.
    const fallback = setTimeout(() => {
      if (!cancelled) setImagesReady(true);
    }, 5000);

    void Promise.allSettled(firstUrls.map((url) => Image.prefetch(url))).then(() => {
      if (cancelled) return;
      clearTimeout(fallback);
      setImagesReady(true);

      const rest = allUrls.filter((url) => !firstUrls.includes(url));
      void Promise.allSettled(rest.map((url) => Image.prefetch(url))).catch(() => {});
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [questions]);

  // A pending "next question" timer must not fire after the run ends.
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );

  const choose = (optionIndex: number) => {
    // A ref, not just `picked`: two clicks delivered before React re-renders
    // would both read the old null and score the same question twice.
    if (picked !== null || lockedRef.current || !running) return;

    const question = questions[index];
    if (!question) return;
    lockedRef.current = true;

    const correctIndex = question.correctIndex;
    const isCorrect = correctIndex !== undefined && optionIndex === correctIndex;
    const points = isCorrect ? question.points || 100 : 0;

    answeredRef.current += 1;

    if (isCorrect) {
      correctRef.current += 1;
      scoreRef.current += points;
      setScore(scoreRef.current);
      onScoreChange?.(scoreRef.current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
    }

    setPicked(optionIndex);

    const isLast = index >= questions.length - 1;

    // Wrong answers linger a little longer so the player can read the name of
    // the celebrity they missed. The last question ends the run instead of
    // leaving the player staring at a stopped clock.
    advanceTimer.current = setTimeout(
      () => {
        if (isLast) {
          finishRef.current();
          return;
        }
        lockedRef.current = false;
        setPicked(null);
        setIndex((current) => current + 1);
      },
      isCorrect ? 1300 : 1900
    );
  };

  if (questions.length === 0) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.errorEmoji}>📷</Text>
            <Text style={styles.loading}>{error}</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={brand.gold} />
            <Text style={styles.loading}>Loading celebrity close-ups...</Text>
          </>
        )}
      </View>
    );
  }

  if (!imagesReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={brand.gold} />
        <Text style={styles.loading}>Warming up the close-ups...</Text>
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

  const media = question.media;
  const correctIndex = question.correctIndex;
  const revealed = picked !== null;
  const wasCorrect = revealed && correctIndex !== undefined && picked === correctIndex;
  const revealUri = assetUrl(media?.reveal);
  const answerName =
    correctIndex !== undefined ? question.options[correctIndex] : question.options[picked ?? 0];

  return (
    <View style={[styles.body, { paddingBottom: Math.max(8, insets.bottom + 4) }]}>
      <View style={styles.meta}>
        <Text style={styles.count}>
          Question {index + 1}/{questions.length}
        </Text>
        <Text style={styles.score}>⭐ {score.toLocaleString("en-IN")}</Text>
      </View>

      <TimerBar remainingMs={remainingMs} totalMs={durationMs} />

      <Text style={styles.prompt} numberOfLines={2}>
        {question.prompt}
      </Text>

      <View style={styles.stage}>
        {revealed ? (
          <View style={styles.revealCard}>
            {revealUri ? (
              <Image
                source={{ uri: revealUri }}
                style={styles.revealImage}
                resizeMode="cover"
                accessibilityLabel={`Full portrait of ${answerName}`}
              />
            ) : (
              <View style={[styles.revealImage, styles.imageFallback]}>
                <Text style={styles.fallbackText}>📷</Text>
              </View>
            )}

            <View
              style={[
                styles.resultPill,
                wasCorrect ? styles.resultCorrect : styles.resultWrong,
              ]}
            >
              <Text style={styles.resultText}>
                {wasCorrect ? `CORRECT  +${question.points || 100}` : "WRONG"}
              </Text>
            </View>

            <View style={styles.revealCaption}>
              <Text style={styles.revealName} numberOfLines={1}>
                {answerName}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            {FEATURES.map(({ key, label }) => {
              const uri = assetUrl(media?.[key]);
              return (
                <View key={key} style={styles.tile}>
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={styles.tileImage}
                      resizeMode="cover"
                      accessibilityLabel={`Close-up of ${label.toLowerCase()}`}
                    />
                  ) : (
                    <View style={[styles.tileImage, styles.imageFallback]}>
                      <Text style={styles.fallbackText}>📷</Text>
                    </View>
                  )}
                  <View style={styles.tileLabel}>
                    <Text style={styles.tileLabelText}>{label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.options}>
        {question.options.map((option, optionIndex) => {
          const isPicked = picked === optionIndex;
          const isAnswer = correctIndex === optionIndex;

          return (
            <Pressable
              key={`${option}-${optionIndex}`}
              onPress={() => choose(optionIndex)}
              disabled={revealed}
              style={({ pressed }) => [
                styles.option,
                revealed && isAnswer && styles.optionCorrect,
                revealed && isPicked && !isAnswer && styles.optionWrong,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={option}
            >
              <Text style={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</Text>
              <Text style={styles.optionText} numberOfLines={2}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 10,
  },
  loading: { color: brand.white, fontSize: 15, fontWeight: "800", textAlign: "center" },
  errorEmoji: { fontSize: 40 },

  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  count: { color: brand.white, fontSize: 12, fontWeight: "800" },
  score: { color: brand.gold, fontSize: 13, fontWeight: "900" },

  prompt: {
    color: brand.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
  },

  stage: { flex: 1, justifyContent: "center", marginVertical: 8 },
  grid: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
  },
  tile: {
    // 48%, not 48.8%: on a 320px-wide screen 48.8% plus the 7px gap rounds
    // over the row width, collapsing the mosaic to one column.
    width: "48%",
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.16)",
  },
  tileImage: { width: "100%", height: "100%" },
  tileLabel: {
    position: "absolute",
    left: 7,
    top: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(6,3,24,0.72)",
  },
  tileLabelText: {
    color: brand.white,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  revealCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
  },
  revealImage: { width: "100%", height: "100%" },
  imageFallback: { alignItems: "center", justifyContent: "center" },
  fallbackText: { fontSize: 28 },

  resultPill: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  resultCorrect: { backgroundColor: "rgba(34,197,94,0.94)" },
  resultWrong: { backgroundColor: "rgba(239,68,68,0.94)" },
  resultText: { color: brand.white, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  revealCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(6,3,24,0.72)",
  },
  revealName: { color: brand.white, fontSize: 16, fontWeight: "900", textAlign: "center" },

  options: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
  },
  option: {
    width: "48%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0,0,0,0.34)",
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },
  optionCorrect: { borderColor: brand.success, backgroundColor: "rgba(34,197,94,0.24)" },
  optionWrong: { borderColor: brand.danger, backgroundColor: "rgba(239,68,68,0.24)" },
  optionLetter: { color: brand.gold, fontSize: 13, fontWeight: "900", width: 16 },
  optionText: { color: brand.white, fontSize: 12.5, fontWeight: "800", flex: 1 },

  pressed: { opacity: 0.85 },
});
