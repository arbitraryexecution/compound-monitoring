const {
  Finding, FindingSeverity, FindingType, ethers, getEthersBatchProvider,
} = require('forta-agent');

const web3 = require('web3-Eth');
const web3Eth = new web3();

const {
  getAbi,
} = require('./utils');

// load any agent configuration parameters
const config = require('../agent-config.json');

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
  eventSeverity
) {
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
      "eventArguments": {
        ...eventArgs,
      }
    },
  });
  return finding;
}

function isUpgradeableProxy(asset, proxyPatterns) {
  let foundPattern = false;

  proxyPatterns.some((pattern) => {
    let isPattern = pattern.functionHashes.every((functionHash) => {
      if ( asset.code.indexOf(functionHash) !== -1) {
        return true;
      } else {
        return false;
      }
    });
    if ( isPattern ) {
      foundPattern = pattern;
      return true;
    }
    else {
      return false;
    }
  });  

  return foundPattern;
}

async function getUnderlyingAsset(address, abi, provider, proxyPatterns) {
  let underlyingTokenAddress;
  let symbol;

  const underlyingAsset = {
    "isProxy": false
  };

  const contract = new ethers.Contract(address, abi, provider);

  try {
    symbol = await contract.symbol();
    underlyingTokenAddress = await contract.underlying();
  } catch(e) {
    console.log(e);
  }

  if ( underlyingTokenAddress ) {
    underlyingAsset.symbol = symbol;
    underlyingAsset.cToken = address;
    underlyingAsset.address = underlyingTokenAddress;
    underlyingAsset.code = await provider.getCode(underlyingTokenAddress);

    let proxyPattern = isUpgradeableProxy(underlyingAsset, proxyPatterns);
    if ( proxyPattern !== false) {
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
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    let excludeAddresses = config.excludeAddresses;
    excludeAddresses.map((addr) => addr.toLowerCase());
    data.excludeAddresses = excludeAddresses;

    data.proxyPatterns = config.proxyPatterns;
    data.proxyPatterns.forEach((pattern) => {
      pattern.functionHashes = [];
      pattern.functionSignatures.forEach((signature) => {
        let hash = web3Eth.abi.encodeFunctionSignature(signature).slice(2);
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

    data.underlyingAssets = [];
    const promises = data.cTokenAddresses.map(async (address) => {
      data.underlyingAssets.push(await getUnderlyingAsset(address, data.cTokenAbi, data.provider, data.proxyPatterns));
    });
    await Promise.all(promises);
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      provider,
      cTokenAddresses,
      cTokenAbi,
      underlyingAssets,
      comptrollerContract,
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      excludeAddresses,
      proxyPatterns
    } = data;

    const findings = [];

    // first check that no additional cTokens have been added
    const currentCTokenAddresses = await getCompoundTokens(comptrollerContract, excludeAddresses);
    const unique = currentCTokenAddresses.filter((addr) => cTokenAddresses.indexOf(addr) === -1);

    cTokenAddresses.push(...unique);

    if (unique.length > 0) {
      // create ethers.js Contract Objects and add them to the Object of other Contract Objects
      const promises = unique.map(async (address) => {
        underlyingAssets.push(await getUnderlyingAsset(address, cTokenAbi, provider, proxyPatterns));
      });
      await Promise.all(promises);
    }

    const upgradeableProxyAssets = underlyingAssets.filter((asset) => asset.isProxy === true);
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
            asset.pattern.findingSeverity
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
  createUpgradeAlert
};