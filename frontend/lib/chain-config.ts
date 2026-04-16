import { baseSepolia, hardhat } from "viem/chains";

/** Set `NEXT_PUBLIC_LOCAL_CHAIN=true` (see `scripts/dev-stack-local.sh`) to use Hardhat @ 127.0.0.1:8545. */
export const isLocalChain = process.env.NEXT_PUBLIC_LOCAL_CHAIN === "true";

export const statixChain = isLocalChain ? hardhat : baseSepolia;

export const CHAIN_ID = statixChain.id;
