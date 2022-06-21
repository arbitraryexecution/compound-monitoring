// Set the name of the Secret set in Autotask
const discordSecretName = 'DiscordUrl';
// Name of the Secret in the .env file
const discordEnvSecretName = 'discordUrl';

// Mock the data from the Bot finding
// Random block
const mockBlockHash = '0x1110890564dbd87ca848b7107487ae5a7d28da1b16707bccd3ba37381ae33419';

const mockBorrowTxHash = '0xf8d92b4b59c84bac00a57356f488dd9586f17e7034613c158372ef4375d7a502';
const mockBorrowMeta = {
  accountBorrows: '18500000000',
  borrowAmount: '18500000000',
  borrower: '0x87760d238Bc8A46d64990185aB357CAF99740d09',
  cTokenSymbol: 'cUSDC',
  contractAddress: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  eventName: 'Borrow',
  totalBorrows: '450187856880124',
  usdValue: '18537',
};

const mockLiquidateBorrowTxHash = '0x064228d15febb05b929e8aecbf3d828449bd8210df758d692b9b855355ed3560';
const mockLiquidateBorrowMeta = {
  borrower: '0xf1C6A281452fEdEAda164731895B1a38b5476516',
  cTokenCollateral: '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5',
  cTokenSymbol: 'cUSDT',
  contractAddress: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
  eventName: 'LiquidateBorrow',
  liquidator: '0xD911560979B78821D7b045C79E36E9CbfC2F6C6F',
  repayAmount: '880985666',
  seizeTokens: '2710480386',
  usdValue: '881',
};

const mockMintTxHash = '0xff85476c183ef3cc0fb0623877abf5589197a773845f8acac341e48c42957a3e';
const mockMintMeta = {
  cTokenSymbol: 'cETH',
  contractAddress: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
  eventName: 'Mint',
  mintAmount: '38307619381957671712',
  mintTokens: '190925893578',
  minter: '0x352E490bC98BB07AA908Cc2934b6Ca473a6b229d',
  usdValue: '67721',
};

const mockRedeemTxHash = '0x881d7f5b2804d144535f7b51f504ba6bcf14f3ccd53d57f4e59e0ad262bddeb5';
const mockRedeemMeta = {
  cTokenSymbol: 'cWBTC',
  contractAddress: '0xccf4429db6322d5c611ee964527d42e5d685dd6a',
  eventName: 'Redeem',
  redeemAmount: '300000000',
  redeemTokens: '14950771553',
  redeemer: '0xF0163f66Ec80DDA288E753E0A62c8Eb71cd38684',
  usdValue: '88512',
};

const mockRepayBorrowTxHash = '0x57a36644b7440ad247a41222ad105d5a08d21b47e434025bcf4427b2c20f3dee';
const mockRRepayBorrowMeta = {
  accountBorrows: '1457196372779',
  borrower: '0xF6aaadA76eA7f044ffA028565b028740Dce5389F',
  cTokenSymbol: 'cUSDC',
  contractAddress: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  eventName: 'RepayBorrow',
  payer: '0xF6aaadA76eA7f044ffA028565b028740Dce5389F',
  repayAmount: '19985757121',
  totalBorrows: '449947401135954',
  usdValue: '19985',
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
const { handler } = require('../downloaded/Forta_cToken');

function createFinding(metadata) {
  return Finding.fromObject({
    name: 'Placeholder Alert',
    description: 'Placeholder description',
    alertId: 'AE-ALERT-ID',
    type: FindingType.Info,
    severity: FindingSeverity.Info,
    protocol: 'Protocol',
    metadata,
  });
}

function createFortaSentinelEvent(finding, blockHash, txHash) {
  // Generally findings go from the Bot, to Scan Node, to Sentinel, to Autotasks
  //  with some metadata being added and removed along the way. This function will mimic
  // the Sentinel output with only Finding, block and transaction data.

  // Note: Much of the extra data here is superfluous but is left here just in case future bots
  // want to reference any of the Sentinel data in the Discord output. It also mimics sentinel
  // output more accurately.

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

  it('Runs autotask against mock Borrow data and posts in Discord', async () => {
    const mockFinding = createFinding(mockBorrowMeta);
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash, mockBorrowTxHash);

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = `{"content":"[TX](<https://etherscan.io/tx/${mockBorrowTxHash}>) 🐳📥 **$18,537 of cUSDC** borrowed by 0x8776"}`;
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('Runs autotask against mock LiquidateBorrow data and posts in Discord', async () => {
    const mockFinding = createFinding(mockLiquidateBorrowMeta);
    const autotaskEvent = createFortaSentinelEvent(
      mockFinding,
      mockBlockHash,
      mockLiquidateBorrowTxHash,
    );

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = '{"content":"[TX](<https://etherscan.io/tx/0x064228d15febb05b929e8aecbf3d828449bd8210df758d692b9b855355ed3560>) 💔 **$881 of cUSDT** liquidated from 0xf1C6 by 0xD911"}';
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('Runs autotask against mock Mint data and posts in Discord', async () => {
    const mockFinding = createFinding(mockMintMeta);
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash, mockMintTxHash);

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = '{"content":"[TX](<https://etherscan.io/tx/0xff85476c183ef3cc0fb0623877abf5589197a773845f8acac341e48c42957a3e>) 🐳📈 **$67,721 of cETH** supplied by 0x352E"}';
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('Runs autotask against mock Redeem data and posts in Discord', async () => {
    const mockFinding = createFinding(mockRedeemMeta);
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash, mockRedeemTxHash);

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = '{"content":"[TX](<https://etherscan.io/tx/0x881d7f5b2804d144535f7b51f504ba6bcf14f3ccd53d57f4e59e0ad262bddeb5>) 🐳📉 **$88,512 of cWBTC** withdrew by 0xF016"}';
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('Runs autotask against mock RepayBorrow data and posts in Discord', async () => {
    const mockFinding = createFinding(mockRRepayBorrowMeta);
    const autotaskEvent = createFortaSentinelEvent(
      mockFinding,
      mockBlockHash,
      mockRepayBorrowTxHash,
    );

    // run the autotask on the events
    await handler(autotaskEvent);

    const data = '{"content":"[TX](<https://etherscan.io/tx/0x57a36644b7440ad247a41222ad105d5a08d21b47e434025bcf4427b2c20f3dee>) 🐳📤 **$19,985 of cUSDC** repaid by 0xF6aa"}';
    const expectedLastCall = {
      url, headers, method, data,
    };
    expect(axios).toBeCalledTimes(1);
    expect(axios.mock.lastCall[0]).toStrictEqual(expectedLastCall);
  });

  it('throws error if discordUrl is not valid', async () => {
    // Use an invalid discord URL
    secrets[discordSecretName] = 'http//zzzz';
    const mockFinding = createFinding(mockRedeemMeta);
    const autotaskEvent = createFortaSentinelEvent(mockFinding, mockBlockHash, mockRedeemTxHash);

    // run the autotask on the events
    await expect(handler(autotaskEvent)).rejects.toThrow('discordUrl is not a valid URL');

    expect(axios).toBeCalledTimes(0);
  });
});
