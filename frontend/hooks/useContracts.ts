"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { StatixRouterABI, DividendHubABI, DBucksABI, CONTRACTS } from "@/lib/abis";
import { FAUCET_UI_MINT_AMOUNT } from "@/lib/faucet-config";

const USDC_DECIMALS = 6;
/** Base Sepolia — same chain as Privy `defaultChain` / `supportedChains` and wagmi `chains`. */
const CHAIN_ID = baseSepolia.id;

/** Manual gas limits (gas units). Tune if Privy/wallet under-estimates or txs fail. */
const GAS_APPROVE = BigInt(120_000);
const GAS_ROUTER = BigInt(1_200_000);
const GAS_FAUCET = BigInt(300_000);
const GAS_CLAIM_WEEKS = BigInt(2_000_000);

/** Invalidate cached wagmi `readContract` queries so portfolio/quotes refresh after a tx. */
function useInvalidateReadContractsOnTxSuccess(isSuccess: boolean, hash: `0x${string}` | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess || !hash) return;
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
  }, [isSuccess, hash, queryClient]);
}

// Read player price
export function usePlayerPrice(playerIndex: number) {
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getPrice",
    args: [BigInt(playerIndex)],
  });
}

// Read all players
export function useAllPlayers() {
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getAllPlayers",
  });
}

// Read user holdings for a player
export function useHoldings(playerIndex: number, userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getHoldings",
    args: [BigInt(playerIndex), userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read user portfolio
export function usePortfolio(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getPortfolio",
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read buy quote
export function useBuyQuote(playerIndex: number, shares: number) {
  const sharesScaled = parseUnits(shares.toString(), USDC_DECIMALS);
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getBuyQuote",
    args: [BigInt(playerIndex), sharesScaled],
    query: { enabled: shares > 0 },
  });
}

// Read sell quote
export function useSellQuote(playerIndex: number, shares: number) {
  const sharesScaled = parseUnits(shares.toString(), USDC_DECIMALS);
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "getSellQuote",
    args: [BigInt(playerIndex), sharesScaled],
    query: { enabled: shares > 0 },
  });
}

// Read D-Bucks balance
export function useDBucksBalance(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "balanceOf",
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read D-Bucks allowance (for StatixRouter — users approve Router once)
export function useDBucksAllowance(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "allowance",
    args: [userAddress as `0x${string}`, CONTRACTS.StatixRouter as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read unclaimed dividends (from DividendHub)
export function useUnclaimedDividends(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DividendHub as `0x${string}`,
    abi: DividendHubABI,
    functionName: "getUnclaimedDividends",
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Write: Approve D-Bucks spending (for StatixRouter — one-time approval)
export function useApproveDBucks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateReadContractsOnTxSuccess(isSuccess, hash);

  const approve = (amount: number) => {
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.DBucks as `0x${string}`,
      abi: DBucksABI,
      functionName: "approve",
      args: [
        CONTRACTS.StatixRouter as `0x${string}`,
        parseUnits(amount.toString(), USDC_DECIMALS),
      ],
      gas: GAS_APPROVE,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess };
}

// Write: Buy shares (via StatixRouter)
export function useBuyShares() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateReadContractsOnTxSuccess(isSuccess, hash);

  const buy = (playerIndex: number, shares: number, maxCost: number) => {
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.StatixRouter as `0x${string}`,
      abi: StatixRouterABI,
      functionName: "buy",
      args: [
        BigInt(playerIndex),
        parseUnits(shares.toString(), USDC_DECIMALS),
        parseUnits(maxCost.toString(), USDC_DECIMALS),
      ],
      gas: GAS_ROUTER,
    });
  };

  return { buy, hash, isPending, isConfirming, isSuccess };
}

// Write: Sell shares (via StatixRouter)
export function useSellShares() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateReadContractsOnTxSuccess(isSuccess, hash);

  const sell = (playerIndex: number, shares: number, minRevenue: number) => {
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.StatixRouter as `0x${string}`,
      abi: StatixRouterABI,
      functionName: "sell",
      args: [
        BigInt(playerIndex),
        parseUnits(shares.toString(), USDC_DECIMALS),
        parseUnits(minRevenue.toString(), USDC_DECIMALS),
      ],
      gas: GAS_ROUTER,
    });
  };

  return { sell, hash, isPending, isConfirming, isSuccess };
}

export { FAUCET_UI_MINT_AMOUNT, FAUCET_LIMIT_HUMAN } from "@/lib/faucet-config";

/** On-chain faucet cap: `faucetMinted + amount <= faucetLimit` (see DBucks.sol). */
export function useFaucetEligibility(userAddress?: `0x${string}`) {
  const { data: mode } = useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "faucetMode",
  });
  const { data: limit } = useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "faucetLimit",
  });
  const { data: minted } = useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "faucetMinted",
    args: [userAddress ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!userAddress },
  });

  const requestAmount = parseUnits(String(FAUCET_UI_MINT_AMOUNT), USDC_DECIMALS);
  const loaded = mode !== undefined && limit !== undefined && minted !== undefined;
  const canMintFull =
    loaded &&
    mode === true &&
    (minted as bigint) + requestAmount <= (limit as bigint);
  const capReached =
    loaded && mode === true && (minted as bigint) + requestAmount > (limit as bigint);

  return { faucetMode: mode, limit, minted, canMintFull, capReached, requestAmount };
}

// Write: D-Bucks faucet (testnet only — mints free D-Bucks, capped per address)
export function useFaucetDBucks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateReadContractsOnTxSuccess(isSuccess, hash);

  const faucet = (amount: number) => {
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.DBucks as `0x${string}`,
      abi: DBucksABI,
      functionName: "faucet",
      args: [parseUnits(amount.toString(), USDC_DECIMALS)],
      gas: GAS_FAUCET,
    });
  };
  
  return { faucet, hash, isPending, isConfirming, isSuccess };
}

// Read trading paused state (from StatixRouter)
export function useTradingPaused() {
  return useReadContract({
    address: CONTRACTS.StatixRouter as `0x${string}`,
    abi: StatixRouterABI,
    functionName: "tradingPaused",
  });
}

// Read current round (from DividendHub)
export function useCurrentWeek() {
  return useReadContract({
    address: CONTRACTS.DividendHub as `0x${string}`,
    abi: DividendHubABI,
    functionName: "currentRound",
  });
}

// Write: Claim dividends for multiple rounds (via DividendHub)
export function useClaimMultipleWeeks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateReadContractsOnTxSuccess(isSuccess, hash);

  const claimAll = (rounds: number[]) => {
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.DividendHub as `0x${string}`,
      abi: DividendHubABI,
      functionName: "claimMultipleRounds",
      args: [rounds.map((r) => BigInt(r))],
      gas: GAS_CLAIM_WEEKS,
    });
  };

  return { claimAll, hash, isPending, isConfirming, isSuccess };
}

// Helper to format USDC
export function formatUSDC(value: bigint | undefined): string {
  if (!value) return "0.00";
  return formatUnits(value, USDC_DECIMALS);
}
