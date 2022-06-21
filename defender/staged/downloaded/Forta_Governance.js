// Set the name of the Secret set in Autotask
const discordSecretName = 'GovernanceDiscordUrl';

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

async function getProposalTitle(proposalId) {
  const baseUrl = 'https://api.compound.finance/api/v2/governance/proposals';
  const queryUrl = `?proposal_ids[]=${proposalId}`;
  const fullUrl = baseUrl + queryUrl;
  let title;
  try {
    const result = await axios.get(fullUrl);
    title = result.data.proposals[0].title;
    if (title === null) {
      title = '';
    }
  } catch {
    title = '';
  }
  return title;
}

async function getAccountDisplayName(voter) {
  const baseUrl = 'https://api.compound.finance/api/v2/governance/proposal_vote_receipts';
  const queryUrl = `?account=${voter}`;
  let displayName;
  try {
    const result = await axios.get(baseUrl + queryUrl);
    displayName = result.data.proposal_vote_receipts[0].voter.display_name;
    if (displayName === null) {
      displayName = '';
    }
  } catch (err) {
    displayName = '';
  }
  return displayName;
}

function getProposalTitleFromDescription(description) {
  const lines = description.split('\n');
  let [proposalName] = lines;
  // remove markdown heading symbol and then leading and trailing spaces
  if (proposalName !== undefined) {
    try {
      proposalName = proposalName.replaceAll('#', '').trim();
    } catch (err) {
      proposalName = undefined;
    }
  }
  return proposalName;
}

async function createDiscordMessage(eventName, params, transactionHash) {
  let description;
  let support;
  let proposer;
  let voter;
  let votes;
  let reason;
  let proposalName;
  let message;
  let displayName;
  let id;
  let supportEmoji;
  let eta;
  const internationalNumberFormat = new Intl.NumberFormat('en-US');

  const noEntryEmoji = '⛔';
  const checkMarkEmoji = '✅';

  // construct the Etherscan transaction link
  const etherscanLink = `[TX](<https://etherscan.io/tx/${transactionHash}>)`;

  switch (eventName) {
    case 'ProposalCreated':
      ({ proposer, id, description } = params);
      proposalName = getProposalTitleFromDescription(description);
      if (proposalName === undefined || proposalName === 'undefined') {
        proposalName = await getProposalTitle(id);
      }
      displayName = await getAccountDisplayName(proposer);
      if (displayName === '') {
        message = `**New Proposal** ${proposalName} by ${proposer.slice(0, 6)} ${etherscanLink}`;
      } else {
        message = `**New Proposal** ${proposalName} by ${displayName} ${etherscanLink}`;
      }
      message += `\nDetails: https://compound.finance/governance/proposals/${id}`;
      break;
    case 'VoteCast':
      ({
        reason,
        voter,
        votes,
        support,
        id,
      } = params);

      displayName = await getAccountDisplayName(voter);

      if (support === 0) {
        supportEmoji = noEntryEmoji;
      } else if (support === 1) {
        supportEmoji = checkMarkEmoji;
      }

      if (votes.length > 18) {
        votes = votes.slice(0, votes.length - 18);
      } else {
        // keep the most significant digit and add the appropriate
        // number of zeros to create an accurate decimal representation
        votes = `0.${'0'.repeat(18 - votes.length)}${votes[0]}`;
      }
      votes = internationalNumberFormat.format(votes);

      proposalName = await getProposalTitle(id);
      if (displayName !== '') {
        message = `**Vote** ${proposalName} ${supportEmoji} ${votes} by ${displayName} ${etherscanLink}`;
      } else {
        message = `**Vote** ${proposalName} ${supportEmoji} ${votes} by ${voter.slice(0, 6)} ${etherscanLink}`;
      }

      if (reason !== '') {
        message += `\n\`\`\`${reason}\`\`\``;
      }
      break;
    case 'ProposalCanceled':
      ({ id } = params);
      proposalName = await getProposalTitle(id);
      message = `**Canceled Proposal** ${proposalName} ${noEntryEmoji}`;
      break;
    case 'ProposalExecuted':
      ({ id } = params);
      proposalName = await getProposalTitle(id);
      message = `**Executed Proposal** ${proposalName} ${checkMarkEmoji}`;
      break;
    case 'ProposalQueued':
      ({ eta, id } = params);
      proposalName = await getProposalTitle(id);
      message = `**Queued Proposal** ${proposalName} ${checkMarkEmoji} available to execute at timestamp ${eta}`;
      break;
    default:
      return undefined;
  }

  return message;
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
  const { metadata, name } = alert;
  if (source === undefined) {
    throw new Error('metadata undefined');
  }
  if (name === undefined) {
    throw new Error('name undefined');
  }

  // extract the hashes from the source Object
  const {
    transactionHash,
  } = source;

  // Start of usual modifications to the autotask script

  // Parse the EventName from the emitted event name
  const lastWord = name.split(' ').pop();
  let eventName;
  switch (lastWord) {
    case 'Created':
      eventName = 'ProposalCreated';
      break;
    case 'Cast':
      eventName = 'VoteCast';
      break;
    case 'Canceled':
      eventName = 'ProposalCanceled';
      break;
    case 'Executed':
      eventName = 'ProposalExecuted';
      break;
    case 'Queued':
      eventName = 'ProposalQueued';
      break;
    case 'Set':
      eventName = 'ThresholdSet';
      break;
    default:
      throw new Error('Unknown eventName');
  }

  const message = await createDiscordMessage(eventName, metadata, transactionHash);

  // create promises for posting messages to Discord webhook
  // with Log Forwarding enabled, this console.log will forward the text string to Dune Analytics
  console.log(message);
  await postToDiscord(discordUrl, message);

  return {};
};
