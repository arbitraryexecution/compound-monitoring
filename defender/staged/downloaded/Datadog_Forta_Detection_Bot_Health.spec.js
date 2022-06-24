jest.mock('axios', () => jest.fn());
const axios = require('axios');

// this will allow us to override values returned by Date Class methods
jest.useFakeTimers();
jest.setSystemTime(8675309);

const mockKeyValueStore = {
  get: jest.fn(),
  put: jest.fn(),
};

const botIds = [
  '0x5a00b44b2db933d4c797e6bd3049abdeb89cc9ec1b2eaee7bdbaff911794f714', // Forta Low Liquidity Attack
  '0xb6bdedbae67cc82e60aad02a8ffab3ccbefeaa876ca7e4f291c07c798a95e339', // Forta Large Borrows Governance
  '0x916603512086fcad84c35858d2fc5356c512f72b19c80e52e8f9c04d8122e2ba', // Forta Multi-Sig Monitor
  '0x0d3cdcc2757cd7837e3b302a9889c854044a80835562dc8060d7c163fbb69d53', // Forta Large Delegations Monitor
  '0xe200d890a67d51c3610520dd9fdfa9e2bd6dd341d41e32fa457601e73c4c6685', // Forta Oracle Price Monitor
  '0xf836bda7810aa2dd9df5bb7ac748f173b945863e922a15bb7c57da7b0e6dab05', // Forta Underlying Asset Monitor
  '0xdb6d5f9cc2ee545d42b873dba9679ecfca8d81991592179b93a78e2953c47713', // Forta Airdrop Monitor
  '0x77687a1f255c73f4008167d036c9717469f1a9a91fc2782236f33d91a76e4680', // Forta Agent Registry Monitor
  '0x0071a23a322c4dbd306037a086275c15a384afa67c7a76ecdf03e54c3350cdbe', // big-tx-agent
  '0x77281ae942ee1fe141d0652e9dad7d001761552f906fb1684b2812603de31049', // oz-gnosis-events
];

// override the key-value store Class
jest.mock('defender-kvstore-client', () => ({
  KeyValueStoreClient: jest.fn().mockReturnValue(mockKeyValueStore),
}));

const { handler } = require('./Datadog_Forta_Detection_Bot_Health');

describe('Run the Autotask', () => {
  let outputObject;
  let mockAutotaskEvent;

  beforeEach(() => {
    // set up a capture of any put() calls to the kvstore
    outputObject = {};
    mockKeyValueStore.put.mockImplementation((inputKey, value) => {
      outputObject[inputKey] = value;
    });

    mockAutotaskEvent = {
      secrets: {
        DatadogApiKey: 'mockApiKey',
      },
    };
  });

  it('updates the kvstore values when the Autotask is first executed', async () => {
    // the first time the Autotask is executed, nothing is stored in the kvstore
    mockKeyValueStore.get
      .mockResolvedValueOnce(undefined) // agentInformationDD
      .mockResolvedValueOnce(undefined); // lastUpdateTimestampDD

    const metrics = [];
    const getAgentInformation = [{}];
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    const mockAgentInformationResponse = { data: { data: { getAgentInformation } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return mockAgentInformationResponse;
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler(mockAutotaskEvent);
    expect(result).toStrictEqual({});

    // construct the Object that will be stringified and stored in the kvstore
    const agentInformationStored = {};
    botIds.forEach((botId) => {
      agentInformationStored[botId] = {};
    });

    expect(outputObject.agentInformationDD).toStrictEqual(JSON.stringify(agentInformationStored));
    expect(outputObject.lastUpdateTimestampDD).toStrictEqual('8675309');
  });

  it('returns updated agent information when agent information update time is updated', async () => {
    const agentInformationStored = {};
    botIds.forEach((botId) => {
      agentInformationStored[botId] = {};
    });

    const mockAgentInformation = JSON.stringify(agentInformationStored);
    const mockLastUpdateTimestamp = '8675308';

    // the second time the Autotask is executed, something is stored in the kvstore
    mockKeyValueStore.get
      .mockResolvedValueOnce(mockAgentInformation) // agentInformationDD
      .mockResolvedValueOnce(mockLastUpdateTimestamp); // lastUpdateTimestampDD

    const mockUpdatedAt = '12345';
    const metrics = [];
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return {
          data: {
            data: {
              getAgentInformation: [
                {
                  updated_at: mockUpdatedAt,
                },
              ],
            },
          },
        };
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler(mockAutotaskEvent);
    expect(result).toStrictEqual({});

    const newAgentInformationStored = {};
    botIds.forEach((botId) => {
      newAgentInformationStored[botId] = { updatedAt: mockUpdatedAt };
    });
    expect(outputObject.agentInformationDD).toStrictEqual(
      JSON.stringify(newAgentInformationStored)
    );
    expect(outputObject.lastUpdateTimestampDD).toStrictEqual('8675309');
  });

  it('returns nothing when the agent information is NOT updated', async () => {
    const agentInformationStored = {};
    const mockUpdatedAt = '12345';
    botIds.forEach((botId) => {
      agentInformationStored[botId] = { updatedAt: mockUpdatedAt };
    });

    const mockAgentInformation = JSON.stringify(agentInformationStored);
    const mockLastUpdateTimestamp = '8675308';

    // the second time the Autotask is executed, something is stored in the kvstore
    mockKeyValueStore.get
      .mockResolvedValueOnce(mockAgentInformation) // agentInformation
      .mockResolvedValueOnce(mockLastUpdateTimestamp); // lastUpdateTimestamp

    const metrics = [];
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return {
          data: {
            data: {
              getAgentInformation: [
                {
                  updated_at: mockUpdatedAt,
                },
              ],
            },
          },
        };
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler(mockAutotaskEvent);

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual({});

    const newAgentInformationStored = {};
    botIds.forEach((botId) => {
      newAgentInformationStored[botId] = { updatedAt: mockUpdatedAt };
    });

    expect(outputObject.agentInformationDD).toStrictEqual(undefined);
    expect(outputObject.lastUpdateTimestampDD).toStrictEqual('8675309');
  });

  it('returns updated metrics when metrics are updated', async () => {
    const mockLastUpdateTimestamp = '8675308';
    const agentInformationStored = {};
    botIds.forEach((botId) => {
      agentInformationStored[botId] = {};
    });

    const mockAgentInformation = JSON.stringify(agentInformationStored);

    // the second time the Autotask is executed, something is stored in the kvstore
    mockKeyValueStore.get
      .mockResolvedValueOnce(mockAgentInformation) // agentInformation
      .mockResolvedValueOnce(mockLastUpdateTimestamp); // lastUpdateTimestamp

    // create fake metrics
    const metrics = [
      {
        key: 'finding',
        scanners: [
          {
            key: '0x12345',
            interval: [
              {
                key: '123456',
                sum: '0',
                max: '0',
              },
            ],
          },
        ],
      },
      {
        key: 'tx.success',
        scanners: [
          {
            key: '0x12345',
            interval: [
              {
                key: '123456',
                sum: '0',
                max: '0',
              },
            ],
          },
        ],
      },
    ];

    const getAgentInformation = [{}];
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    const mockAgentInformationResponse = { data: { data: { getAgentInformation } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query !== undefined && query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query !== undefined && query.includes('AgentInformation')) {
        return mockAgentInformationResponse;
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler(mockAutotaskEvent);

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual({});
    expect(outputObject.agentInformationDD).toStrictEqual(undefined);
    expect(outputObject.lastUpdateTimestampDD).toStrictEqual('8675309');
  });
});
