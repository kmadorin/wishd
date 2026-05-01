# `@wishd/tokens`

A consolidated ERC-20 and native-token metadata registry for the wishd monorepo, built on the Uniswap Token Lists standard. This package sources production-chain tokens from `@uniswap/default-token-list` and merges in hand-curated overrides for testnets (Sepolia) and custom assets. It provides a small ergonomic API (`getToken`, `getTokens`, `findByAddress`, `listChains`) and validates the output against the Uniswap JSON-schema at build time. See the [design spec](docs/superpowers/specs/2026-05-01-wishd-tokens-design.md) for full details on scope, schema, and integration.
