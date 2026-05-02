# Free-text rehearsal phrasings

Run dev server. In free-text mode (`type instead`), submit each phrasing and confirm the resulting widget fields match expectation.

| Phrasing | Expected widget | Expected fields |
|---|---|---|
| `swap 0.001 eth for usdc on sepolia` | swap-summary | amount=0.001, assetIn=ETH, assetOut=USDC, chain=ethereum-sepolia |
| `lend 50 usdc on compound` | compound-summary | amount=50, asset=USDC, chain=ethereum-sepolia, protocol=compound-v3 |

If a phrasing fails, capture the actual call in the AgentActivityPanel, then either adjust the system prompt or pick a different phrasing for the recording.
