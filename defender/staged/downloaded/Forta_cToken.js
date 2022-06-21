// Set the name of the Secret set in Autotask
const discordSecretName = 'DiscordUrl';

const axios = require('axios');

async function post(url, method, headers, data) {
  return axios({
    url,
    method,
    headers,
    data,
  });
}

async function postToDiscord(url, message) {
  const method = 'post';
  const headers = {
    'Content-Type': 'application/json',
  };
  const data = JSON.stringify({ content: message });

  let response;
  try {
    // perform the POST request
    response = await post(url, method, headers, data);
  } catch (error) {
    // check if this is a "too many requests" error (HTTP status 429)
    if (error.response && error.response.status === 429) {
      // the request was made and a response was received
      // try again after waiting 5 - 50 seconds, if retry_after value is received, use that.
      let timeout;
      // Discord Webhook API defaults to v6, and v6 returns retry_after value in ms. Later versions
      // use seconds, so this will need to be updated when Discord changes their default API version
      // Ref: https://discord.com/developers/docs/reference
      if (error.response.data
        && error.response.data.retry_after
        && error.response.data.retry_after < 50000) {
        // Wait the specified amount of time + a random number to reduce
        // overlap with newer requests. Initial testing reveals that the Discord Webhook allows 5
        // requests and then resets the counter after 2 seconds. With a 15 second range of 5-20,
        // this function can reliably can handle batches of 15 requests. Increase the max variable
        // below if you anticipate a larger number of requests.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
        const min = 5000;
        const max = 30000;
        timeout = Math.floor(Math.random() * (max - min) + min);
        timeout += error.response.data.retry_after;
      } else {
        // If retry_after is larger than 50 seconds, then just wait 50 seconds.
        timeout = 50000;
      }
      // eslint-disable-next-line no-promise-executor-return
      const promise = new Promise((resolve) => setTimeout(resolve, timeout));
      await promise;
      response = await post(url, method, headers, data);
    } else {
      // re-throw the error if it's not from a 429 status
      throw error;
    }
  }
  return response;
}

// eslint-disable-next-line func-names
exports.handler = async function (autotaskEvent) {
  // ensure that the autotaskEvent Object exists
  if (autotaskEvent === undefined) {
    throw new Error('autotaskEvent undefined');
  }

  const { secrets } = autotaskEvent;
  if (secrets === undefined) {
    throw new Error('secrets undefined');
  }

  // ensure that there is a DiscordUrl secret
  const discordUrl = secrets[discordSecretName];
  if (discordUrl === undefined) {
    throw new Error('discordUrl undefined');
  }

  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/URL
  function isValidUrl(string) {
    let url;
    try {
      url = new URL(string);
    } catch (_) {
      return false;
    }
    return url.href;
  }

  if (isValidUrl(discordUrl) === false) {
    throw new Error('discordUrl is not a valid URL');
  }

  // ensure that the request key exists within the autotaskEvent Object
  const { request } = autotaskEvent;
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

  // ensure that the alert key exists within the body Object
  const { source } = body;
  if (source === undefined) {
    throw new Error('source undefined');
  }

  // extract the metadata from the alert Object
  const { metadata } = alert;
  if (source === undefined) {
    throw new Error('metadata undefined');
  }

  // extract the hashes from the source Object
  const {
    transactionHash,
  } = source;

  // Start of usual modifications to the autotask script
  // extract the metadata
  const {
    cTokenSymbol,
    eventName,
    usdValue,
  } = metadata;
  if (usdValue === undefined) {
    throw new Error('usdValue undefined, please use newer bot version');
  }

  const eventMapping = {
    Borrow: {
      amountKey: 'borrowAmount',
      byKey: 'borrower',
      action: 'borrowed',
    },
    LiquidateBorrow: {
      amountKey: 'repayAmount',
      byKey: 'liquidator',
      fromKey: 'borrower',
      action: 'liquidated',
    },
    Mint: {
      amountKey: 'mintAmount',
      byKey: 'minter',
      action: 'supplied',
    },
    Redeem: {
      amountKey: 'redeemAmount',
      byKey: 'redeemer',
      action: 'withdrew',
    },
    RepayBorrow: {
      amountKey: 'repayAmount',
      byKey: 'payer',
      forKey: 'borrower',
      action: 'repaid',
    },
  };

  function emojiForEvent(eventType, usdValueString) {
    // create the appropriate number of whale emoji for the value
    // add one whale for each power of 1000
    const numWhales = Math.floor((usdValueString.length - 1) / 3);
    const whaleString = '🐳'.repeat(numWhales);

    switch (eventType) {
      case 'Borrow':
        return whaleString.concat('📥');
      case 'LiquidateBorrow':
        return whaleString.concat('💔');
      case 'Mint':
        return whaleString.concat('📈');
      case 'Redeem':
        return whaleString.concat('📉');
      case 'RepayBorrow':
        return whaleString.concat('📤');
      default:
        return '';
    }
  }

  const eventEmoji = emojiForEvent(eventName, usdValue);

  const internationalNumberFormat = new Intl.NumberFormat('en-US');
  const amountString = internationalNumberFormat.format(usdValue);

  const eventObject = eventMapping[eventName];
  const byAddress = metadata[eventObject.byKey];

  const { action } = eventObject;
  let message = `${eventEmoji} **$${amountString} of ${cTokenSymbol}** ${action}`;

  if (action === 'liquidated') {
    const fromAddress = metadata[eventObject.fromKey];
    message += ` from ${fromAddress.slice(0, 6)} by ${byAddress.slice(0, 6)}`;
  } else if (action === 'repaid') {
    const forAddress = metadata[eventObject.forKey];
    message += ` by ${byAddress.slice(0, 6)}`;
    if (forAddress !== byAddress) {
      message += ` for ${forAddress.slice(0, 6)}`;
    }
  } else {
    message += ` by ${byAddress.slice(0, 6)}`;
  }

  // construct the Etherscan transaction link
  const etherscanLink = `[TX](<https://etherscan.io/tx/${transactionHash}>)`;

  // create promises for posting messages to Discord webhook
  // with Log Forwarding enabled, this console.log will forward the text string to Dune Analytics
  console.log(`${etherscanLink} ${message}`);
  await postToDiscord(discordUrl, `${etherscanLink} ${message}`);

  return {};
};
