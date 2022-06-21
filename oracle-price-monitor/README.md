# Compound Oracle Price Monitor Bot

## Description

This bot monitors the UniswapAnchoredProxy contract for PriceGuarded events which indicate that
a ValidatorProxy reported a cToken price that is outside of the Uniswap V2 TWAP percent threshold.

## Alerts

<!-- -->
- AE-COMP-CTOKEN-PRICE-REJECTED
  - Type is always set to `Degraded`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of the affected cToken
    - Address of the underlying token
    - Address of the respective ValidatorProxy contract
    - Anchor Price (current price)
    - Reporter Price (failed price)

## Testing

Running against a real transaction:
```console
npx forta-agent run --tx 0xe9456ccee1b1764dfe80291f3b894a29f0789f20f995de7d88ff186e8cafe55c
```

Run unit tests:
```console
npm test
```