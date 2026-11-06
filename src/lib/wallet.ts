import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
export { sepolia };
export const SITE_NAME = "Squeek Escape: Overdrive";
export const PUBLIC_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [sepolia.id]: http(PUBLIC_RPC_URL) },
});
export const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  // Rabby Mobile's production universal-link handler: hooks/universalLink.ts.
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|4001/i.test(message))
    return "Request declined. You can try again when ready.";
  if (/not found|not installed|unavailable|ProviderNotFound/i.test(message))
    return "No browser wallet found. Install a wallet or choose Coinbase Wallet.";
  if (/funds|balance/i.test(message))
    return "Add Sepolia test ETH to cover the network fee, then try again.";
  if (/timeout|timed out/i.test(message))
    return "The request timed out. Check your wallet and try again.";
  return "The wallet request could not finish. Check your wallet and try again.";
}
