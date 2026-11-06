import { keccak256, stringToHex } from "viem";
import type { Settlement } from "./telemetry";
export type Mode = "live" | "practice";
export type GameTab = "wheel" | "predict" | "rhythm";
export type ScoreEntry = {
  id: string;
  score: number;
  block: number | null;
  mode: Mode;
  game: GameTab;
  at: number;
  address?: string;
  txHash?: `0x${string}`;
  proof?: "pending" | "confirmed" | "reverted";
};
export type WheelRun = {
  phase: "ready" | "active" | "bailed" | "crashed" | "void";
  started: number;
  elapsed: number;
  gain: number;
  previousRpm: number;
  multiplier: number;
  score: number;
  boost: number;
  block: number | null;
};
export const EMPTY_RUN: WheelRun = {
  phase: "ready",
  started: 0,
  elapsed: 0,
  gain: 0,
  previousRpm: 0,
  multiplier: 1,
  score: 0,
  boost: 1,
  block: null,
};
export function tickRun(
  run: WheelRun,
  now: number,
  rpm: number,
  running: boolean,
  fresh: boolean,
): WheelRun {
  if (run.phase !== "active") return run;
  if (!fresh) return { ...run, phase: "void", score: 0 };
  if (!running || rpm < run.previousRpm)
    return { ...run, phase: "crashed", score: 0 };
  const gain = run.gain + Math.max(0, rpm - run.previousRpm);
  const multiplier =
    1 + (Math.max(0, now - run.started) / 1000) * 0.08 + gain * 0.025;
  return {
    ...run,
    elapsed: Math.max(0, now - run.started),
    gain,
    previousRpm: rpm,
    multiplier,
    score: Math.floor(100 * multiplier * run.boost),
  };
}
export function predictionScore(prediction: number, actual: number, boost = 1) {
  if (actual === 0) return prediction === 0 ? Math.floor(1000 * boost) : 0;
  return Math.max(
    0,
    Math.round(1000 * (1 - Math.abs(prediction - actual) / actual) * boost),
  );
}
export function medianWork(settlements: Settlement[]): number {
  if (!settlements.length) return 0;
  const values = settlements.map((s) => s.workUnits).sort((a, b) => a - b),
    i = Math.floor(values.length / 2);
  return values.length % 2 ? values[i] : (values[i - 1] + values[i]) / 2;
}
export function hashBeats(hash: string): number[] {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) return [];
  // One beat per byte: 600–900 ms gaps, repeatable for a given settled block.
  let time = 1000;
  return Array.from({ length: 16 }, (_, i) => {
    time += 600 + (parseInt(hash.slice(2 + i * 2, 4 + i * 2), 16) % 4) * 100;
    return time;
  });
}
export function practiceHistory(): Settlement[] {
  return Array.from({ length: 24 }, (_, i) => ({
    height: 24 - i,
    workUnits: 110 + ((i * 37 + 29) % 180),
    hash: keccak256(stringToHex(`Squeek Escape practice round ${24 - i}`)),
    timestamp: null,
  }));
}
export function scorePayload(entry: ScoreEntry) {
  if (
    entry.mode !== "live" ||
    entry.block === null ||
    !Number.isSafeInteger(entry.block) ||
    entry.block < 0 ||
    !Number.isSafeInteger(entry.score) ||
    entry.score <= 0
  )
    throw new Error("Only a saved live score can be stamped.");
  return `SQUEEK_SCORE:${entry.score}:${entry.block}`;
}
export const STORAGE_KEY = "squeek-overdrive-scores-v1";
export function readScores(): ScoreEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter(
            (v): v is ScoreEntry =>
              v &&
              typeof v.id === "string" &&
              Number.isSafeInteger(v.score) &&
              v.score > 0 &&
              ["live", "practice"].includes(v.mode) &&
              ["wheel", "predict", "rhythm"].includes(v.game) &&
              Number.isFinite(v.at) &&
              (v.block === null || Number.isSafeInteger(v.block)) &&
              (!v.txHash || /^0x[0-9a-f]{64}$/i.test(v.txHash)),
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
