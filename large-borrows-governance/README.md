# Compound Large Borrows Governance Bot

## Description

This bot monitors all borrow events of COMP to see if the borrower address has accrued enough COMP
to pass significant governance thresholds. This can be an early indication of governance attacks.

## Alerts

<!-- -->
- AE-COMP-GOVERNANCE-THRESHOLD
  - Type is always set to `Suspicious`
  - Severity is set to `Medium` for the proposal threshold alert and `High` for the voting quorum
    threshold alert
  - Metadata field contains:
    - Borrower address
    - Governance threshold level that has been surpassed, which can be either `proposal` or `votingQuorum`
    - The minimum amount of COMP needed to pass the respective governance threshold
    - The amount of COMP owned by the borrower address

## Testing

Run unit tests:
```console
npm test
```