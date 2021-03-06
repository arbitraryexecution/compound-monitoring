/* eslint-disable import/no-unresolved,import/no-extraneous-dependencies */
const axios = require('axios');
const { KeyValueStoreClient } = require('defender-kvstore-client');
/* eslint-enable import/no-unresolved,import/no-extraneous-dependencies */

// this value was retrieved from the Forta Explorer front-end
// it corresponds to 05-DEC-2021, presumably the launch date of Forta Explorer
const fortaExplorerEarliestTimestamp = 1638721490212;

const botIds = [
  '0x5a00b44b2db933d4c797e6bd3049abdeb89cc9ec1b2eaee7bdbaff911794f714', // Forta Low Liquidity Attack
  '0xb6bdedbae67cc82e60aad02a8ffab3ccbefeaa876ca7e4f291c07c798a95e339', // Forta Large Borrows Governance
  '0x916603512086fcad84c35858d2fc5356c512f72b19c80e52e8f9c04d8122e2ba', // Forta Multi-Sig Monitor
  '0x0d3cdcc2757cd7837e3b302a9889c854044a80835562dc8060d7c163fbb69d53', // Forta Large Delegations Monitor
  '0xe200d890a67d51c3610520dd9fdfa9e2bd6dd341d41e32fa457601e73c4c6685', // Forta Oracle Price Monitor
  '0xf836bda7810aa2dd9df5bb7ac748f173b945863e922a15bb7c57da7b0e6dab05', // Forta Underlying Asset Monitor
  '0x125c36816fbad9974a452947bf6a98d975988ddf4342c159a986383b64765e22', // Forta Compound cToken Monitor
  '0xa0424dfee87cc34b9ff6a1dfa2cb22dbf1b20a238698ae0eeffbf07f869e5b39', // Forta Compound Governance Monitor
];

const fortaExplorerApiEndpoint = 'https://explorer-api.forta.network/graphql';
const datadogApiEndpoint = 'https://api.datadoghq.com/api/v2/series';

// extract relevant information from the Forta Explorer response and create an Object that can
// be submitted to the Datadog Events API endpoint
function parseAlertsResponse(response) {
  const { data: { data: { getList: { alerts } } } } = response;
  const newAlerts = alerts.map((alert) => {
    const {
      protocol,
      severity,
      source: {
        agent: {
          id: botId,
        },
        block: {
          timestamp: dateTimestamp,
        },
      },
    } = alert;

    const timestamp = new Date(dateTimestamp).valueOf();

    // force the x-axis value (timestamp) passed with the data to be the timestamp at the start of
    // the week
    const msPerWeek = (1000 * 60 * 60 * 24 * 7);
    const weeksElapsed = Math.floor((timestamp - fortaExplorerEarliestTimestamp) / msPerWeek);

    // force the y-axis value to be the numbers 1 through 7, depending upon the day of the week
    const dayOfWeek = (new Date(timestamp).getDay()) + 1;

    // use the transaction hash as a unique "tag"
    const tags = [
      `botid:${botId}`,
      `protocol:${protocol}`,
      `severity:${severity}`,
      `dayofweek:${dayOfWeek}`,
      `weekselapsed:${weeksElapsed}`,
    ];

    const output = {
      metric: 'alertHeatMap',
      tags,
      type: 0,
      points: [
        {
          timestamp: Math.floor(timestamp / 1000),
          value: dayOfWeek,
        },
      ],
    };
    return output;
  });
  return newAlerts;
}

// this appears to query for previous alerts emitted by a Bot
// this data is then displayed in a table view titled 'Alerts' on the bottom of the Forta Explorer
// page for the Bot
function createAlertsQuery(botId, currentTimestamp, lastUpdateTimestamp) {
  const graphqlQuery = {
    operationName: 'Retrieve',
    query: `query Retrieve($getListInput: GetAlertsInput) {
      getList(input: $getListInput) {
        alerts {
          hash
          description
          severity
          protocol
          name
          everest_id
          alert_id
          scanner_count
          source {
            tx_hash
            agent {
              id
              name
            }
            block {
              chain_id
              number
              timestamp
            }
          }
          projects {
            id
            name
          }
        }
        nextPageValues {
          blocknumber
          id
        }
        currentPageValues {
          blocknumber
          id
        }
      }
    }`,
    variables: {
      getListInput: {
        severity: [],
        startDate: (lastUpdateTimestamp + 1).toString(),
        endDate: currentTimestamp.toString(),
        txHash: '',
        text: '',
        muted: [],
        sort: 'desc',
        agents: [botId],
        addresses: [],
        project: '',
      },
    },
  };
  return graphqlQuery;
}

async function postQuery(graphqlQuery) {
  const headers = {
    'content-type': 'application/json',
  };

  // perform the POST request
  const response = await axios({
    url: fortaExplorerApiEndpoint,
    method: 'post',
    headers,
    data: graphqlQuery,
  });

  return response;
}

async function postToDatadog(data, apiKey, url) {
  const headers = {
    'Content-Type': 'application/json',
    'DD-API-KEY': apiKey,
  };

  // perform the POST request
  const response = await axios({
    url,
    method: 'post',
    headers,
    data,
  });

  return response;
}

// entry point for autotask
// eslint-disable-next-line func-names
exports.handler = async function (autotaskEvent) {
  // get the current timestamp once
  // this value will be used across all queries to determine how much data to
  // retrieve
  const currentTimestamp = (new Date()).getTime();
  console.debug(`currentTimestamp: ${currentTimestamp.toString()}`);

  console.debug(JSON.stringify(autotaskEvent, null, 2));

  const { secrets } = autotaskEvent;
  if (secrets === undefined) {
    throw new Error('secrets undefined');
  }

  const { DatadogApiKey: datadogApiKey } = secrets;
  if (datadogApiKey === undefined) {
    throw new Error('Datadog API key undefined');
  }

  const store = new KeyValueStoreClient(autotaskEvent);

  // load the latest timestamp that was stored
  let lastUpdateTimestamp = await store.get('lastUpdateTimestampAlerts');

  // the first time this Autotask is executed, we will need to manually set the value
  // of the last timestamp
  if (lastUpdateTimestamp === undefined || lastUpdateTimestamp === null) {
    console.debug('Autotask run for the first time, initializing lastUpdateTimestamp');
    lastUpdateTimestamp = fortaExplorerEarliestTimestamp;
  } else {
    console.debug('Retrieving existing value for lastUpdateTimestamp');
    lastUpdateTimestamp = parseInt(lastUpdateTimestamp, 10);
    console.debug(lastUpdateTimestamp);
  }
  console.debug(`lastUpdateTimestamp: ${lastUpdateTimestamp.toString()}`);

  const promises = botIds.map(async (botId) => {
    const output = { botId };
    const alertsQuery = createAlertsQuery(botId, currentTimestamp, lastUpdateTimestamp);
    const alertsResponse = await postQuery(alertsQuery);
    const alerts = parseAlertsResponse(alertsResponse);
    // if there weren't any alerts, don't forward anything
    if (alerts.length !== 0) {
      console.debug(`Alerts found for botId ${botId}: ${alerts.length}`);
      output.alerts = alerts;
    } else {
      console.debug(`NO alerts found for botId ${botId}`);
    }
    return output;
  });

  const results = await Promise.all(promises);

  // store the updated timestamp
  console.debug(`Storing new value for lastUpdateTimestamp: ${currentTimestamp.toString()}`);
  await store.put('lastUpdateTimestampAlerts', currentTimestamp.toString());

  const data = results.filter((result) => Object.keys(result).length > 1);

  // check for available metrics
  let alertsPromises = data.map(async (output) => {
    const { alerts } = output;
    if (alerts !== undefined) {
      console.debug(JSON.stringify(alerts, null, 2));
      return postToDatadog({ series: alerts }, datadogApiKey, datadogApiEndpoint);
    }
    console.debug('alerts is undefined');

    return undefined;
  });

  alertsPromises = alertsPromises.filter((value) => value !== undefined);

  await Promise.all(alertsPromises);

  return {};
};
