import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Crosshair,
  Minus,
  Plus,
  Radio,
  Zap,
} from "lucide-react";
import { hashBeats, medianWork, predictionScore } from "../lib/game";
import type { Mode, ScoreEntry } from "../lib/game";
import { formatNumber } from "../lib/telemetry";
import type { Settlement } from "../lib/telemetry";

type GameProps = {
  mode: Mode;
  history: Settlement[];
  available: boolean;
  boost: number;
  onScore: (entry: Omit<ScoreEntry, "id" | "at" | "address">) => void;
};
export function Predictor({
  mode,
  history,
  available,
  boost,
  onScore,
}: GameProps) {
  const median = medianWork(history),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const [bet, setBet] = useState<{
    value: number;
    after: number;
    boost: number;
  } | null>(null);
  const [result, setResult] = useState<{
    actual: number;
    score: number;
    height: number;
  } | null>(null);
  const [practiceResult, setPracticeResult] = useState<Settlement | null>(null);
  const submitted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = history[0];
  const next =
    mode === "practice"
      ? practiceResult
      : bet
        ? [...history].reverse().find((s) => s.height > bet.after)
        : undefined;
  useEffect(() => {
    if (!bet || !next || submitted.current) return;
    submitted.current = true;
    const score = predictionScore(bet.value, next.workUnits, bet.boost);
    setResult({ actual: next.workUnits, score, height: next.height });
    if (score > 0)
      onScore({
        score,
        block: mode === "live" ? next.height : null,
        mode,
        game: "predict",
      });
  }, [bet, next, mode, onScore]);
  useEffect(() => {
    if (!bet || mode !== "practice") return;
    const timer = setTimeout(() => {
      setPracticeResult({
        height: bet.after + 1,
        workUnits: Math.round(median * (0.8 + ((bet.after * 7) % 40) / 100)),
        hash: history[0].hash,
        timestamp: null,
      });
    }, 6000);
    return () => clearTimeout(timer);
  }, [bet, mode, history, median]);
  const working = bet !== null && !result;
  return (
    <section className="side-game predictor">
      <div className="game-section-icon">
        <Crosshair size={24} />
      </div>
      <h2>Call the next round.</h2>
      <p className="muted">
        Predict the next settled block’s work units. Get closer, score higher.
      </p>
      <div className="prediction-context">
        <span>24h median</span>
        <strong className="mono">
          {history.length ? formatNumber(median) : "–"}{" "}
          <span className="small muted">WU</span>
        </strong>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (working || !available || !latest) return;
          const n = Number(value);
          if (
            value.trim() === "" ||
            !Number.isSafeInteger(n) ||
            n < 0 ||
            n > 1000000000
          ) {
            setError("Enter a whole number from 0 to 1,000,000,000.");
            inputRef.current?.focus();
            return;
          }
          setError("");
          setResult(null);
          setPracticeResult(null);
          submitted.current = false;
          setBet({ value: n, after: latest.height, boost });
        }}
      >
        <label htmlFor="prediction">
          Your prediction <span className="muted">(work units)</span>
        </label>
        <div className="number-stepper">
          <button
            type="button"
            aria-label="Decrease prediction by 10"
            disabled={working}
            onClick={() =>
              setValue(
                String(Math.max(0, Number(value || Math.round(median)) - 10)),
              )
            }
          >
            <Minus size={18} />
          </button>
          <input
            ref={inputRef}
            id="prediction"
            name="prediction"
            inputMode="numeric"
            type="number"
            min="0"
            max="1000000000"
            step="1"
            placeholder={
              history.length ? String(Math.round(median)) : "Enter work units"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={working}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "prediction-error" : "prediction-hint"}
          />
          <button
            type="button"
            aria-label="Increase prediction by 10"
            disabled={working}
            onClick={() =>
              setValue(
                String(
                  Math.min(
                    1000000000,
                    Number(value || Math.round(median)) + 10,
                  ),
                ),
              )
            }
          >
            <Plus size={18} />
          </button>
        </div>
        <p className="inline-error" id="prediction-error" role="status">
          {error}
        </p>
        {result ? (
          <div className="game-result" role="status">
            <Check size={20} />
            <div>
              <strong>{formatNumber(result.score)} points locked in</strong>
              <p className="small muted">
                Settled at {formatNumber(result.actual)} WU
                {mode === "practice"
                  ? " · simulated round"
                  : ` · block #${result.height}`}
                .
              </p>
            </div>
          </div>
        ) : (
          <p className="small muted" id="prediction-hint">
            {working
              ? `Prediction locked: ${formatNumber(bet.value)} WU. ${mode === "practice" ? "Practice settles in 6 seconds." : "Waiting for a newer settlement."}`
              : available
                ? "Lock it in before the next block settles."
                : "Settlement history is unavailable. Try practice or retry the live feed."}
          </p>
        )}
        <button
          className="button primary full"
          type="submit"
          disabled={working || !available}
        >
          {working
            ? "Waiting for settlement…"
            : result
              ? "Predict another round"
              : "Lock prediction"}
          {!working && <ArrowRight size={18} />}
        </button>
        {working && (
          <button
            type="button"
            className="text-button full"
            onClick={() => {
              setBet(null);
              setPracticeResult(null);
            }}
          >
            Cancel prediction
          </button>
        )}
      </form>
      <p className="small muted game-bottom-note">
        Free to play. No tokens or wagers.
      </p>
    </section>
  );
}
export function Rhythm({
  mode,
  history,
  available,
  boost,
  onScore,
  sound,
  paused,
  reducedMotion,
  onCharge,
}: GameProps & {
  sound: boolean;
  paused: boolean;
  reducedMotion: boolean;
  onCharge: (charge: number) => void;
}) {
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [elapsed, setElapsed] = useState(0),
    [feedback, setFeedback] = useState(""),
    [points, setPoints] = useState(0),
    [hits, setHits] = useState(0);
  const started = useRef(0),
    claimed = useRef(new Set<number>()),
    nextSound = useRef(0),
    audioRef = useRef<AudioContext | null>(null),
    finished = useRef(false);
  const [source, setSource] = useState<Settlement | null>(null);
  const beats = useMemo(() => hashBeats(source?.hash ?? ""), [source]);
  const pointsRef = useRef(0),
    boostRef = useRef(1),
    tapRef = useRef<() => void>(() => {});
  const start = () => {
    if (!available || !history.length) return;
    setSource(history[0]);
    setPhase("playing");
    setElapsed(0);
    setPoints(0);
    setHits(0);
    setFeedback("Get ready…");
    started.current = performance.now();
    claimed.current.clear();
    nextSound.current = 0;
    finished.current = false;
    pointsRef.current = 0;
    boostRef.current = boost;
    if (sound) {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    }
  };
  const tap = () => {
    if (phase !== "playing") return;
    const now = performance.now() - started.current;
    let nearest = -1,
      distance = Infinity;
    beats.forEach((beat, i) => {
      if (!claimed.current.has(i) && Math.abs(beat - now) < distance) {
        distance = Math.abs(beat - now);
        nearest = i;
      }
    });
    if (nearest < 0 || distance > 200) {
      setFeedback("Off beat. Catch the next pulse.");
      return;
    }
    claimed.current.add(nearest);
    const score = distance <= 90 ? 100 : 50;
    pointsRef.current += score;
    setPoints(pointsRef.current);
    setHits(claimed.current.size);
    setFeedback(score === 100 ? "Perfect pulse! +100" : "In sync! +50");
    onCharge(score === 100 ? 3 : 1);
  };
  tapRef.current = tap;
  useEffect(() => {
    if (phase !== "playing") return;
    const key = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLButtonElement) &&
        !(e.target instanceof HTMLAnchorElement) &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        if (!e.repeat) tapRef.current();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [phase]);
  useEffect(() => {
    if (phase !== "playing" || !beats.length) return;
    const timer = setInterval(() => {
      const t = performance.now() - started.current;
      setElapsed(t);
      if (
        sound &&
        !paused &&
        nextSound.current < beats.length &&
        t >= beats[nextSound.current]
      ) {
        const ctx = audioRef.current;
        if (ctx && ctx.state === "running") {
          const oscillator = ctx.createOscillator(),
            gain = ctx.createGain();
          oscillator.frequency.value = 660;
          oscillator.type = "sine";
          gain.gain.setValueAtTime(0.045, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.08);
        }
        nextSound.current++;
      }
      if (t > beats[beats.length - 1] + 450 && !finished.current) {
        finished.current = true;
        setPhase("done");
        setFeedback("Rhythm complete. Nice energy.");
        const score = Math.round(pointsRef.current * boostRef.current);
        if (score > 0)
          onScore({
            mode,
            game: "rhythm",
            score,
            block: mode === "live" && source ? source.height : null,
          });
      }
    }, 25);
    return () => clearInterval(timer);
  }, [phase, beats, sound, paused, mode, source, onScore]);
  useEffect(
    () => () => {
      void audioRef.current?.close();
    },
    [],
  );
  const nearestDistance = beats.length
    ? Math.min(...beats.map((b) => Math.abs(b - elapsed)))
    : Infinity;
  return (
    <section className="side-game rhythm">
      <div className="game-section-icon">
        <Radio size={24} />
      </div>
      <h2>Find the hamster’s rhythm.</h2>
      <p className="muted">
        Tap on each pulse. A settlement hash sets the beat; your timing charges
        the battery.
      </p>
      <div
        className={`rhythm-pulse ${phase === "playing" && nearestDistance < 150 ? "on-beat" : ""}`}
      >
        <Zap size={32} />
        <span className="mono">
          {formatNumber(Math.round(points * boostRef.current))}
          <span className="small muted"> pts</span>
        </span>
      </div>
      <div className="rhythm-lane" aria-hidden="true">
        <div className="rhythm-target" />
        {phase === "playing" &&
          beats.map((beat, i) => {
            const left =
              paused || reducedMotion
                ? Math.abs(beat - elapsed) < 180
                  ? 50
                  : -10
                : 50 + (beat - elapsed) / 15;
            return left > -5 && left < 105 ? (
              <span
                key={i}
                className={claimed.current.has(i) ? "beat hit" : "beat"}
                style={{ left: `${left}%` }}
              />
            ) : null;
          })}
      </div>
      <p className="rhythm-feedback" role="status">
        {feedback ||
          (available
            ? "16 beats. One tiny power plant."
            : "Load settlement history or try practice.")}
      </p>
      <button
        className="button primary full tap-button"
        disabled={!available}
        onClick={() => (phase === "playing" ? tap() : start())}
      >
        {phase === "playing" ? (
          <>
            <Zap size={18} />
            Tap the pulse
          </>
        ) : phase === "done" ? (
          "Play another rhythm"
        ) : (
          "Start rhythm"
        )}
      </button>
      <p className="small muted">
        {phase === "playing"
          ? `${hits} of 16 pulses hit · Tap or press Space`
          : "Tap or press Space on the pulse button."}
      </p>
      {phase === "playing" && (
        <button
          className="text-button full"
          onClick={() => {
            setPhase("ready");
            setFeedback("Session stopped. Ready when you are.");
          }}
        >
          Stop rhythm
        </button>
      )}
      <p className="small muted game-bottom-note">
        Battery contributions are saved in this browser.
      </p>
    </section>
  );
}
