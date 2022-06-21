// Set the name of the Secret set in Autotask
const discordSecretName = 'LiquidationDiscordUrl';
// Name of the Secret in the .env file
const discordEnvSecretName = 'discordUrl';

// Mock the data from the Bot finding
const mockBlockHash = '0x1110890564dbd87ca848b7107487ae5a7d28da1b16707bccd3ba37381ae33419';
const mockMetadata = {
  borrowerAddress: '0x0000000000000000000000000000000000000000',
  liquidationAmount: '1000.00',
  shortfallAmount: '1000.00',
  healthFactor: '0.80',
};

// mock the axios package
const acceptedPost = {
  status: 204,
  statusText: 'No Content',
};
jest.mock('axios', () => jest.fn().mockResolvedValue(acceptedPost));
// eslint-disable-next-line import/no-extraneous-dependencies
const axios = require('axios');

const {
  Finding, FindingType, FindingSeverity,
} = require('forta-agent');

const mockFinding = Finding.fromObject({
  name: 'Placeholder Alert',
  description: 'Placeholder description',
  alertId: 'AE-ALERT-ID',
  type: FindingType.Info,
  severity: FindingSeverity.Info,
  protocol: 'Protocol',
  metadata: mockMetadata,
});

// grab the existing keys before loading new content from the .env file
const existingKeys = Object.keys(process.env);
// eslint-disable-next-line import/no-unresolved
require('dotenv').config();

// now filter out all of the existing keys from what is currently in the process.env Object
const newKeys = Object.keys(process.env).filter((key) => existingKeys.indexOf(key) === -1);
const secrets = {};
newKeys.forEach((key) => {
  secrets[key] = process.env[key];
});

// Map the Env name to the Secret variable name
if (discordSecretName !== discordEnvSecretName) {
  secrets[discordSecretName] = secrets[discordEnvSecretName];
  delete secrets[discordEnvSecretName];
}

// eslint-disable-next-line import/no-useless-path-segments
const { handler } = require('../downloaded/Forta_Liquidation_Monitor');

function createFortaSentinelEvent(finding, blockHash) {
  // Generally findings go from the Bot, to Scan Node, to Sentinel, to Autotasks
  //  with some metadata being added and removed along the way. This function will mimic
  // the Sentinel output with only Finding, block and transaction data.

  // Note: Much of the extra data here is superfluous but is left here just in case future bots
  // want to reference any of the Sentinel data in the Discord output. It also mimics sentinel
  // output more accurately.

  // On block events, the txHash does not exist
  const txHash = '';

  // populate the matchReasons Array with placeholders
  const matchReasons = [
    {
      type: 'alert-id',
      value: 'ALERT_ID_PLACEHOLDER',
    },
    {
      type: 'severity',
      value: 'INFO',
    },
  ];

  // populate the sentinel Object with placeholders
  const sentinel = {
    id: '8fe3d50b-9b52-44ff-b3fd-a304c66e1e56',
    name: 'Sentinel Name Placeholder',
    addresses: [],
    agents: [],
    network: 'mainnet',
    chainId: 1,
  };

  const autotaskEvent = {
    relayerARN: undefined,
    kvstoreARN: undefined,
    credentials: undefined,
    tenantId: undefined,
    secrets,
    request: {
      body: {
        hash: '0xAGENT-HASH', // forta Agent hash
        alert: {
          metadata: finding.metadata,
        },
        source: {
          transactionHash: txHash,
          block: {
            hash: blockHash,
          },
        },
        matchReasons,
        sentinel,
        type: 'FORTA',
      },
    },
  };
  return autotaskEvent;
}

describe('check autotask', () => {
  const url = secrets[discordSecretName];
  const headers = { 'Content-Type': 'application/json' };
  const method = 'post';

  beforeEach(async () => {
    axios.mockClear();
  });

  it('Runs autotask against mock data and posts in Discord', async () => {
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash);

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = '{"content":"[BLOCK](<https://etherscan.io/block/0x1110890564dbd87ca848b7107487ae5a7d28da1b16707bccd3ba37381ae33419>) - [ACCT](<https://etherscan.io/address/0x0000000000000000000000000000000000000000>) 📉💵🔥 **Liquidatable account detected** account 0x0000 is liquidatable for $1000.00"}';
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('throws error if discordUrl is not valid', async () => {
    // Use an invalid discord URL
    secrets[discordSecretName] = 'http//zzzz';
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash);

    // run the autotask on the events
    await expect(handler(autotaskEvent)).rejects.toThrow('discordUrl is not a valid URL');

    expect(axios).toBeCalledTimes(0);
  });
});
