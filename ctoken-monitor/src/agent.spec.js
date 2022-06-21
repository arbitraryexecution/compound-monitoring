const mockContract = {};

const mockCoinGeckoResponse = {
  data: {},
};

jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  get: jest.fn().mockResolvedValue(mockCoinGeckoResponse),
}));
const axios = require('axios');

jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersBatchProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));

const {
  Finding, FindingType, FindingSeverity, ethers, TransactionEvent,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const {
  getObjectsFromAbi,
  getEventFromConfig,
  createMockEventLogs,
} = require('./test-utils');

describe('mock axios GET request', () => {
  it('should call axios.get and return a response', async () => {
    mockCoinGeckoResponse.data = {
      '0xVALIDADDRESS': {
        usd: '1',
      },
    };
    const response = await axios.get('https://...');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data['0xVALIDADDRESS'].usd).toEqual('1');

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });
});

const utils = require('./utils');

const config = require('../bot-config.json');

// this function is only here because importing the `createTransactionEvent` function from the
// forta-agent package does not work when using Jest mocking
function createTransactionEvent(txObject) {
  return new TransactionEvent(null, null, txObject.transaction, txObject.receipt, [], {}, null);
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
    Object.keys(contracts).forEach((key) => {
      const { address, abiFile, events } = contracts[key];

      // only check that an address exists for the Comptroller entry
      if (key === 'Comptroller') {
        // check that the address is a valid address
        expect(utils.isAddress(address)).toBe(true);
      }

      // load the ABI from the specified file
      // the call to getAbi will fail if the file does not exist
      const abi = utils.getAbi(abiFile);

      const eventObjects = getObjectsFromAbi(abi, 'event');

      // for all of the events specified, verify that they exist in the ABI
      Object.keys(events).forEach((eventName) => {
        expect(Object.keys(eventObjects).indexOf(eventName)).not.toBe(-1);

        const entry = events[eventName];
        const { expression, type, severity } = entry;

        // the expression key can be left out, but if it's present, verify the expression
        if (expression !== undefined) {
          // if the expression is not valid, the call to parseExpression will fail
          const expressionObject = utils.parseExpression(expression);

          // check the event definition to verify the argument name
          const { inputs } = eventObjects[eventName];
          const argumentNames = inputs.map((inputEntry) => inputEntry.name);

          // verify that the argument name is present in the event Object
          expect(argumentNames.indexOf(expressionObject.variableName)).not.toBe(-1);
        }

        // check type, this will fail if 'type' is not valid
        expect(Object.prototype.hasOwnProperty.call(FindingType, type)).toBe(true);

        // check severity, this will fail if 'severity' is not valid
        expect(Object.prototype.hasOwnProperty.call(FindingSeverity, severity)).toBe(true);
      });
    });
  });
});

// tests
describe('monitor emitted events', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let developerAbbreviation;
    let protocolAbbreviation;
    let protocolName;
    let handleTransaction;
    let mockTxEvent;
    let iface;
    let abi;
    let eventInConfig;
    let eventNotInConfig;
    let findingType;
    let findingSeverity;
    const contractName = 'cTokens';
    const validContractAddress = ethers.utils.getAddress('0xc0ffee254729296a45a3885639AC7E10F9d54979');
    const newValidContractAddress = ethers.utils.getAddress('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    const validContractSymbol = 'VLD';
    const newValidContractSymbol = 'NVLD';
    const underlyingAddress = '0xc0ffee254729296a45a3885639AC7E10F9d54878'.toLowerCase();
    const decimals = 0;

    beforeEach(async () => {
      initializeData = {};

      mockCoinGeckoResponse.data = {};

      mockContract.getAllMarkets = jest.fn()
        .mockResolvedValueOnce([validContractAddress])
        .mockResolvedValueOnce([]);
      mockContract.symbol = jest.fn().mockResolvedValueOnce(validContractSymbol);
      mockContract.underlying = jest.fn().mockResolvedValueOnce(underlyingAddress);
      mockContract.decimals = jest.fn().mockResolvedValueOnce(decimals);

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleTransaction = provideHandleTransaction(initializeData);

      // grab the first entry from the 'contracts' key in the configuration file
      const { contracts: configContracts } = config;
      protocolName = config.protocolName;
      protocolAbbreviation = config.protocolAbbreviation;
      developerAbbreviation = config.developerAbbreviation;

      const { abiFile, events } = configContracts[contractName];

      abi = utils.getAbi(abiFile);

      const results = getEventFromConfig(abi, events);
      eventInConfig = results.eventInConfig;
      eventNotInConfig = results.eventNotInConfig;
      findingType = results.findingType;
      findingSeverity = results.findingSeverity;

      if (eventInConfig === undefined) {
        throw new Error('Could not extract valid event from configuration file');
      }

      if (eventNotInConfig === undefined) {
        // if no other events were present in the ABI, generate a default event so the tests can
        // be run
        eventNotInConfig = {
          anonymous: false,
          inputs: [
            {
              indexed: false,
              internalType: 'uint256',
              name: 'testValue',
              type: 'uint256',
            },
          ],
          name: 'TESTMockEvent',
          type: 'event',
        };

        // push fake event to abi before creating the interface
        abi.push(eventNotInConfig);
      }

      iface = new ethers.utils.Interface(abi);

      // initialize mock transaction event with default values
      mockTxEvent = createTransactionEvent({
        receipt: {
          logs: [
            {
              name: '',
              address: '',
              signature: '',
              topics: [],
              data: `0x${'0'.repeat(1000)}`,
              args: [],
            },
          ],
        },
      });
    });

    it('returns empty findings if no monitored events were emitted in the transaction', async () => {
      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address does not match', async () => {
      // encode event data
      // valid event name with valid name, signature, topic, and args
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventInConfig, iface);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = ethers.constants.AddressZero;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but no monitored event was emitted', async () => {
      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventNotInConfig, iface);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventNotInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits a monitored event', async () => {
      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventInConfig, iface);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      let expectedMetaData = {};
      Object.keys(mockArgs).forEach((name) => {
        expectedMetaData[name] = mockArgs[name];
      });
      expectedMetaData = utils.extractEventArgs(expectedMetaData);

      mockCoinGeckoResponse.data[underlyingAddress] = { usd: '1' };
      const expectedValue = '0';

      const findings = await handleTransaction(mockTxEvent);

      // create the expected finding
      const testFindings = [Finding.fromObject({
        alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-EVENT`,
        description: `📈 - The ${eventInConfig.name} event was emitted by the ${validContractSymbol} cToken contract`,
        name: `${protocolName} cToken Event`,
        protocol: protocolName,
        severity: FindingSeverity[findingSeverity],
        type: FindingType[findingType],
        metadata: {
          cTokenSymbol: validContractSymbol,
          contractAddress: validContractAddress,
          eventName: eventInConfig.name,
          usdValue: expectedValue,
          ...expectedMetaData,
        },
      })];

      expect(findings).toStrictEqual(testFindings);
    });

    it('returns a finding with a whale emoji if a target contract emits a monitored event with a value over 1,000 USD', async () => {
      // encode event data - valid event with valid arguments
      const override = {
        name: 'mintAmount',
        value: '1000',
      };
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventInConfig, iface, override);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      let expectedMetaData = {};
      Object.keys(mockArgs).forEach((name) => {
        expectedMetaData[name] = mockArgs[name];
      });
      expectedMetaData = utils.extractEventArgs(expectedMetaData);

      mockCoinGeckoResponse.data[underlyingAddress] = { usd: '1' };
      const expectedValue = '1000';

      const findings = await handleTransaction(mockTxEvent);

      // create the expected finding
      const testFindings = [Finding.fromObject({
        alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-EVENT`,
        description: `🐳📈 - The ${eventInConfig.name} event was emitted by the ${validContractSymbol} cToken contract`,
        name: `${protocolName} cToken Event`,
        protocol: protocolName,
        severity: FindingSeverity[findingSeverity],
        type: FindingType[findingType],
        metadata: {
          cTokenSymbol: validContractSymbol,
          contractAddress: validContractAddress,
          eventName: eventInConfig.name,
          usdValue: expectedValue,
          ...expectedMetaData,
        },
      })];

      expect(findings).toStrictEqual(testFindings);
    });

    it('returns empty findings if a new cToken is added and no monitored events are emitted', async () => {
      mockContract.getAllMarkets = jest.fn().mockResolvedValueOnce([newValidContractAddress]);
      mockContract.symbol = jest.fn().mockResolvedValueOnce(newValidContractSymbol);

      // select event NOT in config file
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventNotInConfig, iface);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = newValidContractAddress; // new cToken address
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      //  feed in event to handler
      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns findings if a new cToken is added and a monitored event is emitted', async () => {
      mockContract.getAllMarkets = jest.fn().mockResolvedValueOnce([newValidContractAddress]);
      mockContract.symbol = jest.fn().mockResolvedValueOnce(newValidContractSymbol);
      mockContract.underlying = jest.fn().mockResolvedValueOnce(underlyingAddress);
      mockContract.decimals = jest.fn().mockResolvedValueOnce(decimals);

      // select event in config file
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventInConfig, iface);

      // update mock transaction event
      const [defaultLog] = mockTxEvent.receipt.logs;
      defaultLog.name = contractName;
      defaultLog.address = newValidContractAddress; // new cToken address
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(eventInConfig.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);

      mockCoinGeckoResponse.data[underlyingAddress] = { usd: '1' };
      const expectedValue = '0';

      //  feed in event to handler
      const findings = await handleTransaction(mockTxEvent);

      let expectedMetaData = {};
      Object.keys(mockArgs).forEach((name) => {
        expectedMetaData[name] = mockArgs[name];
      });
      expectedMetaData = utils.extractEventArgs(expectedMetaData);

      // create the expected finding
      const testFindings = [Finding.fromObject({
        alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-EVENT`,
        description: `📈 - The ${eventInConfig.name} event was emitted by the ${newValidContractSymbol} cToken contract`,
        name: `${protocolName} cToken Event`,
        protocol: protocolName,
        severity: FindingSeverity[findingSeverity],
        type: FindingType[findingType],
        metadata: {
          cTokenSymbol: newValidContractSymbol,
          contractAddress: newValidContractAddress,
          eventName: eventInConfig.name,
          usdValue: expectedValue,
          ...expectedMetaData,
        },
      })];
      expect(findings).toStrictEqual(testFindings);
    });
  });
});
