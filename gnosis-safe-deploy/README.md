# Forta Deployment from a Gnosis Safe


## Deploy a Gnosis Safe to Polygon

Create a `config.json` file (see the `config.json.example` file for reference), specifying the addresses of the owners, the number of signatures necessary for a proposal to be approved, and the
version of the Gnosis Safe to deploy (valid versions are 1.0.0, 1.1.0, 1.1.1, 1.2.0, and 1.3.0).
```json
{
    "safeAccountConfig": {
        "owners": [
            "0xFIRSTADDRESS",
            "0xSECONDADDRESS",
            ...
            "0xLASTADDRESS"
        ],
        "threshold": numberOfSignaturesNeeded
    },
    "safeVersion": "gnosisSafeVersionNumber"
}
```

Also, in the `.env` file, you will need to add the following entries to be able to interact with a Polygon JSON-RPC provider
```bash
POLYGON_ENDPOINT="https://your.polygon.endpoint/with/api/key"
DEPLOYER_PRIVATE_KEY="0xPRIVATEKEYFORPOLYGONACCOUNTTODEPLOYSAFE"
```

Make sure that the Deployer's account has MATIC to be able to deploy the contract.

Then run:
`npm run deploy`

This should deploy a Gnosis Safe Proxy contract to Polygon, display the address of the contract, and save the address to a JSON
format file called `deployments.json` in the main directory of the repository.


## Create a Forta Bot

The steps for creating a Forta Bot can be found in the Forta Docs: `https://docs.forta.network/en/latest/quickstart/`

The Forta Bot files should be placed directly in this directory in order for the included scripts to operate correctly.

Ensure that you create a `forta.config.json` file for local testing, as well as that you have created a keyfile that will reside
in your `~/.forta` directory.


## Propose Forta Bot Deployment

Ensure that you have updated the Dockerfile to appropriately pull in all dependencies needed by the Forta Bot code.

In the `.env` file, you will need to have the following entries:
```bash
POLYGON_ENDPOINT="https://your.polygon.endpoint/with/api/key"
POLYGON_SAFE_ADDRESS="0xADDRESSOFDEPLOYEDGNOSISSAFE"
PROPOSE_PRIVATE_KEY="0xPRIVATEKEYFORGNOSISSAFEOWNER"
```

Then run:
`npm run propose`


## Approve Proposed Forta Bot Deployment

Approving the proposed transaction can be performed through the Gnosis Safe Web UI (recommended), or through the command line.

In the `.env` file, you will need to have the following entries:
```bash
POLYGON_ENDPOINT="https://your.polygon.endpoint/with/api/key"
POLYGON_SAFE_ADDRESS="0xADDRESSOFDEPLOYEDGNOSISSAFE"
APPROVER_PRIVATE_KEY="0xPRIVATEKEYFORGNOSISSAFEOWNER"
SAFE_TX_HASH="0xPROPOSEDTRANSACTIONHASH"
```

Then run:
`npm run approve`


## Execute Approved Forta Bot Deployment Transaction

Executing the approved transaction can be performed through the Gnosis Safe Web UI (recommended), or through the command line.

In the `.env` file, you will need to have the following entries:
```bash
POLYGON_ENDPOINT="https://your.polygon.endpoint/with/api/key"
POLYGON_SAFE_ADDRESS="0xADDRESSOFDEPLOYEDGNOSISSAFE"
EXECUTION_PRIVATE_KEY="0xPRIVATEKEYFORGNOSISSAFEOWNER"
SAFE_TX_HASH="0xPROPOSEDTRANSACTIONHASH"
```

Then run:
`npm run execute`


## Reject Proposed Forta Bot Deployment

Rejecting a transaction can be performed through the Gnosis Safe Web UI (recommended), or through the command line.

From the command line, rejecting a proposed transaction actually involves proposing another transaction with the same nonce as the transaction that one wishes to reject.
That new transaction will then need to be approved and executed before another transaction with the next nonce can be executed.

In the `.env` file, you will need to have the following entries:
```bash
POLYGON_ENDPOINT="https://your.polygon.endpoint/with/api/key"
POLYGON_SAFE_ADDRESS="0xADDRESSOFDEPLOYEDGNOSISSAFE"
PROPOSE_PRIVATE_KEY="0xPRIVATEKEYFORGNOSISSAFEOWNER"
NONCE_TO_REJECT={integerValue}
```

Then run:
`npm run reject`
