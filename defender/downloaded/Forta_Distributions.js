/* eslint-disable import/no-unresolved,import/no-extraneous-dependencies */
const ethers = require('ethers');
const axios = require('axios');
/* eslint-enable import/no-unresolved,import/no-extraneous-dependencies */

const fortaApiEndpoint = 'https://api.forta.network/graphql';

// axios post request for forta graphql api
async function post(url, method, headers, data) {
  return axios({
    url, method, headers, data,
  });
}

function createDiscordMessage(compAccrued, compDistributed, receiver, transactionHash) {
  const receiverFormatted = receiver.slice(0, 6);

  // // construct the Etherscan transaction link
  const etherscanLink = `[TX](<https://etherscan.io/tx/${transactionHash}>)`;

  // handle case for infinity % (no comp accrued before)
  if (compAccrued.eq(0) || compDistributed.eq(0)) {
    return `${etherscanLink} 🌊 **${receiverFormatted}** previously had no **COMP** accrued and was just distributed **COMP** tokens`;
  }

  // % distribution % is calculated by compDistributed / compAccrued * 100
  // format the number to have comma separators for powers of 1000
  const internationalNumberFormat = new Intl.NumberFormat('en-US');

  let percentageMore = compDistributed.div(compAccrued).mul(100).toString();
  percentageMore = internationalNumberFormat.format(percentageMore);

  return `${etherscanLink} 🌊 **${percentageMore}%** more **COMP** distributed to **${receiverFormatted}** than expected`;
}

// post to discord
async function postToDiscord(url, message) {
  const method = 'post';
  const headers = {
    'Content-Type': 'application/json',
  };
  const data = { content: message };

  let response;
  try {
    // perform the POST request
    response = await post(url, method, headers, data);
  } catch (error) {
    // is this a "too many requests" error (HTTP status 429)
    if (error.response && error.response.status === 429) {
      // the request was made and a response was received
      // try again after waiting 5 seconds
      // eslint-disable-next-line no-promise-executor-return
      const promise = new Promise((resolve) => setTimeout(resolve, 5000));
      await promise;
      response = await post(url, method, headers, data);
    } else {
      // re-throw the error if it's not from a 429 status
      throw error;
    }
  }

  return response;
}

async function getFortaAlerts(botId, transactionHash) {
  const headers = {
    'content-type': 'application/json',
  };

  // construct query with data that you want to get back
  const graphqlQuery = {
    operationName: 'recentAlerts',
    query: `query recentAlerts($input: AlertsInput) {
      alerts(input: $input) {
        pageInfo {
          hasNextPage
          endCursor {
            alertId
            blockNumber
          }
        }
        alerts {
          createdAt
          name
          protocol
          findingType
          hash
          source {
            transactionHash
            block {
              number
              chainId
            }
            bot {
              id
            }
          }
          severity
      metadata
      description
        }
      }
    }`,
    variables: {
      input: {
        first: 100,
        bots: [botId],
        transactionHash,
        createdSince: 0,
        chainId: 1,
      },
    },
  };

  // perform the POST request
  const response = await axios({
    url: fortaApiEndpoint,
    method: 'post',
    headers,
    data: graphqlQuery,
  });

  const { data } = response;
  if (data === undefined) {
    return undefined;
  }

  const { data: { alerts: { alerts } } } = data;
  return alerts;
}

// entry point for autotask
// eslint-disable-next-line func-names
exports.handler = async function (autotaskEvent) {
  // ensure that the autotaskEvent Object exists
  if (autotaskEvent === undefined) {
    throw new Error('autotaskEvent undefined');
  }

  const { secrets, request } = autotaskEvent;
  if (secrets === undefined) {
    throw new Error('secrets undefined');
  }

  // ensure that there is a DiscordUrl secret. Name changes depending on what webhook secret you use
  const { SecurityAlertsDiscordUrl: discordUrl } = secrets;
  if (discordUrl === undefined) {
    throw new Error('SecurityAlertsDiscordUrl undefined');
  }

  // ensure that the request key exists within the autotaskEvent Object
  if (request === undefined) {
    throw new Error('request undefined');
  }

  // ensure that the body key exists within the request Object
  const { body } = request;
  if (body === undefined) {
    throw new Error('body undefined');
  }

  // ensure that the alert key exists within the body Object
  const { alert } = body;
  if (alert === undefined) {
    throw new Error('alert undefined');
  }

  // extract the transaction hash and bot ID from the alert Object
  const {
    hash,
    source: {
      transactionHash,
      bot: {
        id: botId,
      },
    },
  } = alert;

  // retrieve the metadata from the Forta public API
  let alerts = await getFortaAlerts(botId, transactionHash);
  alerts = alerts.filter((alertObject) => alertObject.hash === hash);

  const promises = alerts.map((alertData) => {
    const { metadata } = alertData;
    let { compAccrued, compDistributed } = metadata;
    const { receiver } = metadata;
    compAccrued = ethers.BigNumber.from(compAccrued);
    compDistributed = ethers.BigNumber.from(compDistributed);

    return createDiscordMessage(
      compAccrued,
      compDistributed,
      receiver,
      transactionHash,
    );
  });

  // wait for the promises to settle
  let results = await Promise.allSettled(promises);

  // create promises for posting messages to Discord webhook
  const discordPromises = results.map((result) => {
    console.log(`${result.value}`);
    return postToDiscord(discordUrl, `${result.value}`);
  });

  // wait for the promises to settle
  results = await Promise.allSettled(discordPromises);
  results = results.filter((result) => result.status === 'rejected');

  if (results.length > 0) {
    throw new Error(results[0].reason);
  }

  return {};
};
