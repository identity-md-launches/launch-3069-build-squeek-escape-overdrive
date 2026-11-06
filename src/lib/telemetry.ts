import { useQuery } from "@tanstack/react-query";

export const API = "https://api.squeekchain.com/v1";
export type Telemetry = {
  rpm: number;
  running: boolean;
  distance: number | null;
  blockHeight: number;
};
export type Settlement = {
  height: number;
  workUnits: number;
  hash: string;
  timestamp: number | null;
};
export type Economy = {
  totalWork: number | null;
  totalSettlements: number | null;
  supply: number | null;
};
type RecordData = Record<string, unknown>;
const record = (x: unknown): RecordData =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as RecordData) : {};
export const unwrap = (x: unknown): RecordData => {
  const r = record(x);
  return r.data && typeof r.data === "object" ? record(r.data) : r;
};
export function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      typeof value === "boolean"
    )
      continue;
    const n =
      typeof value === "string" || typeof value === "number"
        ? Number(value)
        : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}
export function parseStatus(raw: unknown): Telemetry {
  const r = unwrap(raw),
    wheel = record(r.wheel ?? r.hamster ?? r.telemetry),
    chain = record(r.chain);
  const rpm = numberValue(
    r.rpm,
    r.current_rpm,
    r.currentRpm,
    wheel.rpm,
    wheel.current_rpm,
  );
  const blockHeight = numberValue(
    r.block_height,
    r.blockHeight,
    r.height,
    chain.block_height,
    chain.height,
    chain.blockHeight,
  );
  if (
    rpm === null ||
    blockHeight === null ||
    !Number.isSafeInteger(blockHeight)
  )
    throw new Error("The status response is missing RPM or block height.");
  const state =
    r.state ?? r.wheel_state ?? r.status ?? wheel.state ?? wheel.status;
  const sleeping = /sleep|idle|stop|rest/i.test(String(state));
  const flag =
    typeof r.running === "boolean"
      ? r.running
      : typeof wheel.running === "boolean"
        ? wheel.running
        : !sleeping;
  return {
    rpm,
    blockHeight,
    running: flag && rpm > 0,
    distance: numberValue(
      r.distance_m,
      r.distance_meters,
      r.distance,
      wheel.distance_m,
      wheel.distance,
    ),
  };
}
export function parseSettlements(raw: unknown): Settlement[] {
  const r = unwrap(raw);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(r.settlements)
      ? r.settlements
      : Array.isArray(r.items)
        ? r.items
        : Array.isArray(r.blocks)
          ? r.blocks
          : Array.isArray(record(raw).data)
            ? record(raw).data
            : undefined;
  if (!Array.isArray(list))
    throw new Error("The settlements response has an unrecognized format.");
  const result = list.flatMap((item): Settlement[] => {
    const s = record(item),
      height = numberValue(
        s.block_height,
        s.blockHeight,
        s.height,
        s.block_number,
      );
    const workUnits = numberValue(
      s.work_units,
      s.workUnits,
      s.work,
      s.total_work_units,
    );
    const hash =
      s.hash ?? s.block_hash ?? s.blockHash ?? s.settlement_hash ?? s.tx_hash;
    if (
      height === null ||
      !Number.isSafeInteger(height) ||
      workUnits === null ||
      typeof hash !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(hash)
    )
      return [];
    const date = s.timestamp ?? s.settled_at ?? s.created_at;
    const timestamp =
      typeof date === "string" && !/^\d+$/.test(date)
        ? Date.parse(date)
        : numberValue(date);
    return [
      {
        height,
        workUnits,
        hash,
        timestamp:
          timestamp !== null && Number.isFinite(timestamp)
            ? timestamp < 1e12
              ? timestamp * 1000
              : timestamp
            : null,
      },
    ];
  });
  if (list.length > 0 && result.length === 0)
    throw new Error(
      "Settlements are missing block height, work units, or a valid hash.",
    );
  return [...new Map(result.map((s) => [s.height, s])).values()].sort(
    (a, b) => b.height - a.height,
  );
}
export function parseEconomy(raw: unknown): Economy {
  const r = unwrap(raw);
  const economy = {
    totalWork: numberValue(
      r.total_work_units,
      r.totalWorkUnits,
      r.total_work,
      r.work_units,
    ),
    totalSettlements: numberValue(
      r.total_settlements,
      r.totalSettlements,
      r.settlement_count,
    ),
    supply: numberValue(r.total_supply, r.totalSupply, r.circulating_supply),
  };
  if (Object.values(economy).every((v) => v === null))
    throw new Error("The economy response has an unrecognized format.");
  return economy;
}
export function parseHolder(raw: unknown): boolean {
  const r = unwrap(raw),
    nft = record(r.nft ?? r.nfts);
  const flag =
    r.is_holder ?? r.isHolder ?? r.nft_holder ?? r.is_nft_holder ?? r.holder;
  if (typeof flag === "boolean") return flag;
  const count = numberValue(
    r.nft_balance,
    r.nftBalance,
    r.nft_count,
    r.nftCount,
    r.squeek_nft_balance,
    nft.balance,
    nft.count,
  );
  if (count !== null) return count > 0;
  if (Array.isArray(r.nfts)) return r.nfts.length > 0;
  throw new Error("Holder status is not available in this account response.");
}
export async function fetchApi<T>(
  path: string,
  parse: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(8000);
  const response = await fetch(`${API}${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Squeekchain returned HTTP ${response.status}.`);
  if (!response.headers.get("content-type")?.includes("json"))
    throw new Error("Squeekchain returned a non-JSON response.");
  return parse(await response.json());
}
export function useTelemetry() {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: ({ signal }) => fetchApi("/status", parseStatus, signal),
    refetchInterval: 4000,
    retry: false,
  });
  const economy = useQuery({
    queryKey: ["economy"],
    queryFn: ({ signal }) => fetchApi("/economy/state", parseEconomy, signal),
    refetchInterval: 20000,
    retry: false,
  });
  const settlements = useQuery({
    queryKey: ["settlements"],
    queryFn: ({ signal }) =>
      fetchApi("/settlements?range=24h", parseSettlements, signal),
    refetchInterval: 15000,
    retry: false,
  });
  return { status, economy, settlements };
}
export const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "–"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
