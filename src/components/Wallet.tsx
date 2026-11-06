import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, LogOut, LoaderCircle } from "lucide-react";
import {
  useConnection,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { getAddress } from "viem";
import { Modal } from "./Modal";
import { OPEN_IN, sepolia, shortAddress, friendlyError } from "../lib/wallet";
export function WalletControl() {
  const { address, isConnected, chainId } = useConnection();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected") &&
    !Boolean((window as Window & { ethereum?: unknown }).ethereum);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  useEffect(() => {
    if (isConnected) {
      setOpen(false);
      setError("");
    }
  }, [isConnected]);
  const wrong = isConnected && chainId !== sepolia.id;
  const switchNetwork = async () => {
    setError("");
    try {
      await switchChainAsync({ chainId: sepolia.id });
    } catch (e) {
      setError(friendlyError(e));
      setOpen(true);
    }
  };
  return (
    <>
      <button
        className="wallet-button"
        onClick={() => {
          setError("");
          if (wrong) void switchNetwork();
          else setOpen(true);
        }}
        disabled={switching}
      >
        <Wallet size={16} />
        <span>
          {switching
            ? "Switching…"
            : wrong
              ? "Switch to Sepolia"
              : isConnected && address
                ? shortAddress(getAddress(address))
                : "Connect wallet"}
        </span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isConnected ? "Wallet connected" : "Connect a wallet"}
        className="wallet-modal"
      >
        {isConnected && address ? (
          <>
            <p className="muted">Ethereum Sepolia · Chain 11155111</p>
            <p className="full-address mono">{getAddress(address)}</p>
            {wrong && (
              <button
                className="button primary"
                onClick={() => void switchNetwork()}
                disabled={switching}
              >
                Switch to Sepolia
              </button>
            )}
            <button
              className="button wallet-row"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              <LogOut size={20} />
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Optional to play. Needed to stamp a live score.
            </p>
            <div className="wallet-list">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id === "metamask" ? "metaMask" : w.id}.svg`}
                      alt=""
                      width="28"
                      height="28"
                    />
                    <span>Open in {w.name}</span>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
              {listed.map((connector) => (
                <button
                  className="wallet-row"
                  key={connector.uid}
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector });
                    } catch (e) {
                      setError(friendlyError(e));
                    }
                  }}
                >
                  {connector.icon ? (
                    <img src={connector.icon} alt="" width="28" height="28" />
                  ) : connector.id === "coinbaseWalletSDK" ? (
                    <img
                      src="./wallets/coinbase.svg"
                      alt=""
                      width="28"
                      height="28"
                    />
                  ) : (
                    <Wallet size={28} />
                  )}
                  <span>
                    {connector.id === "injected"
                      ? "Browser wallet"
                      : connector.id === "coinbaseWalletSDK" && mobile
                        ? "Coinbase Smart Wallet"
                        : connector.name}
                    {isPending && variables?.connector === connector
                      ? " · opening…"
                      : ""}
                  </span>
                  {isPending && variables?.connector === connector ? (
                    <LoaderCircle size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </button>
              ))}
            </div>
            <p className="small muted">
              No real ETH is needed. Sepolia test ETH covers transaction fees.
            </p>
          </>
        )}
        <p className="inline-error" role="status">
          {error}
        </p>
      </Modal>
    </>
  );
}
