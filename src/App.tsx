import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BatteryCharging,
  Check,
  CircleHelp,
  Crosshair,
  ExternalLink,
  Flag,
  Gauge,
  Maximize,
  Moon,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { Habitat } from "./components/Habitat";
import { WalletControl } from "./components/Wallet";
import { Modal } from "./components/Modal";
import { Predictor, Rhythm } from "./components/SideGames";
import { Scoreboard } from "./components/Scoreboard";
import {
  API,
  fetchApi,
  formatNumber,
  parseHolder,
  useTelemetry,
} from "./lib/telemetry";
import type { Settlement } from "./lib/telemetry";
import {
  EMPTY_RUN,
  medianWork,
  practiceHistory,
  readScores,
  STORAGE_KEY,
  tickRun,
} from "./lib/game";
import type { GameTab, Mode, ScoreEntry, WheelRun } from "./lib/game";
const tabs: { id: GameTab; label: string; icon: typeof Gauge }[] = [
  { id: "wheel", label: "Wheel run", icon: Gauge },
  { id: "predict", label: "Round predictor", icon: Crosshair },
  { id: "rhythm", label: "Hash rhythm", icon: Radio },
];
function readBattery(): Record<Mode, number> {
  try {
    const data = JSON.parse(localStorage.getItem("squeek-battery-v1") ?? "{}");
    return {
      live: Math.max(0, Math.min(100, Number(data.live) || 0)),
      practice: Math.max(0, Math.min(100, Number(data.practice) || 0)),
    };
  } catch {
    return { live: 0, practice: 0 };
  }
}
export default function App() {
  const telemetry = useTelemetry(),
    { address, isConnected } = useConnection();
  const [mode, setMode] = useState<Mode>("live"),
    [tab, setTab] = useState<GameTab>("wheel");
  const [now, setNow] = useState(Date.now()),
    [run, setRun] = useState<WheelRun>(EMPTY_RUN);
  const [practiceStarted, setPracticeStarted] = useState(0),
    [practiceRound, setPracticeRound] = useState(0);
  const [scores, setScores] = useState(readScores),
    [storageError, setStorageError] = useState(false);
  const [battery, setBattery] = useState(readBattery);
  const [help, setHelp] = useState(false),
    [sound, setSound] = useState(false),
    [paused, setPaused] = useState(false);
  const [stream, setStream] = useState(location.hash === "#stream"),
    [copied, setCopied] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const practiceSettlements = useMemo(practiceHistory, []),
    latestRunRef = useRef(run);
  latestRunRef.current = run;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const change = () => setStream(location.hash === "#stream");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
      localStorage.setItem("squeek-battery-v1", JSON.stringify(battery));
    } catch {
      setStorageError(true);
    }
  }, [scores, battery]);
  const holder = useQuery({
    queryKey: ["holder", address],
    queryFn: ({ signal }) =>
      fetchApi(`/accounts/${address}`, parseHolder, signal),
    enabled: Boolean(address),
    retry: false,
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const boost =
    isConnected &&
    holder.data === true &&
    !holder.isError &&
    now - holder.dataUpdatedAt < 120000
      ? 1.15
      : 1;
  const liveFresh = Boolean(
    telemetry.status.data &&
    !telemetry.status.isError &&
    now - telemetry.status.dataUpdatedAt < 12000,
  );
  const elapsedPractice = practiceStarted
    ? Math.max(0, (now - practiceStarted) / 1000)
    : 0;
  const stopAt = 14 + ((practiceRound * 7) % 12);
  const practiceRunning = practiceStarted > 0 && elapsedPractice < stopAt;
  const practiceRpm = practiceRunning
    ? 24 + Math.floor(elapsedPractice) * 2 + Math.floor(elapsedPractice / 3) * 3
    : 0;
  const rpm =
    mode === "practice"
      ? practiceRpm
      : liveFresh
        ? telemetry.status.data!.rpm
        : 0;
  const running =
    mode === "practice"
      ? practiceRunning
      : liveFresh && telemetry.status.data!.running;
  const fresh = mode === "practice" || liveFresh;
  const block =
    mode === "live" ? (telemetry.status.data?.blockHeight ?? null) : null;
  const history =
    mode === "practice"
      ? practiceSettlements
      : (telemetry.settlements.data ?? []);
  const historyAvailable =
    mode === "practice" ||
    Boolean(
      telemetry.settlements.data &&
      !telemetry.settlements.isError &&
      now - telemetry.settlements.dataUpdatedAt < 45000,
    );
  useEffect(() => {
    setRun((previous) => tickRun(previous, now, rpm, running, fresh));
  }, [now, rpm, running, fresh]);
  const saveScore = useCallback(
    (entry: Omit<ScoreEntry, "id" | "at" | "address">) => {
      const saved: ScoreEntry = {
        ...entry,
        id: crypto.randomUUID(),
        at: Date.now(),
        ...(address ? { address } : {}),
      };
      setScores((previous) => [saved, ...previous].slice(0, 50));
    },
    [address],
  );
  const onProof = useCallback(
    (
      id: string,
      txHash: `0x${string}`,
      proof: "pending" | "confirmed" | "reverted",
    ) =>
      setScores((previous) =>
        previous.map((entry) =>
          entry.id === id ? { ...entry, txHash, proof, address } : entry,
        ),
      ),
    [address],
  );
  const onCharge = useCallback(
    (charge: number) =>
      setBattery((previous) => ({
        ...previous,
        [mode]: Math.min(100, previous[mode] + charge),
      })),
    [mode],
  );
  const join = (practice = false) => {
    const start = Date.now();
    if (practice || mode === "practice") {
      setMode("practice");
      setPracticeStarted(start);
      setPracticeRound((r) => r + 1);
      setRun({
        ...EMPTY_RUN,
        phase: "active",
        started: start,
        previousRpm: 24,
        boost,
        score: Math.floor(100 * boost),
      });
    } else if (liveFresh && running)
      setRun({
        ...EMPTY_RUN,
        phase: "active",
        started: start,
        previousRpm: rpm,
        boost,
        score: Math.floor(100 * boost),
        block,
      });
  };
  const bail = () => {
    const current = tickRun(
      latestRunRef.current,
      Date.now(),
      rpm,
      running,
      mode === "practice" ||
        (liveFresh && Date.now() - telemetry.status.dataUpdatedAt < 12000),
    );
    if (current.phase !== "active") {
      setRun(current);
      return;
    }
    setRun({ ...current, phase: "bailed" });
    saveScore({
      score: current.score,
      mode,
      game: "wheel",
      block: current.block,
    });
  };
  const changeMode = (next: Mode) => {
    if (next === mode || run.phase === "active") return;
    setMode(next);
    setRun(EMPTY_RUN);
    setPracticeStarted(0);
  };
  const retry = () => {
    void telemetry.status.refetch();
    void telemetry.economy.refetch();
    void telemetry.settlements.refetch();
  };
  const isActive = run.phase === "active";
  const runStatus =
    run.phase === "bailed"
      ? "Escape successful"
      : run.phase === "crashed"
        ? "The hamster stopped. Run lost."
        : run.phase === "void"
          ? "Feed lost. Run voided."
          : isActive
            ? "You’re in. Watch the wheel."
            : "Ready when you are.";
  const toggleStream = () => {
    location.hash = stream ? "" : "stream";
    setStream(!stream);
  };
  return (
    <div className={`app ${stream ? "stream-mode" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="./"
          aria-label="Squeek Escape: Overdrive home"
        >
          <img src="./favicon.svg" width="34" height="34" alt="" />
          <span>
            Squeek Escape
            <span className="brand-edition">
              Overdrive<span className="edition-mark">↗</span>
            </span>
          </span>
        </a>
        <div className="header-actions">
          <button
            className="text-button stream-toggle"
            aria-label={stream ? "Exit stream view" : "Stream view"}
            onClick={toggleStream}
          >
            <Maximize size={16} />
            <span>{stream ? "Exit stream view" : "Stream view"}</span>
          </button>
          <button
            className="icon-button help-button"
            aria-label="How to play"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <WalletControl />
        </div>
      </header>
      <main id="main" className="page-content">
        <div className="intro">
          <div>
            <h1>Bail before he stops.</h1>
            <p>A live arcade powered by Squeekchain.</p>
          </div>
          <div className="network-note">
            <span className="network-symbol">◆</span>Ethereum Sepolia{" "}
            <span className="small muted">Testnet</span>
          </div>
        </div>
        <div
          className={`connection-banner ${mode === "practice" ? "practice-banner" : liveFresh ? "connected-banner" : ""}`}
        >
          <div role="status">
            {mode === "practice" ? (
              <Flag size={16} />
            ) : liveFresh ? (
              <Activity size={16} />
            ) : (
              <WifiOff size={16} />
            )}
            <span>
              {mode === "practice"
                ? "Practice mode · Simulated telemetry. Local scores only."
                : liveFresh
                  ? "Connected to Squeekchain · Updates every 4 seconds"
                  : telemetry.status.isPending
                    ? "Connecting to Squeekchain… You can try practice now."
                    : "Live feed unavailable · Try a practice run."}
            </span>
          </div>
          {mode === "live" && (
            <button
              className="banner-retry"
              aria-label="Retry live telemetry"
              disabled={telemetry.status.isFetching}
              onClick={retry}
            >
              <RefreshCw size={15} />
              <span>{telemetry.status.isFetching ? "Checking…" : "Retry"}</span>
            </button>
          )}
        </div>
        <div className="game-navigation">
          <div className="game-tabs" role="tablist" aria-label="Game modes">
            {tabs.map((item, i) => (
              <button
                role="tab"
                id={`tab-${item.id}`}
                aria-controls={`panel-${item.id}`}
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                className={tab === item.id ? "selected" : ""}
                key={item.id}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 2
                        : (i + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                  setTab(tabs[next].id);
                  document.getElementById(`tab-${tabs[next].id}`)?.focus();
                }}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div
            className="segmented source-switch"
            role="group"
            aria-label="Telemetry source"
          >
            <button
              aria-pressed={mode === "live"}
              disabled={isActive}
              onClick={() => changeMode("live")}
            >
              <span className={`status-dot ${liveFresh ? "online" : ""}`} />
              Live
            </button>
            <button
              aria-pressed={mode === "practice"}
              disabled={isActive}
              onClick={() => changeMode("practice")}
            >
              Practice
            </button>
          </div>
        </div>
        <section
          className={`game-shell panel ${tab !== "wheel" ? "alternate-game" : ""}`}
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          <div className="habitat">
            <div className="habitat-heading">
              <span>
                <span className="habitat-cross">+</span>
                <span className="habitat-label">
                  Squeektoshi
                  <span className="habitat-label-detail">’s habitat</span>
                </span>
              </span>
              <div className="habitat-actions">
                <div
                  className="segmented mobile-source"
                  role="group"
                  aria-label="Telemetry source"
                >
                  <button
                    aria-pressed={mode === "live"}
                    disabled={isActive}
                    onClick={() => changeMode("live")}
                  >
                    Live
                  </button>
                  <button
                    aria-pressed={mode === "practice"}
                    disabled={isActive}
                    onClick={() => changeMode("practice")}
                  >
                    Practice
                  </button>
                </div>
                <button
                  className="icon-button"
                  aria-label={sound ? "Mute game sound" : "Enable game sound"}
                  aria-pressed={sound}
                  onClick={() => setSound(!sound)}
                >
                  {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                </button>
                <button
                  className="icon-button"
                  aria-label={paused ? "Resume animation" : "Pause animation"}
                  aria-pressed={paused}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? <Play size={17} /> : <Pause size={17} />}
                </button>
              </div>
            </div>
            <div className="scene">
              <div className="scene-state">
                <span className={`status-dot ${running ? "online" : ""}`} />
                {!fresh ? "Signal lost" : running ? "On the wheel" : "Sleeping"}
                {mode === "practice" && (
                  <span className="scene-practice">Practice</span>
                )}
              </div>
              <Habitat
                rpm={rpm}
                running={running}
                paused={paused}
                reducedMotion={reducedMotion}
              />
              <div className="scene-caption">
                <span>
                  {!fresh
                    ? "Waiting for a little sign of life."
                    : running
                      ? "Tiny paws. Maximum effort."
                      : "Recharging the tiny engine."}
                </span>
                <span className="scene-coordinate">Habitat 01</span>
              </div>
            </div>
            <div className="telemetry-strip">
              <div>
                <span>
                  <Gauge size={14} />
                  Wheel speed
                </span>
                <strong className="mono">
                  {fresh ? formatNumber(rpm) : "–"}
                  <small> RPM</small>
                </strong>
              </div>
              <div>
                <span>
                  <Activity size={14} />
                  Distance
                </span>
                <strong className="mono">
                  {mode === "practice"
                    ? formatNumber(Math.round(elapsedPractice * 0.45))
                    : liveFresh
                      ? formatNumber(telemetry.status.data?.distance)
                      : "–"}
                  <small> m</small>
                </strong>
              </div>
              <div>
                <span>
                  <ShieldCheck size={14} />
                  Block height
                </span>
                <strong className="mono">
                  {mode === "practice"
                    ? "Practice"
                    : liveFresh
                      ? `#${formatNumber(block)}`
                      : "–"}
                </strong>
              </div>
            </div>
          </div>
          <div className="game-controls">
            {tab === "wheel" ? (
              <section className="run-control">
                <div className="run-title">
                  <span className={`status-dot ${isActive ? "online" : ""}`} />
                  <h2>{isActive ? "Run in progress" : "Wheel multiplier"}</h2>
                  <span className="small muted">01</span>
                </div>
                <div
                  className={`multiplier ${run.phase === "crashed" || run.phase === "void" ? "lost" : ""}`}
                >
                  <span className="mono">
                    {run.multiplier.toFixed(2)}
                    <span className="multiplier-x">×</span>
                  </span>
                  <p>{runStatus}</p>
                </div>
                <div className="run-stats">
                  <div>
                    <span>Run score</span>
                    <strong className="mono">
                      {formatNumber(run.score)}
                      <small> pts</small>
                    </strong>
                  </div>
                  <div>
                    <span>Time on wheel</span>
                    <strong className="mono">
                      {(run.elapsed / 1000).toFixed(1)}
                      <small> s</small>
                    </strong>
                  </div>
                </div>
                <div className="run-action">
                  <p className="small muted">
                    {run.phase === "bailed"
                      ? `${formatNumber(run.score)} points saved. That was a close squeek.`
                      : run.phase === "crashed"
                        ? "Any RPM drop ends your run. Join again and bail earlier."
                        : run.phase === "void"
                          ? "No score was saved. Retry the feed or play a practice run."
                          : isActive
                            ? "The multiplier climbs with time and RPM. Bail before any RPM drop."
                            : mode === "live" && !liveFresh
                              ? "Try a simulated run while the live feed reconnects."
                              : mode === "live" && !running
                                ? "Squeektoshi is resting. Join when the wheel starts, or try another game."
                                : "Join the wheel. Build your multiplier. Bail before the RPM drops."}
                  </p>
                  <button
                    className={`button primary full ${isActive ? "bail-button" : ""}`}
                    disabled={
                      mode === "live" && liveFresh && !running && !isActive
                    }
                    onClick={() =>
                      isActive ? bail() : join(mode === "live" && !liveFresh)
                    }
                  >
                    {isActive ? (
                      <>
                        <Flag size={18} />
                        Bail out
                        <ArrowRight size={18} />
                      </>
                    ) : (
                      <>
                        <Play size={17} />
                        {mode === "live" && !liveFresh
                          ? "Start practice run"
                          : mode === "live" && !running
                            ? "Waiting for the wheel…"
                            : mode === "practice"
                              ? "Join practice run"
                              : "Join live run"}
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="small action-caption">
                    {isActive
                      ? "Lock in your score now"
                      : "Free to play · No wallet needed"}
                  </p>
                </div>
                <div className="holder-status">
                  <ShieldCheck size={17} />
                  <div>
                    <strong>
                      {boost > 1
                        ? "Holder boost active · +15%"
                        : isConnected && holder.isPending
                          ? "Checking Squeek holder boost…"
                          : isConnected && holder.isError
                            ? "Holder status unavailable"
                            : "Squeek holders get +15%"}
                    </strong>
                    <span>
                      {boost > 1
                        ? "Applied when you start a new game."
                        : isConnected && holder.isError
                          ? "Playing at the standard multiplier. Retry below."
                          : isConnected && holder.data === false
                            ? "No Squeek NFT found for this wallet."
                            : "Connect a holder wallet to boost your score."}
                    </span>
                    {holder.isError && (
                      <button
                        className="text-button"
                        onClick={() => void holder.refetch()}
                      >
                        Retry holder check
                      </button>
                    )}
                  </div>
                </div>
              </section>
            ) : tab === "predict" ? (
              <Predictor
                key={`${mode}-predict`}
                mode={mode}
                history={history}
                available={historyAvailable && history.length > 0}
                boost={boost}
                onScore={saveScore}
              />
            ) : (
              <Rhythm
                key={`${mode}-rhythm`}
                mode={mode}
                history={history}
                available={historyAvailable && history.length > 0}
                boost={boost}
                onScore={saveScore}
                sound={sound}
                paused={paused}
                reducedMotion={reducedMotion}
                onCharge={onCharge}
              />
            )}
          </div>
        </section>
        <div className="under-game">
          <span>
            <ShieldCheck size={14} />
            Play for points, stamp on Sepolia.
          </span>
          <button className="text-button" onClick={() => setHelp(true)}>
            How it works
            <ArrowUpRight size={15} />
          </button>
        </div>
        {stream && (
          <div className="stream-note">
            <p>Stream companion · Add this page as an OBS browser source.</p>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={16} /> : <ExternalLink size={16} />}
              {copied ? "Stream URL copied" : "Copy stream URL"}
            </button>
          </div>
        )}
        <div className="secondary-grid">
          <div className="signal-column">
            <section className="panel settlement-panel">
              <div className="section-heading">
                <h2>
                  <Activity size={19} />
                  Settlement signal
                </h2>
                <span className="small muted">
                  {mode === "practice" ? "Simulated history" : "Past 24 hours"}
                </span>
              </div>
              <p className="small muted">
                {historyAvailable && history.length
                  ? `${history.length} settlements · ${formatNumber(medianWork(history))} median work units`
                  : telemetry.settlements.isPending
                    ? "Loading settlement history…"
                    : "History unavailable. Retry the feed or switch to practice."}
              </p>
              <SettlementChart history={history} available={historyAvailable} />
              <div className="chart-caption small muted">
                <span>Earlier settlements</span>
                <span>Latest</span>
              </div>
              <div className="economy-stats">
                <div>
                  <span>Total work units</span>
                  <strong className="mono">
                    {mode === "practice"
                      ? "Practice"
                      : telemetry.economy.isError
                        ? "Unavailable"
                        : formatNumber(telemetry.economy.data?.totalWork)}
                  </strong>
                </div>
                <div>
                  <span>Total settlements</span>
                  <strong className="mono">
                    {mode === "practice"
                      ? "Practice"
                      : telemetry.economy.isError
                        ? "Unavailable"
                        : formatNumber(
                            telemetry.economy.data?.totalSettlements,
                          )}
                  </strong>
                </div>
              </div>
              <details className="settlement-details">
                <summary>View recent settlements</summary>
                {history.length ? (
                  <ul>
                    {history.slice(0, 8).map((s) => (
                      <li key={s.height}>
                        <div>
                          <strong>
                            {mode === "practice"
                              ? `Practice ${s.height}`
                              : `Block #${s.height}`}
                          </strong>
                          <span className="mono">
                            {formatNumber(s.workUnits)} WU
                          </span>
                        </div>
                        <code>{s.hash}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">
                    No settlement data received yet.
                  </p>
                )}
              </details>
            </section>
            <section className="battery-panel panel">
              <div className="section-heading">
                <h2>
                  <BatteryCharging size={20} />
                  Community battery
                </h2>
                <strong className="mono">{battery[mode]}%</strong>
              </div>
              <div
                className="battery-meter"
                role="progressbar"
                aria-label={`${mode} battery charge on this device`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={battery[mode]}
              >
                {Array.from({ length: 25 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < Math.ceil(battery[mode] / 4) ? "charged" : ""
                    }
                  />
                ))}
              </div>
              <div className="battery-copy">
                <p className="small muted">
                  Your contribution, saved on this device.{" "}
                  {mode === "practice"
                    ? "Practice charge stays separate."
                    : "No shared total is available."}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setTab("rhythm");
                    document.getElementById("tab-rhythm")?.focus();
                    document.querySelector(".game-navigation")?.scrollIntoView({
                      behavior: reducedMotion ? "instant" : "smooth",
                      block: "start",
                    });
                  }}
                >
                  Charge it
                  <Zap size={15} />
                </button>
              </div>
            </section>
          </div>
          <Scoreboard
            scores={scores}
            mode={mode}
            storageError={storageError}
            onProof={onProof}
          />
        </div>
        <section className="quick-guide">
          <div>
            <span className="guide-number mono">01</span>
            <h3>Ride the run</h3>
            <p>Every second and RPM increase grows your multiplier.</p>
          </div>
          <div>
            <span className="guide-number mono">02</span>
            <h3>Make your escape</h3>
            <p>Bail out before the RPM falls. Hesitate and the run is gone.</p>
          </div>
          <div>
            <span className="guide-number mono">03</span>
            <h3>Leave your mark</h3>
            <p>Connect a wallet and stamp a live high score on Sepolia.</p>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Small paws. Big blocks.</span>
        <div>
          <a href="https://squeekchain.com" target="_blank" rel="noreferrer">
            Squeekchain
            <ArrowUpRight size={13} />
          </a>
          <a href={`${API}/status`} target="_blank" rel="noreferrer">
            Public API
            <ArrowUpRight size={13} />
          </a>
          <span>Sepolia · 11155111</span>
        </div>
      </footer>
      <div className="sr-only" role="status">
        {run.phase === "bailed"
          ? `Escape successful. ${run.score} points saved.`
          : run.phase === "crashed"
            ? "Run lost. The wheel slowed down."
            : run.phase === "void"
              ? "Run voided because telemetry is unavailable."
              : ""}
      </div>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="A little nerve goes a long way"
      >
        <div className="help-content">
          <h3>Wheel run</h3>
          <p>
            Join while Squeektoshi runs. The multiplier starts at 1× and adds
            0.08× per second plus 0.025× per RPM gained. Bail out to save 100 ×
            multiplier points. Any observed RPM drop loses your run. A missing
            feed voids it.
          </p>
          <h3>Round predictor</h3>
          <p>
            Use the 24-hour settlement history to predict the next block’s work
            units. Exact predictions earn 1,000 points. Points decrease with
            relative error, to a minimum of zero. You can play while the hamster
            sleeps.
          </p>
          <h3>Hash rhythm</h3>
          <p>
            The first 16 bytes of a settled block hash create 16 beats. Tap the
            pulse button, or press Space, within 200 ms of a beat. Hit within 90
            ms for 100 points and 3% battery charge; otherwise earn 50 points
            and 1%. Sound is optional. Reduced motion keeps a static pulse cue.
          </p>
          <h3>Wallets and proofs</h3>
          <p>
            Squeek NFT holders get a 15% boost, checked through the account API
            and locked at the start of each game. Scores and battery charge live
            in this browser. A stamp is a 0 ETH self-transaction with score data
            on Sepolia. It costs test ETH gas and proves a score was submitted,
            not that gameplay was independently verified.
          </p>
          <h3>Live and practice</h3>
          <p>
            Live polls status every 4 seconds, settlements every 15, and economy
            every 20. Practice uses a simulated wheel and history. Practice
            scores and battery charge are separate, and cannot be stamped
            on-chain. Leaving a side game ends that session. Wheel runs continue
            when changing tabs; return to bail out.
          </p>
        </div>
      </Modal>
    </div>
  );
}
function SettlementChart({
  history,
  available,
}: {
  history: Settlement[];
  available: boolean;
}) {
  const items = history.slice(0, 36).reverse(),
    max = Math.max(1, ...items.map((s) => s.workUnits));
  return (
    <div
      className={`settlement-chart ${!available ? "unavailable" : ""}`}
      aria-label={
        available
          ? "Work units per settlement, earliest to latest"
          : "Settlement chart unavailable"
      }
      role="img"
    >
      {available && items.length ? (
        items.map((s, i) => (
          <div
            key={s.height}
            style={{ height: `${Math.max(3, (s.workUnits / max) * 100)}%` }}
            className={i === items.length - 1 ? "latest-bar" : ""}
          >
            <span className="bar-detail">{formatNumber(s.workUnits)} WU</span>
          </div>
        ))
      ) : (
        <div className="chart-empty">
          <span>No settlement signal</span>
          <WifiOff size={20} />
        </div>
      )}
    </div>
  );
}
