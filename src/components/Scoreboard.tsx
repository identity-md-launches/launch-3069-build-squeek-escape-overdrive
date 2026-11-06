import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useConnection, useSendTransaction, usePublicClient } from "wagmi";
import { stringToHex } from "viem";
import type { Mode, ScoreEntry } from "../lib/game";
import { scorePayload } from "../lib/game";
import { formatNumber } from "../lib/telemetry";
import { friendlyError, sepolia, shortAddress } from "../lib/wallet";
import { Modal } from "./Modal";
const gameNames = {
  wheel: "Wheel run",
  predict: "Predictor",
  rhythm: "Hash rhythm",
};
export function Scoreboard({
  scores,
  mode,
  storageError,
  onProof,
}: {
  scores: ScoreEntry[];
  mode: Mode;
  storageError: boolean;
  onProof: (
    id: string,
    hash: `0x${string}`,
    status: "pending" | "confirmed" | "reverted",
  ) => void;
}) {
  const [filter, setFilter] = useState<Mode>(mode);
  const [lastMode, setLastMode] = useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    setFilter(mode);
  }
  const sorted = scores
    .filter((s) => s.mode === filter)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return (
    <section className="leaderboard panel">
      <div className="section-heading">
        <h2>
          <Trophy size={19} />
          Escape leaderboard
        </h2>
        <div
          className="segmented compact"
          role="group"
          aria-label="Leaderboard source"
        >
          <button
            aria-pressed={filter === "live"}
            onClick={() => setFilter("live")}
          >
            Live
          </button>
          <button
            aria-pressed={filter === "practice"}
            onClick={() => setFilter("practice")}
          >
            Practice
          </button>
        </div>
      </div>
      <p className="small muted">
        Your top scores on this device. No global ranking.
      </p>
      {storageError && (
        <p className="inline-error" role="status">
          Browser storage is unavailable. Scores last for this visit only.
        </p>
      )}
      {sorted.length ? (
        <div
          className="score-table"
          role="table"
          aria-label={`${filter} scores`}
        >
          <div className="score-table-head" role="row">
            <span role="columnheader">Rank / game</span>
            <span role="columnheader">Score</span>
            <span role="columnheader">Proof</span>
          </div>
          {sorted.map((score, i) => (
            <div className="score-row" key={score.id} role="row">
              <div role="cell">
                <span className="rank mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  {gameNames[score.game]}
                  <small className="muted">
                    {score.address ? shortAddress(score.address) : "You"} ·{" "}
                    {new Date(score.at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </span>
              </div>
              <strong className="mono" role="cell">
                {formatNumber(score.score)}
              </strong>
              <span role="cell">
                {score.txHash ? (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${score.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="proof-link"
                    aria-label={`View ${score.proof ?? "pending"} proof for score ${score.score}`}
                  >
                    {score.proof === "confirmed" ? (
                      <ShieldCheck size={17} />
                    ) : (
                      <ExternalLink size={17} />
                    )}
                    <span className="small">
                      {score.proof === "confirmed"
                        ? "Stamped"
                        : score.proof === "reverted"
                          ? "Reverted"
                          : "Pending"}
                    </span>
                  </a>
                ) : (
                  <span className="small muted">
                    {filter === "practice" ? "Local" : "Unstamped"}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-leaderboard">
          <Trophy size={24} />
          <p>No escapes on the board. Yet.</p>
          <span className="small muted">
            {filter === "practice"
              ? "Bail out of a practice run to set your first score."
              : "Lock in a live score to start your board."}
          </span>
        </div>
      )}
      <ScoreProof scores={scores} onProof={onProof} />
    </section>
  );
}
function ScoreProof({
  scores,
  onProof,
}: {
  scores: ScoreEntry[];
  onProof: (
    id: string,
    hash: `0x${string}`,
    status: "pending" | "confirmed" | "reverted",
  ) => void;
}) {
  const { address, isConnected, chainId } = useConnection();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const client = usePublicClient({ chainId: sepolia.id });
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<ScoreEntry | null>(null),
    [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false),
    [success, setSuccess] = useState<`0x${string}` | null>(null);
  const best = scores
    .filter(
      (s) =>
        s.mode === "live" &&
        s.block !== null &&
        (!s.txHash || s.proof === "reverted") &&
        (!s.address || s.address.toLowerCase() === address?.toLowerCase()),
    )
    .sort((a, b) => b.score - a.score)[0];
  const wrongChain = isConnected && chainId !== sepolia.id;
  const send = async () => {
    if (
      !selected ||
      !address ||
      wrongChain ||
      !client ||
      confirming ||
      isPending
    )
      return;
    setError("");
    setSuccess(null);
    try {
      const hash = await sendTransactionAsync({
        account: address,
        chainId: sepolia.id,
        to: address,
        value: 0n,
        data: stringToHex(scorePayload(selected)),
      });
      onProof(selected.id, hash, "pending");
      setSuccess(hash);
      setConfirming(true);
      try {
        const receipt = await client.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 120000,
        });
        onProof(
          selected.id,
          hash,
          receipt.status === "success" ? "confirmed" : "reverted",
        );
        if (receipt.status !== "success")
          setError("The transaction reverted. You can retry this score.");
      } catch {
        setError(
          "Confirmation is taking longer than expected. Check the transaction on Etherscan. Your submitted proof is saved.",
        );
      } finally {
        setConfirming(false);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  return (
    <div className="proof-section">
      <div>
        <ShieldCheck size={20} />
        <h3>Make it block official.</h3>
      </div>
      <p className="small muted">
        Stamp a live score with a 0 ETH self-transaction on Sepolia. A test ETH
        network fee applies.
      </p>
      <button
        className="button secondary full"
        disabled={
          !best || !isConnected || wrongChain || confirming || isPending
        }
        onClick={() => {
          setSelected(best);
          setError("");
          setSuccess(null);
          setOpen(true);
        }}
      >
        Commit high score on-chain
        <ArrowUpRight size={17} />
      </button>
      <p className="small muted">
        {!isConnected
          ? "Connect your wallet above to stamp a saved live score."
          : wrongChain
            ? "Switch your wallet to Sepolia to continue."
            : !best
              ? "Save a live score first. Practice scores stay local."
              : `Ready to stamp: ${formatNumber(best.score)} points.`}
      </p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Stamp your high score"
      >
        <p className="muted">
          Your wallet will send 0 ETH to itself on Ethereum Sepolia. You pay
          only the Sepolia test ETH network fee.
        </p>
        {selected && (
          <dl className="transaction-details">
            <div>
              <dt>Score</dt>
              <dd className="mono">{formatNumber(selected.score)}</dd>
            </div>
            <div>
              <dt>Squeekchain block</dt>
              <dd className="mono">#{selected.block}</dd>
            </div>
            <div>
              <dt>Recipient (you)</dt>
              <dd className="full-address mono">{address}</dd>
            </div>
            <div>
              <dt>Transaction data</dt>
              <dd className="full-address mono">{scorePayload(selected)}</dd>
            </div>
          </dl>
        )}
        <p className="small muted">
          This proves you submitted this score; it does not independently verify
          gameplay.
        </p>
        {success ? (
          <div className="game-result" role="status">
            <Check size={22} />
            <div>
              <strong>
                {confirming
                  ? "Submitted. Waiting for confirmation…"
                  : error
                    ? "Transaction submitted"
                    : "Score stamped on Sepolia"}
              </strong>
              <a
                className="external-link"
                href={`https://sepolia.etherscan.io/tx/${success}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
                <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        ) : (
          <button
            className="button primary full"
            onClick={() => void send()}
            disabled={isPending || !isConnected || wrongChain}
          >
            {isPending
              ? "Confirm in your wallet…"
              : "Confirm 0 ETH transaction"}
          </button>
        )}
        <p className="inline-error" role="status">
          {error}
        </p>
      </Modal>
    </div>
  );
}
