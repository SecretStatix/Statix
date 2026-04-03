# Admin Guide — Changing Contract Parameters

All contract parameters are now configurable by the owner wallet without redeploying. This guide covers three tiers of administration, from CLI scripts to a future multisig setup.

---

## Configurable Parameters

| Parameter | Default | Contract | What it controls |
|-----------|---------|----------|-----------------|
| `feeBps` | 150 (1.5%) | StatixRouter | Total fee charged per trade |
| `dividendFeeBps` | 6700 (67%) | StatixRouter | % of fee that goes to dividend pool (rest goes to protocol) |
| `protocolFeeRecipient` | deployer | StatixRouter | Wallet that receives protocol fees |
| `basePoolBps` | 2000 (20%) | DividendHub | % of dividends split to all holders (rest goes to outperformers) |
| `faucetMode` | true (testnet) | DBucks | Whether free minting is enabled |
| `faucetLimit` | 100,000 DBucks | DBucks | Max free mint per address |
| `defaultInitialShares` | 1,000 | PoolFactory | Starting shares for new player pools |
| `defaultInitialCash` | $10,000 | PoolFactory | Starting cash for new player pools |
| `tradingPaused` | false | StatixRouter | Global trading pause |
| `allowlistEnabled` | false | StatixRouter | Restrict trading to allowlisted addresses |

---

## Tier 1 — Hardhat Scripts (Current)

Run scripts from the terminal on a machine that has the deployer private key in `blockchain/.env`.

### Change Fees

Create `blockchain/scripts/admin/update-fees.js`:

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);

  // Change total fee to 2% (200 basis points)
  await (await router.setFeeBps(200)).wait();
  console.log("Fee updated to 2%");

  // Change dividend split to 80% dividends, 20% protocol
  await (await router.setDividendFeeBps(8000)).wait();
  console.log("Dividend fee split updated to 80/20");
}

main().catch(console.error);
```

Run: `npx hardhat run scripts/admin/update-fees.js --network base-sepolia`

### Change Dividend Split

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const hub = await hre.ethers.getContractAt("DividendHub", deployments.contracts.DividendHub);

  // Change to 30% base pool, 70% outperformer pool
  await (await hub.setBasePoolBps(3000)).wait();
  console.log("Dividend split updated to 30/70");
}

main().catch(console.error);
```

### Change Faucet Limit

**Canonical values:** `frontend/lib/faucet-config.json` (`faucetLimitHuman`, `faucetUiMintPerClickHuman`). `deploy-statix.js` reads that file for `FAUCET_LIMIT`; redeploy or call `setFaucetMode` on an existing DBucks.

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const dbucks = await hre.ethers.getContractAt("DBucks", deployments.contracts.DBucks);

  // Raise faucet limit to 5,000 DBucks per person
  await (await dbucks.setFaucetMode(true, 5000n * 10n ** 6n)).wait();
  console.log("Faucet limit raised to 5,000");

  // Or disable faucet entirely (for mainnet)
  // await (await dbucks.setFaucetMode(false, 0)).wait();
}

main().catch(console.error);
```

### Add a New Player

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const factory = await hre.ethers.getContractAt("PoolFactory", deployments.contracts.PoolFactory);

  // seasonProjection scaled by 1e6
  const projectedPoints = BigInt(Math.round(1800 * 1e6));

  await (await factory.createPool(
    "Victor Wembanyama",  // name
    "VW1",                // symbol
    "wembanyama_1",       // unique player ID
    projectedPoints
  )).wait();

  console.log("Player added. New pool count:", (await factory.poolCount()).toString());
}

main().catch(console.error);
```

### Pause/Unpause Trading

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);

  await (await router.setTradingPaused(true)).wait();
  console.log("Trading PAUSED");

  // To unpause:
  // await (await router.setTradingPaused(false)).wait();
}

main().catch(console.error);
```

### Blacklist an Address

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);

  await (await router.setBlacklist("0xABUSER_ADDRESS_HERE", true)).wait();
  console.log("Address blacklisted (can still sell, cannot buy)");
}

main().catch(console.error);
```

### Change Protocol Fee Recipient

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);

  await (await router.setProtocolFeeRecipient("0xNEW_WALLET_HERE")).wait();
  console.log("Protocol fee recipient updated");
}

main().catch(console.error);
```

### Emergency Shutdown + Drain

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);

  // Step 1: Shutdown (pauses trading, enables emergency exit for users)
  await (await router.emergencyShutdown()).wait();
  console.log("SHUTDOWN — trading halted, users can emergency exit");

  // Step 2: Wait for users to exit, then drain remaining funds
  // await (await router.emergencyDrain("0xSAFE_WALLET_HERE")).wait();
  // console.log("All funds drained to safe wallet");
}

main().catch(console.error);
```

---

## Tier 2 — Admin Dashboard (Next Priority)

A protected page in the existing Next.js frontend at `/admin`. Uses the same Privy wallet connection — only renders controls if the connected wallet matches the owner address.

### What to Build

```
/admin
├── Fee Management
│   ├── Current fee: 1.5% [input] [Update]
│   ├── Dividend split: 67/33 [input] [Update]
│   └── Protocol fee recipient: 0x... [input] [Update]
│
├── Dividend Config
│   └── Base/Outperformer split: 20/80 [input] [Update]
│
├── Player Management
│   ├── Add Player [form: name, symbol, id, projection]
│   ├── Deactivate Player [dropdown] [Toggle]
│   └── Reset Pool [dropdown, shares, cash] [Reset]
│
├── Trading Controls
│   ├── Pause Trading [toggle]
│   ├── Blacklist Address [input] [Ban/Unban]
│   └── Allowlist Mode [toggle]
│
├── Faucet
│   ├── Current limit: 1,000 [input] [Update]
│   └── Enabled: Yes [toggle]
│
└── Emergency
    ├── [Shutdown] (requires confirmation dialog)
    └── [Drain to address] (requires confirmation dialog)
```

### Access Control

The frontend just checks the connected wallet:

```typescript
const OWNER_ADDRESS = deployments.deployer;
const { address } = useAccount();
const isOwner = address?.toLowerCase() === OWNER_ADDRESS.toLowerCase();

if (!isOwner) return <p>Not authorized</p>;
```

The real security is on-chain — the contracts reject any transaction not from the owner wallet, regardless of what the frontend shows.

### How Each Button Works

Each button calls a wagmi `useWriteContract` hook:

```typescript
const { writeContract } = useWriteContract();

// Example: update fee
writeContract({
  address: ROUTER_ADDRESS,
  abi: StatixRouterABI,
  functionName: 'setFeeBps',
  args: [200], // 2%
});
```

No backend needed. The frontend talks directly to the blockchain.

---

## Tier 3 — Multisig (When Real Money Is Involved)

Replace the single owner wallet with a Gnosis Safe multisig. Requires multiple team members to approve any parameter change.

### Setup (10 minutes)

1. Go to https://app.safe.global
2. Connect on Base Sepolia (or Base mainnet when ready)
3. Create a new Safe with your team's wallets (e.g., 2-of-3 signers)
4. Note the Safe address

### Transfer Ownership

Run once to hand control from deployer to the multisig:

```javascript
const hre = require("hardhat");
const deployments = require("../deployments.json");

const MULTISIG = "0xYOUR_SAFE_ADDRESS";

async function main() {
  const router = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);
  const hub = await hre.ethers.getContractAt("DividendHub", deployments.contracts.DividendHub);
  const factory = await hre.ethers.getContractAt("PoolFactory", deployments.contracts.PoolFactory);
  const dbucks = await hre.ethers.getContractAt("DBucks", deployments.contracts.DBucks);

  await (await router.transferOwnership(MULTISIG)).wait();
  await (await hub.transferOwnership(MULTISIG)).wait();
  await (await factory.transferOwnership(MULTISIG)).wait();
  await (await dbucks.transferOwnership(MULTISIG)).wait();

  console.log("All contracts now owned by multisig:", MULTISIG);
  console.log("Your deployer wallet can no longer make changes.");
}

main().catch(console.error);
```

After this, your deployer wallet loses all admin access. All changes go through the Safe UI where multiple signers must approve.

### How Changes Work After Multisig

1. One signer proposes a transaction in the Safe UI (e.g., call `router.setFeeBps(200)`)
2. Other signers review and confirm
3. Once threshold is met (e.g., 2 of 3), the transaction executes on-chain
4. No single person can make changes unilaterally

### When to Do This

- **MVP with friends on testnet**: Skip. Single wallet is fine.
- **Public beta with strangers' money**: Set up multisig.
- **Mainnet with real USDC**: Mandatory. No exceptions.

---

## Quick Reference

| What you want to do | Function | Contract |
|---------------------|----------|----------|
| Change trade fee | `setFeeBps(uint256)` | StatixRouter |
| Change dividend/protocol split | `setDividendFeeBps(uint256)` | StatixRouter |
| Change fee recipient | `setProtocolFeeRecipient(address)` | StatixRouter |
| Change base/outperformer split | `setBasePoolBps(uint256)` | DividendHub |
| Add a player | `createPool(name, symbol, id, points)` | PoolFactory |
| Remove a player | `setPlayerActive(index, false)` | StatixRouter |
| Pause all trading | `setTradingPaused(true)` | StatixRouter |
| Ban a user | `setBlacklist(address, true)` | StatixRouter |
| Change faucet limit | `setFaucetMode(true, newLimit)` | DBucks |
| Disable faucet | `setFaucetMode(false, 0)` | DBucks |
| Nuclear shutdown | `emergencyShutdown()` | StatixRouter |
| Drain all funds | `emergencyDrain(safeAddress)` | StatixRouter |
| Transfer ownership | `transferOwnership(newOwner)` | All contracts |
