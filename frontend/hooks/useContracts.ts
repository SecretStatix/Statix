"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { DividendFantasyABI, DBucksABI, CONTRACTS } from "@/lib/abis";

const USDC_DECIMALS = 6;

// Read player price
export function usePlayerPrice(playerIndex: number) {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "getPrice",
    args: [BigInt(playerIndex)],
  });
}

// Read all players
export function useAllPlayers() {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "getAllPlayers",
  });
}

// Read user holdings for a player
export function useHoldings(playerIndex: number, userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "holdings",
    args: [BigInt(playerIndex), userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read user portfolio
export function usePortfolio(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "getPortfolio",
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read buy quote
export function useBuyQuote(playerIndex: number, shares: number) {
  const sharesScaled = parseUnits(shares.toString(), USDC_DECIMALS);
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "getBuyQuote",
    args: [BigInt(playerIndex), sharesScaled],
    query: { enabled: shares > 0 },
  });
}

// Read sell quote
export function useSellQuote(playerIndex: number, shares: number) {
  const sharesScaled = parseUnits(shares.toString(), USDC_DECIMALS);
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
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

// Read D-Bucks allowance (for DividendFantasy contract)
export function useDBucksAllowance(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: "allowance",
    args: [userAddress as `0x${string}`, CONTRACTS.DividendFantasy as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Read unclaimed dividends
export function useUnclaimedDividends(userAddress?: string) {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "getUnclaimedDividends",
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress },
  });
}

// Write: Approve D-Bucks spending (for DividendFantasy contract)
export function useApproveDBucks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: number) => {
    writeContract({
      address: CONTRACTS.DBucks as `0x${string}`,
      abi: DBucksABI,
      functionName: "approve",
      args: [
        CONTRACTS.DividendFantasy as `0x${string}`,
        parseUnits(amount.toString(), USDC_DECIMALS),
      ],
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess };
}

// Write: Buy shares
export function useBuyShares() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buy = (playerIndex: number, shares: number, maxCost: number) => {
    writeContract({
      address: CONTRACTS.DividendFantasy as `0x${string}`,
      abi: DividendFantasyABI,
      functionName: "buy",
      args: [
        BigInt(playerIndex),
        parseUnits(shares.toString(), USDC_DECIMALS),
        parseUnits(maxCost.toString(), USDC_DECIMALS),
      ],
    });
  };

  return { buy, hash, isPending, isConfirming, isSuccess };
}

// Write: Sell shares
export function useSellShares() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const sell = (playerIndex: number, shares: number, minRevenue: number) => {
    writeContract({
      address: CONTRACTS.DividendFantasy as `0x${string}`,
      abi: DividendFantasyABI,
      functionName: "sell",
      args: [
        BigInt(playerIndex),
        parseUnits(shares.toString(), USDC_DECIMALS),
        parseUnits(minRevenue.toString(), USDC_DECIMALS),
      ],
    });
  };

  return { sell, hash, isPending, isConfirming, isSuccess };
}

// Write: D-Bucks faucet (testnet only — mints free D-Bucks, capped per address)
export function useFaucetDBucks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const faucet = (amount: number) => {
    writeContract({
      address: CONTRACTS.DBucks as `0x${string}`,
      abi: DBucksABI,
      functionName: "faucet",
      args: [parseUnits(amount.toString(), USDC_DECIMALS)],
    });
  };

  return { faucet, hash, isPending, isConfirming, isSuccess };
}

// Read current week
export function useCurrentWeek() {
  return useReadContract({
    address: CONTRACTS.DividendFantasy as `0x${string}`,
    abi: DividendFantasyABI,
    functionName: "currentWeek",
  });
}

// Write: Claim dividends for multiple weeks
export function useClaimMultipleWeeks() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimAll = (weeks: number[]) => {
    writeContract({
      address: CONTRACTS.DividendFantasy as `0x${string}`,
      abi: DividendFantasyABI,
      functionName: "claimMultipleWeeks",
      args: [weeks.map((w) => BigInt(w))],
    });
  };

  return { claimAll, hash, isPending, isConfirming, isSuccess };
}

// Helper to format USDC
export function formatUSDC(value: bigint | undefined): string {
  if (!value) return "0.00";
  return formatUnits(value, USDC_DECIMALS);
}
