# Override Authoring Guide

## Overview

Token list overrides are used to extend, correct, or supplement the upstream Uniswap token lists. Overrides are merged with the upstream list during the build process and validated against the Uniswap token list schema.

## When to Add an Override

Add a token to an override file when:

1. **Upstream list missing a token**  
   A token not yet in the official Uniswap token lists but needed for your application (e.g., newly deployed tokens, lesser-known assets).

2. **Logo URI correction**  
   A token's `logoURI` is missing, broken, or needs updating in the upstream list.

3. **Testnet token support**  
   Tokens on test networks (e.g., Sepolia) for development and testing. Use a testnet-specific override file (e.g., `sepolia.tokenlist.json`).

## File Structure

Each override file is a standard token list JSON document:

```json
{
  "name": "wishd Sepolia overrides",
  "timestamp": "2026-05-01T00:00:00.000Z",
  "version": { "major": 0, "minor": 0, "patch": 1 },
  "tags": {},
  "logoURI": "",
  "keywords": ["wishd", "sepolia", "testnet"],
  "tokens": [
    {
      "chainId": 11155111,
      "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "name": "USD Coin (Sepolia)",
      "symbol": "USDC",
      "decimals": 6,
      "logoURI": "https://..."
    }
  ]
}
```

## Required Token Fields

Every token in the `tokens` array must include:

- **`chainId`** (number): EVM chain ID (e.g., `1` for Mainnet, `11155111` for Sepolia)
- **`address`** (string): Checksummed token contract address (0x...)
- **`name`** (string): Token display name
- **`symbol`** (string): Token symbol (typically 1–5 characters)
- **`decimals`** (number): Number of decimals (0–18)

Optional fields:
- `logoURI`: URL to the token logo (PNG/SVG recommended)
- `tags`: Array of tags for categorization

## Version Bumping

**Important:** Bump the `version.patch` field on every meaningful edit to the override file. This ensures:
- Clear change history
- Proper cache invalidation in consuming applications
- Correct ordering when merging multiple versions

Example progression:
```json
"version": { "major": 0, "minor": 0, "patch": 1 }  // First edit
"version": { "major": 0, "minor": 0, "patch": 2 }  // Second edit
```

Only bump `major` or `minor` if there's a breaking change or significant feature addition.

## Validation

All token lists (including overrides) are validated against the Uniswap token list schema using AJV.

**Run validation locally:**
```bash
pnpm test
```

**In CI:** The validation harness runs automatically and will fail the build if schema validation fails. Fix any errors before merging.

**Common validation errors:**
- Missing required fields (chainId, address, name, symbol, decimals)
- Invalid chainId (must be a positive integer)
- Invalid address format (must be checksummed 0x...)
- Invalid decimal count (must be 0–18)

## Naming Convention

Use the naming pattern: `{network}.tokenlist.json`

Examples:
- `sepolia.tokenlist.json` — Sepolia testnet overrides
- `mainnet.tokenlist.json` — Mainnet overrides (if needed)
- `polygon.tokenlist.json` — Polygon overrides (if needed)

## Merge Behavior

Overrides are merged with upstream lists in `src/merge.ts`:
- Token address must be unique per chain
- Later overrides take precedence over earlier ones
- The final list is validated before export

## Checklist

When creating or updating an override:

- [ ] File follows naming convention (`{network}.tokenlist.json`)
- [ ] All tokens have required fields: `chainId`, `address`, `name`, `symbol`, `decimals`
- [ ] Addresses are checksummed (use tools like ethers.js: `ethers.getAddress(addr)`)
- [ ] `version.patch` is bumped (or `version.major`/`minor` if significant)
- [ ] Timestamp is updated to current time (ISO 8601 format)
- [ ] Local validation passes: `pnpm test`
- [ ] Override is merged correctly into the final token list

## Tips

- Keep overrides minimal: only add what's missing or needs correction
- Use HTTPS for `logoURI` links
- Test with `pnpm test` before committing
- Document why an override is needed in the commit message
