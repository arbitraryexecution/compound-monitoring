const {
  Finding, FindingSeverity, FindingType, ethers, getEthersBatchProvider,
} = require('forta-agent');

const BigNumber = require('bignumber.js');
const axios = require('axios');

const {
  getAbi,
  extractEventArgs,
} = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

const DECIMALS_ABI = ['function decimals() view returns (uint8)'];

async function getTokenPrice(tokenAddress) {
  const coingeckoApiUrl = 'https://api.coingecko.com/api/v3/simple/token_price/ethereum?';
  const addressQuery = `contract_addresses=${tokenAddress}`;
  const vsCurrency = '&vs_currencies=usd';

  // create the URL
  const url = coingeckoApiUrl.concat(addressQuery.concat(vsCurrency));

  // get the price from the CoinGecko API
  const { data } = await axios.get(url);

  // parse the response and convert the prices to BigNumber.js type
  const usdPerToken = new BigNumber(data[tokenAddress.toLowerCase()].usd);

  return usdPerToken;
}

async function emojiForEvent(eventName, value) {
  // create the appropriate number of whale emoji for the value
  // add one whale for each power of 1000
  const numWhales = Math.floor((value.toString().length - 1) / 3);
  const whaleString = '🐳'.repeat(numWhales);

  switch (eventName) {
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

// helper function to create cToken alerts
async function createCTokenAlert(
  eventName,
  cTokenSymbol,
  contractAddress,
  eventType,
  eventSeverity,
  usdValue,
  args,
  protocolName,
  protocolAbbreviation,
  developerAbbreviation,
  emojiString,
) {
  const eventArgs = extractEventArgs(args);
  const finding = Finding.fromObject({
    name: `${protocolName} cToken Event`,
    description: `${emojiString} - The ${eventName} event was emitted by the ${cTokenSymbol} cToken contract`,
    alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-EVENT`,
    type: FindingType[eventType],
    severity: FindingSeverity[eventSeverity],
    protocol: protocolName,
    metadata: {
      cTokenSymbol,
      contractAddress,
      eventName,
      usdValue,
      ...eventArgs,
    },
  });
  return finding;
}

function getEventInfo(iface, events, sigType) {
  const result = Object.entries(events).map(([eventName, entry]) => {
    const signature = iface.getEvent(eventName).format(sigType);
    return {
      name: eventName,
      signature,
      type: entry.type,
      severity: entry.severity,
      amountKey: entry.amountKey,
    };
  });
  return result;
}

async function getTokenInfo(address, abi, provider) {
  const contract = new ethers.Contract(address, abi, provider);
  const symbol = await contract.symbol();

  let underlyingTokenAddress;
  if (symbol !== 'cETH') {
    // get the underlying asset for this cToken
    underlyingTokenAddress = await contract.underlying();
  } else {
    // the symbol is for Compound Ether, so use the Wrapped Ether address
    underlyingTokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  }

  const underlyingContract = new ethers.Contract(
    underlyingTokenAddress,
    DECIMALS_ABI,
    provider,
  );

  const underlyingDecimals = await underlyingContract.decimals();

  return {
    contract,
    symbol,
    underlyingTokenAddress,
    underlyingDecimals,
  };
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    data.provider = getEthersBatchProvider();

    const {
      Comptroller: comptroller,
      cTokens,
    } = config.contracts;

    // from the Comptroller contract, get all of the cTokens
    const comptrollerAbi = getAbi(comptroller.abiFile);
    data.comptrollerContract = new ethers.Contract(
      comptroller.address,
      comptrollerAbi,
      data.provider,
    );

    // this looks like a hack, but it is necessary to be able to add new cToken addresses to the
    // Array in the handler.  If we do not create the data.cTokenAddresses Array this way and just
    // use the returned cTokenAddresses Object, we will be unable to push new elements into the
    // Array.  When ethers.js returns this Object, it has a read-only length property that prevents
    // the push from occurring.
    const cTokenAddresses = await data.comptrollerContract.getAllMarkets();
    data.cTokenAddresses = [...cTokenAddresses];

    const sigTypeFull = ethers.utils.FormatTypes.full;

    // cToken contracts
    // gather the event signatures, types, and severities for every event listed in the config file
    data.cTokenAbi = getAbi(cTokens.abiFile);
    const cTokenInterface = new ethers.utils.Interface(data.cTokenAbi);
    const { events: cTokenEvents } = cTokens;
    data.cTokenInfo = getEventInfo(cTokenInterface, cTokenEvents, sigTypeFull);

    // create ethers Contract Objects for all of the existing cTokens
    data.cTokenContracts = {};
    const promises = data.cTokenAddresses.map(async (address) => {
      data.cTokenContracts[address] = await getTokenInfo(address, data.cTokenAbi, data.provider);
    });
    await Promise.all(promises);
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      cTokenAddresses,
      cTokenInfo,
      cTokenAbi,
      cTokenContracts,
      comptrollerContract,
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
    } = data;

    // first check that no additional cTokens have been added
    const currentCTokenAddresses = await comptrollerContract.getAllMarkets();
    const unique = currentCTokenAddresses.filter((addr) => cTokenAddresses.indexOf(addr) === -1);
    cTokenAddresses.push(...unique);

    if (unique.length > 0) {
      // create ethers.js Contract Objects and add them to the Object of other Contract Objects
      const promises = unique.map(async (address) => {
        cTokenContracts[address] = await getTokenInfo(address, cTokenAbi, data.provider);
      });
      await Promise.all(promises);
    }

    // check all cToken contracts
    const signatures = cTokenInfo.map((entry) => entry.signature);
    const parsedLogs = txEvent.filterLog(signatures, cTokenAddresses);

    const promises = parsedLogs.map(async (log) => {
      const { address, name } = log;
      const [specificEvent] = cTokenInfo.filter((entry) => entry.name === name);
      const {
        symbol,
        underlyingDecimals,
        underlyingTokenAddress,
      } = cTokenContracts[ethers.utils.getAddress(address)];

      // convert an ethers BigNumber to a bignumber.js BigNumber
      const amount = new BigNumber(log.args[specificEvent.amountKey].toString());

      // get the conversion rate for this token to USD
      const usdPerToken = await getTokenPrice(underlyingTokenAddress);

      // calculate the total amount of this transaction
      const divisor = (new BigNumber(10)).pow(underlyingDecimals);
      const value = usdPerToken.times(amount.div(divisor)).integerValue(BigNumber.ROUND_FLOOR);

      const emojiString = await emojiForEvent(name, value);

      const promise = createCTokenAlert(
        name,
        symbol,
        log.address,
        specificEvent.type,
        specificEvent.severity,
        value.toString(),
        log.args,
        protocolName,
        protocolAbbreviation,
        developerAbbreviation,
        emojiString,
      );
      return promise;
    });

    const findings = await Promise.all(promises);

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
