import { createPublicClient, formatEther, http } from "viem";
import { env } from "../config/env.js";
import { getSettlementRelayerAddress } from "./settlementExecutor.js";

const opsPublicClient = createPublicClient({
  transport: http(env.RPC_URL),
});

export async function readBackendSignerHealth() {
  const relayerAddress = getSettlementRelayerAddress();
  const balanceWei = await opsPublicClient.getBalance({
    address: relayerAddress,
  });
  const balanceNative = Number(formatEther(balanceWei));

  return {
    relayerAddress,
    balanceWei: balanceWei.toString(),
    balanceNative,
    nativeSymbol: env.NATIVE_TOKEN_SYMBOL,
    healthy: balanceNative >= env.MIN_RECOMMENDED_NATIVE_BALANCE,
    minRecommendedNative: env.MIN_RECOMMENDED_NATIVE_BALANCE,
  };
}
