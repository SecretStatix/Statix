Vendor directory for Gnosis contracts.

Populated in P1. Will contain:

  ConditionalTokens.sol          — from gnosis/conditional-tokens-contracts
  FixedProductMarketMaker.sol    — from gnosis/conditional-tokens-market-makers
  FPMMDeterministicFactory.sol   — from gnosis/conditional-tokens-market-makers

Both repos are MIT-licensed. We copy rather than depend on an npm package
because (a) the originals target older Solidity versions and need minor
adaptation to ^0.8.24, and (b) vendoring keeps the build pinned and
reviewable.
