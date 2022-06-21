# Compound Governance Event Monitor

## Description

This bot monitors the Compound Finance GovernorBravo contract for specific emitted events related
to Proposals and Voting.  All alert types and severities are set to Info.

## Alerts

<!-- -->
- AE-COMP-GOVERNANCE-PROPOSAL-CREATED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - Proposal ID
    - Proposer address
    - Target addresses for calls to be made during proposal execution
    - Values to be passed to target calls during proposal execution, named "_values" due to a naming collision with JavaScript Object method name
    - Function signatures to be passed during proposal execution
    - Call datas to be passed to each individual function during proposal execution
    - Starting block for voting period
    - Ending block for voting period
    - Description of proposal

<!-- -->
- AE-COMP-GOVERNANCE-VOTE-CAST
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - Voter address
    - Number of votes cast by voter
    - Reason string that accompanies vote
    - First line of proposal description

<!-- -->
- AE-COMP-GOVERNANCE-PROPOSAL-CANCELED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-COMP-GOVERNANCE-PROPOSAL-EXECUTED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-COMP-GOVERNANCE-PROPOSAL-QUEUED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - End block number for proposal to be queued (eta)
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-COMP-GOVERNANCE-PROPOSAL-THRESHOLD-SET
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of GovernorBravo contract
    - Old proposal threshold
    - New proposal threshold


## Testing

The following transactions can be used to test the operation of this bot.

ProposalCanceled - 0x30e5bc0fc04394f505f7edf782bf6a7d5595c2e4c15106358847d24cb9d37a4d

ProposalCreated - 0xb8128ed644be6448123acd0dcc082c8c54d4c999ed1561b82aa405dbd19c84b1

ProposalExecuted - 0x00e6174a179bb8e34d8835a8f4111d659e3b40ab73ee1c073c7917156b0eeff6

ProposalQueued - 0xfd2ccca6807f3a8fd5cd63d62a760759cc7496238255b6f0f2bb2bde68d63f16

ProposalThresholdSet - 0x849061327963a1de927a1cccffaed34631a3962b272a7efbf0caef945fb4e7d3

VoteCast - 0xd3b303df1c7cd21bc8442f436cda91a1ee00872eab212d74ba5ccd8ea067c760

To run, use:
`npm run tx {transactionHash}`