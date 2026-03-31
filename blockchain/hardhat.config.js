require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();
const hasValidKey =
  !!PRIVATE_KEY &&
  (PRIVATE_KEY.length === 64 ||
    (PRIVATE_KEY.startsWith("0x") && PRIVATE_KEY.length === 66));

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: hasValidKey ? [PRIVATE_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: hasValidKey ? [PRIVATE_KEY] : [],
    },
  },
};
