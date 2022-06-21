const mockedGetContract = jest.fn();
const mockedGetProvider = jest.fn();

// combine the mocked provider and contracts into the ethers import mock
jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersBatchProvider: mockedGetProvider,
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: mockedGetContract,
  },
}));

const {
  TransactionEvent, ethers, FindingType, FindingSeverity, Finding,
} = require('forta-agent');

const Web3 = require('web3-eth');
const { provideHandleTransaction, provideInitialize, createUpgradeAlert } = require('./agent');
const {
  createMockEventLogs,
} = require('./test-utils');

const { getAbi } = require('./utils');

const config = require('../bot-config.json');

// eslint-disable-next-line new-cap
const web3Eth = new Web3();

// utility function specific for this test module
// we are intentionally not using the Forta SDK function due to issues with
// jest mocking the module and interfering with default function values
function createTransactionEvent(txObject) {
  const txEvent = new TransactionEvent(
    null,
    null,
    txObject.transaction,
    txObject.receipt,
    [],
    txObject.addresses,
    txObject.block,
  );
  return txEvent;
}

// check the configuration file to verify the values
describe('check bot configuration file', () => {
  it('protocolName key required', () => {
    const { protocolName } = config;
    expect(typeof (protocolName)).toBe('string');
    expect(protocolName).not.toBe('');
  });

  it('protocolAbbreviation key required', () => {
    const { protocolAbbreviation } = config;
    expect(typeof (protocolAbbreviation)).toBe('string');
    expect(protocolAbbreviation).not.toBe('');
  });

  it('developerAbbreviation key required', () => {
    const { developerAbbreviation } = config;
    expect(typeof (developerAbbreviation)).toBe('string');
    expect(developerAbbreviation).not.toBe('');
  });

  it('contracts key required', () => {
    const { contracts } = config;
    expect(typeof (contracts)).toBe('object');
    expect(contracts).not.toBe({});
  });

  it('contracts key values must be valid', () => {
    const { contracts } = config;

    const { Comptroller, cTokens } = contracts;
    expect(typeof (Comptroller)).toBe('object');
    expect(Comptroller).not.toBe({});

    expect(typeof (cTokens)).toBe('object');
    expect(cTokens).not.toBe({});

    const { abiFile: ComptrollerAbiFile, address: ComptrollerAddress } = Comptroller;
    const { abiFile: cTokenAbiFile } = cTokens;

    // check that the address is a valid address
    expect(ethers.utils.isHexString(ComptrollerAddress, 20)).toBe(true);

    // load the ABI from the specified file
    // the call to getAbi will fail if the file does not exist
    getAbi(ComptrollerAbiFile);
    getAbi(cTokenAbiFile);
  });

  it('excludeAddresses key required', () => {
    const { excludeAddresses } = config;
    expect(Array.isArray(excludeAddresses)).toBe(true);
    excludeAddresses.forEach((address) => {
      // check that the address is a valid address
      expect(ethers.utils.isHexString(address, 20)).toBe(true);
    });
  });

  it('proxyPatterns key required', () => {
    const { proxyPatterns } = config;
    expect(Array.isArray(proxyPatterns)).toBe(true);
    expect(proxyPatterns).not.toBe([]);
  });

  it('proxyPattern elements must be valid', () => {
    const { proxyPatterns } = config;

    proxyPatterns.forEach((pattern) => {
      expect(typeof (pattern)).toBe('object');
      expect(pattern).not.toBe({});

      const {
        name, findingType, findingSeverity, functionSignatures, eventSignatures,
      } = pattern;

      expect(typeof (name)).toBe('string');

      // check type, this will fail if 'findingType' is not valid
      expect(Object.prototype.hasOwnProperty.call(FindingType, findingType)).toBe(true);

      // check severity, this will fail if 'findingSeverity' is not valid
      expect(Object.prototype.hasOwnProperty.call(FindingSeverity, findingSeverity)).toBe(true);

      expect(Array.isArray(functionSignatures)).toBe(true);
      expect(functionSignatures).not.toBe([]);

      expect(Array.isArray(eventSignatures)).toBe(true);
      expect(eventSignatures).not.toBe([]);
    });
  });
});

describe('test createUpgradeAlert', () => {
  let protocolName;
  let protocolAbbreviation;
  let developerAbbreviation;
  let cTokenSymbol;
  let cTokenAddress;
  let underlyingAssetAddress;
  let eventArgs;
  let modifiedArgs;
  let findingType;
  let findingSeverity;

  beforeAll(async () => {
    protocolName = config.protocolName;
    protocolAbbreviation = config.protocolAbbreviation;
    developerAbbreviation = config.developerAbbreviation;
  });

  it('returns a proper finding', () => {
    cTokenSymbol = 'TEST';
    findingType = 'Info';
    findingSeverity = 'Info';
    cTokenAddress = '0x1234';
    underlyingAssetAddress = '0x5678';
    eventArgs = {
      implementation: '0x8888',
    };
    modifiedArgs = {
      eventArgs_implementation: '0x8888',
    };

    const expectedFinding = Finding.fromObject({
      name: `${protocolName} cToken Asset Upgraded`,
      description: `The underlying asset for the ${cTokenSymbol} cToken contract was upgraded`,
      alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-ASSET-UPGRADED`,
      type: FindingType[findingType],
      severity: FindingSeverity[findingSeverity],
      protocol: protocolName,
      metadata: {
        cTokenSymbol,
        cTokenAddress,
        underlyingAssetAddress,
        ...modifiedArgs,
      },
    });

    const finding = createUpgradeAlert(
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      cTokenSymbol,
      cTokenAddress,
      underlyingAssetAddress,
      eventArgs,
      findingType,
      findingSeverity,
    );

    expect(finding).toStrictEqual(expectedFinding);
  });
});

// tests
describe('monitor compound for upgraded cToken assets', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let protocolName;
    let protocolAbbreviation;
    let developerAbbreviation;
    let handleTransaction;
    let mockedCTokenContract;
    let mockComptrollerContract;
    let mockedProvider;
    let mockTxEvent;
    let testEventAbi;
    let testEventIFace;
    const validFunctionSignature = 'TestFunction(address)';
    let validFunctionHash;
    const validCTokenAddress = `0x1${'0'.repeat(39)}`;
    const validAssetAddress = `0x5${'0'.repeat(39)}`;
    const validUpgradeAddress = `0x9${'0'.repeat(39)}`;
    const validSymbol = 'TEST';

    beforeAll(async () => {
      mockedProvider = {
        getCode: jest.fn(),
      };
      mockedGetProvider.mockReturnValue(mockedProvider);

      const { proxyPatterns } = config;

      const testPattern = {
        name: 'testPattern',
        findingType: 'Info',
        findingSeverity: 'Info',
        functionSignatures: [
          validFunctionSignature,
        ],
        eventSignatures: [
          'event TestEvent(address implementation)',
        ],
      };

      validFunctionHash = web3Eth.abi.encodeFunctionSignature(validFunctionSignature).slice(2);

      proxyPatterns.push(testPattern);
    });

    beforeEach(async () => {
      initializeData = {};

      mockComptrollerContract = {
        getAllMarkets: jest.fn().mockReturnValueOnce([validCTokenAddress]),
      };

      mockedGetContract.mockReturnValueOnce(mockComptrollerContract);

      mockedCTokenContract = {
        underlying: jest.fn().mockReturnValueOnce(validAssetAddress),
        symbol: jest.fn().mockReturnValueOnce(validSymbol),
      };

      mockedGetContract.mockReturnValueOnce(mockedCTokenContract);

      mockedProvider.getCode.mockReturnValueOnce(`0xDEADBEEF${validFunctionHash}DEADBEEF`);

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleTransaction = provideHandleTransaction(initializeData);

      protocolName = initializeData.protocolName;
      protocolAbbreviation = initializeData.protocolAbbreviation;
      developerAbbreviation = initializeData.developerAbbreviation;

      testEventAbi = {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            name: 'implementation',
            type: 'address',
          },
        ],
        name: 'TestEvent',
        type: 'event',
      };
      testEventIFace = new ethers.utils.Interface([testEventAbi]);

      mockTxEvent = createTransactionEvent({
        receipt: {
          logs: [],
        },
      });
    });

    it('returns empty findings if no upgrade events were emitted in the transaction', async () => {
      mockComptrollerContract.getAllMarkets.mockReturnValueOnce([]);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns findings if valid upgrade events were emitted in the transaction', async () => {
      mockComptrollerContract.getAllMarkets.mockReturnValueOnce([]);

      const override = {
        implementation: validUpgradeAddress,
      };

      testEventAbi = testEventIFace.getEvent('TestEvent');
      const testEvent = createMockEventLogs(testEventAbi, testEventIFace, override);
      const testLog = {
        address: validAssetAddress,
        topics: testEvent.mockTopics,
        args: testEvent.mockArgs,
        data: testEvent.data,
        signature: testEventAbi.format(ethers.utils.FormatTypes.minimal).substring(6),
      };

      mockTxEvent.receipt.logs.push(testLog);

      const findings = await handleTransaction(mockTxEvent);
      const expectedFinding = createUpgradeAlert(
        protocolName,
        protocolAbbreviation,
        developerAbbreviation,
        validSymbol,
        validCTokenAddress,
        validAssetAddress,
        { ...testEvent.mockArgs, 0: validUpgradeAddress },
        'Info',
        'Info',
      );

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns no findings if cToken was added but no upgrade events were emitted in the transaction', async () => {
      const newCTokenAddress = `0x2${'0'.repeat(39)}`;
      const newAssetAddress = `0x6${'0'.repeat(39)}`;
      const newSymbol = 'NEWTEST';

      mockComptrollerContract.getAllMarkets.mockReturnValueOnce([newCTokenAddress]);

      mockedCTokenContract = {
        underlying: jest.fn().mockReturnValueOnce(newAssetAddress),
        symbol: jest.fn().mockReturnValueOnce(newSymbol),
      };

      mockedGetContract.mockReturnValueOnce(mockedCTokenContract);

      mockedProvider.getCode.mockReturnValueOnce(`0xDEADBEEF${validFunctionHash}DEADBEEF`);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns findings if cToken was added and upgrade events were emitted in the transaction', async () => {
      const newCTokenAddress = `0x2${'0'.repeat(39)}`;
      const newAssetAddress = `0x6${'0'.repeat(39)}`;
      const newSymbol = 'NEWTEST';

      mockComptrollerContract.getAllMarkets.mockReturnValueOnce([newCTokenAddress]);

      mockedCTokenContract = {
        underlying: jest.fn().mockReturnValueOnce(newAssetAddress),
        symbol: jest.fn().mockReturnValueOnce(newSymbol),
      };

      mockedGetContract.mockReturnValueOnce(mockedCTokenContract);

      mockedProvider.getCode.mockReturnValueOnce(`0xDEADBEEF${validFunctionHash}DEADBEEF`);

      const override = {
        implementation: validUpgradeAddress,
      };

      testEventAbi = testEventIFace.getEvent('TestEvent');
      const testEvent = createMockEventLogs(testEventAbi, testEventIFace, override);
      const testLog = {
        address: newAssetAddress,
        topics: testEvent.mockTopics,
        args: testEvent.mockArgs,
        data: testEvent.data,
        signature: testEventAbi.format(ethers.utils.FormatTypes.minimal).substring(6),
      };

      mockTxEvent.receipt.logs.push(testLog);

      const findings = await handleTransaction(mockTxEvent);
      const expectedFinding = createUpgradeAlert(
        protocolName,
        protocolAbbreviation,
        developerAbbreviation,
        newSymbol,
        newCTokenAddress,
        newAssetAddress,
        { ...testEvent.mockArgs, 0: validUpgradeAddress },
        'Info',
        'Info',
      );

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
