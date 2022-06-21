# Compound Low Liquidity Market Attack Monitor

## Description

This bot monitors Compound Finance cToken contracts that have low liquidity for potential
market attacks where a malicious actor mints cTokens and then transfers additional tokens in
order to unbalance the contract such that subsequent mints will not yield cTokens.

## Alerts

<!-- -->
- AE-COMP-MARKET-ATTACK-EVENT
  - Type is always set to `Suspicious`
  - Severity is always set to `Info`
  - Metadata field contains:
    - COMP Token symbol
    - COMP Token Address
    - Minted Amount
    - Minted COMP Tokens
    - Malicious Address
    - Malicious Transfer Amount