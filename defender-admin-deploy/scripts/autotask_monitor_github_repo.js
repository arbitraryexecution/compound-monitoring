const ethers = require('ethers')

const { DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

const { SentinelClient } = require('defender-sentinel-client');


// load values from the .env file
require('dotenv').config();

// load our JSON-RPC endpoint URL
const polygonEndpoint = process.env.POLYGON_ENDPOINT;

const deployerAddress = process.env.DEPLOYER_ADDRESS;

const agentRegistryIface = new ethers.utils.Interface([
    'function createAgent(uint256 agentId, address owner, string calldata metadata, uint256[] calldata chainIds)'
])

const agentRegistryAddress = '0x61447385B019187daa48e91c55c02AF1F1f3F863'

const sentinelName = process.env.SENTINEL_NAME;

exports.handler = async function (autotaskEvent) {
    const provider = new DefenderRelayProvider(autotaskEvent);

    const client = new SentinelClient(autotaskEvent); // this should have the apikeys that get passed in

    provider.on('block', async (blockNumber) => {
        const block = await provider.getBlockWithTransactions(blockNumber)
        const transactions = block.transactions;

        // check if the transaction is targeting the createAgent method on the agentRistrary contract
        let createAgentTransactions = transactions.filter((tx) => {
            function isCreateAgent() {
                // the data field in a transaction starts with the function selector
                return tx.data.startsWith(agentRegistryIface.getSighash('createAgent'))
            }

            function isAgentRegistry() {
                return tx.to === agentRegistryAddress;
            }

            return isCreateAgent() && isAgentRegistry();
        })

        // check if the agent is the one from the proposal ??
        // to do this, should we have a specification in yaml file that makes them input the deployer address
            // if the agent is deployed from this address, then we create a sentinel for it
        
        for (var i=0; i<createAgentTransactions.length; i++) {
            let tx = createAgentTransactions[i];
            // // take the second input in the date field to get agent id
            // function createAgent(uint256 agentId, address owner, string calldata metadata, uint256[] calldata chainIds)
            // first 64 characters should be the method id, second 64 should be the agentId
            let agentId = tx.data.slice(64, 128);

            if (tx.from === deployerAddress) {
                // create sentinel
                const requestParameters = {
                    type: 'FORTA',
                    name: 'Name of Forta Sentinel',
                    // optional
                    addresses: [], // ??
                    // optional
                    agentIDs: [agentId],
                    fortaConditions: {
                      // optional
                      alertIDs: undefined, // string[]
                      minimumScannerCount: 1, // default is 1
                      // optional
                      severity: 2, // (unknown=0, info=1, low=2, medium=3, high=4, critical=5)
                    },
                    // optional
                    paused: false,
                    // optional
                    autotaskCondition: '', // input autotask id here if you want it to trigger another autotask
                    // optional
                    autotaskTrigger: undefined,
                    // optional
                    alertThreshold: {
                      amount: 2,
                      windowSeconds: 3600,
                    },
                    // optional
                    alertTimeoutMs: 0,
                    notificationChannels: [], // create a notification channel if you wish here (slack, email, etc...)
                  };

                // create the sentinel
                await client.create(requestParameters);
            }
        }
    })
}