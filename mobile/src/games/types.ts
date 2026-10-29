/**
 * The contract every mini game implements.
 *
 * Given a duration, play until time is up, then report a score. That is what
 * lets the daily run and quick play drive every game identically instead of
 * maintaining two copies of each mechanic.
 */
export interface GameProps {
  durationMs: number;
  onFinish: (score: number, detail: Record<string, unknown>) => void;
  /** Optional live score, so a run header can show it while playing. */
  onScoreChange?: (score: number) => void;
  config?: Record<string, unknown>;
}
