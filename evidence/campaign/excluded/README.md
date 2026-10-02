# Excluded runs

Four `safe` runs from 2026-10-02 00:31 to 00:41. Their stored receipts fail `pnpm verify:receipt` (chunk 0 after chunk 55): when the next round started, its first chunks were appended to the finished round's receipt, and a late recording upload re-saved it. The runtime bug was fixed (the finished receipt is detached before the next run starts) and the four runs were repeated on the fixed code. The receipts and event logs are kept here unchanged; their safe-place decisions are not used in any reported number.
