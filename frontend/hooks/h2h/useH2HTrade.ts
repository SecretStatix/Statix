"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { parseUnits } from "viem";
import { BinaryFPMMABI, BinaryCTFABI, H2H_CONTRACTS } from "@/lib/h2h-abis";
import { DBucksABI, CONTRACTS } from "@/lib/abis";
import { CHAIN_ID } from "@/lib/chain-config";

// H2H markets trade 1:1 against the DBucks collateral. 6 decimals everywhere.
const COLLATERAL_DECIMALS = 6;

const GAS_APPROVE = BigInt(120_000);
const GAS_FPMM = BigInt(1_500_000);
const GAS_CTF = BigInt(500_000);

type Addr = `0x${string}`;
type Side = "A" | "B";

const SIDE_INDEX: Record<Side, number> = { A: 0, B: 1 };

function useInvalidateOnSuccess(isSuccess: boolean, hash: Addr | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess || !hash) return;
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
    queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }, [isSuccess, hash, queryClient]);
}

/** Read (poolA, poolB, priceA, collectedFees) in one batched RPC. */
export function useFPMMState(fpmm: Addr | "" | undefined) {
  const enabled = !!fpmm && fpmm.length === 42;
  const result = useReadContracts({
    contracts: enabled
      ? [
          { address: fpmm as Addr, abi: BinaryFPMMABI, functionName: "poolBalances" },
          { address: fpmm as Addr, abi: BinaryFPMMABI, functionName: "priceA" },
          { address: fpmm as Addr, abi: BinaryFPMMABI, functionName: "collectedFees" },
          { address: fpmm as Addr, abi: BinaryFPMMABI, functionName: "positionIdA" },
          { address: fpmm as Addr, abi: BinaryFPMMABI, functionName: "positionIdB" },
        ]
      : [],
    query: { enabled, refetchInterval: 15_000 },
  });

  const pool = result.data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const priceA_1e18 = result.data?.[1]?.result as bigint | undefined;
  const collectedFees = result.data?.[2]?.result as bigint | undefined;
  const positionIdA = result.data?.[3]?.result as bigint | undefined;
  const positionIdB = result.data?.[4]?.result as bigint | undefined;

  const impliedA = priceA_1e18 != null ? Number(priceA_1e18) / 1e18 : undefined;
  return {
    poolA: pool?.[0],
    poolB: pool?.[1],
    priceA: impliedA,
    collectedFees,
    positionIdA,
    positionIdB,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

/** Preview how many outcome tokens `investment` DBucks would buy on `side`. */
export function useCalcBuyAmount(fpmm: Addr | "" | undefined, investment: number, side: Side) {
  const enabled = !!fpmm && fpmm.length === 42 && investment > 0;
  const scaled = investment > 0 ? parseUnits(investment.toString(), COLLATERAL_DECIMALS) : BigInt(0);
  return useReadContract({
    address: fpmm as Addr,
    abi: BinaryFPMMABI,
    functionName: "calcBuyAmount",
    args: [scaled, SIDE_INDEX[side]],
    query: { enabled, refetchInterval: 15_000 },
  });
}

/** Preview how many DBucks selling `outcomeTokens` of `side` would return. */
export function useCalcSellAmount(fpmm: Addr | "" | undefined, outcomeTokens: number, side: Side) {
  const enabled = !!fpmm && fpmm.length === 42 && outcomeTokens > 0;
  const scaled =
    outcomeTokens > 0 ? parseUnits(outcomeTokens.toString(), COLLATERAL_DECIMALS) : BigInt(0);
  return useReadContract({
    address: fpmm as Addr,
    abi: BinaryFPMMABI,
    functionName: "calcSellAmount",
    args: [scaled, SIDE_INDEX[side]],
    query: { enabled, refetchInterval: 15_000 },
  });
}

/** DBucks allowance toward a given FPMM (each market needs its own approval). */
export function useCollateralAllowance(fpmm: Addr | "" | undefined) {
  const { address } = useAccount();
  const enabled = !!fpmm && fpmm.length === 42 && !!address;
  return useReadContract({
    address: CONTRACTS.DBucks as Addr,
    abi: DBucksABI,
    functionName: "allowance",
    args: [address as Addr, fpmm as Addr],
    query: { enabled },
  });
}

/** Approve max DBucks for an FPMM. */
export function useApproveCollateral(fpmm: Addr | "" | undefined) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateOnSuccess(isSuccess, hash);

  const approve = () => {
    if (!fpmm) return;
    writeContract({
      chainId: CHAIN_ID,
      address: CONTRACTS.DBucks as Addr,
      abi: DBucksABI,
      functionName: "approve",
      args: [
        fpmm as Addr,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      ],
      gas: GAS_APPROVE,
    });
  };
  return { approve, hash, isPending, isConfirming, isSuccess, reset };
}

/** CTF ERC1155 setApprovalForAll(fpmm, true) — required before sell. */
export function useCTFApprovalForFPMM(fpmm: Addr | "" | undefined) {
  const { address } = useAccount();
  const enabled =
    !!fpmm &&
    fpmm.length === 42 &&
    !!address &&
    !!H2H_CONTRACTS.BinaryCTF &&
    H2H_CONTRACTS.BinaryCTF.length === 42;

  const read = useReadContract({
    address: H2H_CONTRACTS.BinaryCTF as Addr,
    abi: BinaryCTFABI,
    functionName: "isApprovedForAll",
    args: [address as Addr, fpmm as Addr],
    query: { enabled },
  });

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateOnSuccess(isSuccess, hash);

  const approveAll = () => {
    if (!fpmm || !H2H_CONTRACTS.BinaryCTF) return;
    writeContract({
      chainId: CHAIN_ID,
      address: H2H_CONTRACTS.BinaryCTF as Addr,
      abi: BinaryCTFABI,
      functionName: "setApprovalForAll",
      args: [fpmm as Addr, true],
      gas: GAS_CTF,
    });
  };

  return {
    isApproved: read.data === true,
    isLoading: read.isLoading,
    approveAll,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    reset,
  };
}

/** Buy `side` outcome tokens with `investment` DBucks, bounded by `minTokens`. */
export function useH2HBuy(fpmm: Addr | "" | undefined) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateOnSuccess(isSuccess, hash);

  const buy = (side: Side, investment: number, minTokens: number) => {
    if (!fpmm) return;
    writeContract({
      chainId: CHAIN_ID,
      address: fpmm as Addr,
      abi: BinaryFPMMABI,
      functionName: "buy",
      args: [
        parseUnits(investment.toString(), COLLATERAL_DECIMALS),
        SIDE_INDEX[side],
        parseUnits(minTokens.toString(), COLLATERAL_DECIMALS),
      ],
      gas: GAS_FPMM,
    });
  };
  return { buy, hash, isPending, isConfirming, isSuccess, reset };
}

/** Sell `outcomeTokens` of `side`, bounded by `minCollateralOut`. */
export function useH2HSell(fpmm: Addr | "" | undefined) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateOnSuccess(isSuccess, hash);

  const sell = (side: Side, outcomeTokens: number, minCollateralOut: number) => {
    if (!fpmm) return;
    writeContract({
      chainId: CHAIN_ID,
      address: fpmm as Addr,
      abi: BinaryFPMMABI,
      functionName: "sell",
      args: [
        parseUnits(outcomeTokens.toString(), COLLATERAL_DECIMALS),
        SIDE_INDEX[side],
        parseUnits(minCollateralOut.toString(), COLLATERAL_DECIMALS),
      ],
      gas: GAS_FPMM,
    });
  };
  return { sell, hash, isPending, isConfirming, isSuccess, reset };
}

/** On-chain ERC1155 balance of a single side for the connected wallet. */
export function useOutcomeBalance(fpmm: Addr | "" | undefined, side: Side) {
  const { address } = useAccount();
  const state = useFPMMState(fpmm);
  const positionId = side === "A" ? state.positionIdA : state.positionIdB;
  const enabled =
    !!address &&
    !!H2H_CONTRACTS.BinaryCTF &&
    H2H_CONTRACTS.BinaryCTF.length === 42 &&
    positionId != null;

  return useReadContract({
    address: H2H_CONTRACTS.BinaryCTF as Addr,
    abi: BinaryCTFABI,
    functionName: "balanceOf",
    args: [address as Addr, (positionId ?? BigInt(0)) as bigint],
    query: { enabled, refetchInterval: 15_000 },
  });
}

/** Redeem resolved positions against the CTF condition. */
export function useH2HRedeem(conditionId: Addr | "" | undefined) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useInvalidateOnSuccess(isSuccess, hash);

  const redeem = () => {
    if (!conditionId || !H2H_CONTRACTS.BinaryCTF || !H2H_CONTRACTS.collateral) return;
    writeContract({
      chainId: CHAIN_ID,
      address: H2H_CONTRACTS.BinaryCTF as Addr,
      abi: BinaryCTFABI,
      functionName: "redeemPositions",
      args: [H2H_CONTRACTS.collateral as Addr, conditionId],
      gas: GAS_CTF,
    });
  };
  return { redeem, hash, isPending, isConfirming, isSuccess, reset };
}

export const H2H_COLLATERAL_DECIMALS = COLLATERAL_DECIMALS;
