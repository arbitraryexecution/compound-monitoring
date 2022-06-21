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
];

// override the key-value store Class
jest.mock('defender-kvstore-client', () => ({
  KeyValueStoreClient: jest.fn().mockReturnValue(mockKeyValueStore),
}));

const { handler } = require('./Autotask_Forta_Explorer_Monitor');

describe('Run the Autotask', () => {
  let outputObject;

  beforeEach(() => {
    // set up a capture of any put() calls to the kvstore
    outputObject = {};
    mockKeyValueStore.put.mockImplementation((inputKey, value) => {
      outputObject[inputKey] = value;
    });
  });

  it('updates the kvstore values when the Autotask is first executed', async () => {
    // the first time the Autotask is executed, nothing is stored in the kvstore
    mockKeyValueStore.get
      .mockResolvedValueOnce(undefined) // agentInformation
      .mockResolvedValueOnce(undefined); // lastUpdateTimestamp

    const alerts = [];
    const metrics = [];
    const getAgentInformation = [{}];
    const mockAlertResponse = { data: { data: { getList: { alerts } } } };
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    const mockAgentInformationResponse = { data: { data: { getAgentInformation } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('alert_id')) {
        return mockAlertResponse;
      }

      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return mockAgentInformationResponse;
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler({});

    // construct the Object that we expect to receive from the handler
    const expectedResult = botIds.map((botId) => ({ agentInformation: {}, botId }));

    expect(result).toStrictEqual(expectedResult);

    // construct the Object that will be stringified and stored in the kvstore
    const agentInformationStored = {};
    botIds.forEach((botId) => {
      agentInformationStored[botId] = {};
    });

    expect(outputObject.agentInformation).toStrictEqual(JSON.stringify(agentInformationStored));
    expect(outputObject.lastUpdateTimestamp).toStrictEqual('8675309');
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
      .mockResolvedValueOnce(mockAgentInformation) // agentInformation
      .mockResolvedValueOnce(mockLastUpdateTimestamp); // lastUpdateTimestamp

    const mockUpdatedAt = '12345';
    const mockNewAgentInformation = botIds.map((botId) => ({
      agentInformation: { updatedAt: mockUpdatedAt },
      botId,
    }));

    const alerts = [];
    const metrics = [];
    const mockAlertResponse = { data: { data: { getList: { alerts } } } };
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('alert_id')) {
        return mockAlertResponse;
      }

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
    const result = await handler({});

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual(mockNewAgentInformation);

    const newAgentInformationStored = {};
    botIds.forEach((botId) => {
      newAgentInformationStored[botId] = { updatedAt: mockUpdatedAt };
    });
    expect(outputObject.agentInformation).toStrictEqual(JSON.stringify(newAgentInformationStored));
    expect(outputObject.lastUpdateTimestamp).toStrictEqual('8675309');
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

    const alerts = [];
    const metrics = [];
    const mockAlertResponse = { data: { data: { getList: { alerts } } } };
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('alert_id')) {
        return mockAlertResponse;
      }

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
    const result = await handler({});

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual({});

    const newAgentInformationStored = {};
    botIds.forEach((botId) => {
      newAgentInformationStored[botId] = { updatedAt: mockUpdatedAt };
    });

    expect(outputObject.agentInformation).toStrictEqual(undefined);
    expect(outputObject.lastUpdateTimestamp).toStrictEqual('8675309');
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

    const alerts = [];
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
    const mockAlertResponse = { data: { data: { getList: { alerts } } } };
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    const mockAgentInformationResponse = { data: { data: { getAgentInformation } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('alert_id')) {
        return mockAlertResponse;
      }

      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return mockAgentInformationResponse;
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler({});

    const expectedResult = botIds.map((botId) => ({
      botId,
      metrics: {
        finding: {
          '0x12345': [
            {
              max: 0,
              sum: 0,
              timestamp: '1970-01-01 00:02',
            },
          ],
        },
        txSuccess: {
          '0x12345': [
            {
              max: 0,
              sum: 0,
              timestamp: '1970-01-01 00:02',
            },
          ],
        },
      },
    }));

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual(expectedResult);
    expect(outputObject.agentInformation).toStrictEqual(undefined);
    expect(outputObject.lastUpdateTimestamp).toStrictEqual('8675309');
  });

  it('returns alert information when when alerts are updated', async () => {
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

    const alerts = [
      {
        key: 'Sample Bot Name',
        doc_count: 1,
      },
    ];

    const metrics = [];
    const getAgentInformation = [{}];
    const mockAlertResponse = { data: { data: { getList: { alerts } } } };
    const mockMetricsResponse = { data: { data: { getAgentMetrics: { metrics } } } };
    const mockAgentInformationResponse = { data: { data: { getAgentInformation } } };
    axios.mockImplementation((inputObject) => {
      const { data: { query } } = inputObject;
      if (query.includes('alert_id')) {
        return mockAlertResponse;
      }

      if (query.includes('GetAgentMetricsInput')) {
        return mockMetricsResponse;
      }

      if (query.includes('AgentInformation')) {
        return mockAgentInformationResponse;
      }
      return undefined;
    });

    // execute the Autotask
    const result = await handler({});

    const expectedResult = botIds.map((botId) => ({
      botId,
      alerts: [
        {
          docCount: 1,
          key: 'Sample Bot Name',
        },
      ],
    }));

    // construct the Object that we expect to receive from the handler
    expect(result).toStrictEqual(expectedResult);

    expect(outputObject.agentInformation).toStrictEqual(undefined);
    expect(outputObject.lastUpdateTimestamp).toStrictEqual('8675309');
  });
});
