/* eslint-disable no-param-reassign */
const {
  Finding, FindingSeverity, FindingType, ethers, getEthersBatchProvider,
} = require('forta-agent');

const web3 = require('web3-eth');

// eslint-disable-next-line new-cap
const web3Eth = new web3();

const {
  getAbi,
} = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create upgrade alerts
function createUpgradeAlert(
  protocolName,
  protocolAbbreviation,
  developerAbbreviation,
  cTokenSymbol,
  cTokenAddress,
  underlyingAssetAddress,
  eventArgs,
  eventType,
  eventSeverity,
) {
  const modifiedArgs = {};
  Object.keys(eventArgs).forEach((key) => {
    modifiedArgs[`eventArgs_${key}`] = eventArgs[key];
  });

  const finding = Finding.fromObject({
    name: `${protocolName} cToken Asset Upgraded`,
    description: `The underlying asset for the ${cTokenSymbol} cToken contract was upgraded`,
    alertId: `${developerAbbreviation}-${protocolAbbreviation}-CTOKEN-ASSET-UPGRADED`,
    type: FindingType[eventType],
    severity: FindingSeverity[eventSeverity],
    protocol: protocolName,
    metadata: {
      cTokenSymbol,
      cTokenAddress,
      underlyingAssetAddress,
      ...modifiedArgs,
    },
  });
  return finding;
}

function isUpgradeableProxy(asset, proxyPatterns) {
  let foundPattern = false;

  proxyPatterns.some((pattern) => {
    const isPattern = pattern.functionHashes.every((functionHash) => {
      if (asset.code.indexOf(functionHash) !== -1) {
        return true;
      }
      return false;
    });
    if (isPattern) {
      foundPattern = pattern;
      return true;
    }

    return false;
  });

  return foundPattern;
}

async function getUnderlyingAsset(address, abi, provider, proxyPatterns) {
  let underlyingTokenAddress;
  let symbol;

  const underlyingAsset = {
    isProxy: false,
  };

  const contract = new ethers.Contract(address, abi, provider);

  try {
    symbol = await contract.symbol();
    underlyingTokenAddress = await contract.underlying();
  } catch (e) {
    console.log(e);
  }

  if (underlyingTokenAddress) {
    underlyingAsset.symbol = symbol;
    underlyingAsset.cToken = address;
    underlyingAsset.address = underlyingTokenAddress;
    underlyingAsset.code = await provider.getCode(underlyingTokenAddress);

    const proxyPattern = isUpgradeableProxy(underlyingAsset, proxyPatterns);
    if (proxyPattern !== false) {
      underlyingAsset.isProxy = true;
      underlyingAsset.pattern = proxyPattern;
    }
  }

  return underlyingAsset;
}

async function getCompoundTokens(contract, excludeAddresses) {
  let cTokenAddresses = await contract.getAllMarkets();
  cTokenAddresses = cTokenAddresses.map((addr) => addr.toLowerCase());
  cTokenAddresses = cTokenAddresses.filter((addr) => excludeAddresses.indexOf(addr) === -1);

  return cTokenAddresses;
}

function provideInitialize(data) {
  return async function initialize() {
    // assign configurable fields
    /* eslint-disable no-param-reassign */
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    const { excludeAddresses } = config;
    data.excludeAddresses = excludeAddresses.map((addr) => addr.toLowerCase());

    data.proxyPatterns = config.proxyPatterns;
    data.proxyPatterns.forEach((pattern) => {
      pattern.functionHashes = [];
      pattern.functionSignatures.forEach((signature) => {
        const hash = web3Eth.abi.encodeFunctionSignature(signature).slice(2);
        pattern.functionHashes.push(hash);
      });
    });

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

    data.cTokenAddresses = await getCompoundTokens(data.comptrollerContract, data.excludeAddresses);

    // cToken contracts
    // gather the underlying asset contracts for every cToken
    data.cTokenAbi = getAbi(cTokens.abiFile);

    data.upgradeableProxyAssets = [];
    const promises = data.cTokenAddresses.map(async (address) => {
      const underlyingAsset = await getUnderlyingAsset(
        address,
        data.cTokenAbi,
        data.provider,
        data.proxyPatterns,
      );
      if (underlyingAsset.isProxy) data.upgradeableProxyAssets.push(underlyingAsset);
    });
    await Promise.all(promises);
  };
  /* eslint-enable no-param-reassign */
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      provider,
      cTokenAddresses,
      cTokenAbi,
      upgradeableProxyAssets,
      comptrollerContract,
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      excludeAddresses,
      proxyPatterns,
    } = data;

    const findings = [];

    // first check that no additional cTokens have been added
    const currentCTokenAddresses = await getCompoundTokens(comptrollerContract, excludeAddresses);
    const unique = currentCTokenAddresses.filter((addr) => cTokenAddresses.indexOf(addr) === -1);

    cTokenAddresses.push(...unique);

    if (unique.length > 0) {
      // create ethers.js Contract Objects and add them to the Object of other Contract Objects
      const promises = unique.map(async (address) => {
        // eslint-disable-next-line max-len
        const underlyingAsset = await getUnderlyingAsset(address, cTokenAbi, provider, proxyPatterns);
        if (underlyingAsset.isProxy) upgradeableProxyAssets.push(underlyingAsset);
      });
      await Promise.all(promises);
    }

    upgradeableProxyAssets.forEach((asset) => {
      asset.pattern.eventSignatures.forEach((signature) => {
        const upgradeEvents = txEvent.filterLog(signature, asset.address);
        upgradeEvents.forEach((upgradeEvent) => {
          findings.push(createUpgradeAlert(
            protocolName,
            protocolAbbreviation,
            developerAbbreviation,
            asset.symbol,
            asset.cToken,
            asset.address,
            upgradeEvent.args,
            asset.pattern.findingType,
            asset.pattern.findingSeverity,
          ));
        });
      });
    });

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
  createUpgradeAlert,
};
