const {
  Finding, FindingSeverity, FindingType, ethers, getEthersBatchProvider,
} = require('forta-agent');

const CERC20_MINT_EVENT = 'event Mint(address minter, uint256 mintAmount, uint256 mintTokens)';
const ERC20_TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 amount)';

const { getAbi } = require('./utils');

// load any agent configuration parameters
const config = require('../agent-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create cToken alerts
function createMarketAttackAlert(
  protocolName,
  protocolAbbreviation,
  developerAbbreviation,
  compTokenSymbol,
  compTokenAddress,
  mintAmount,
  mintTokens,
  maliciousAddress,
  maliciousAmount,
) {
  const finding = Finding.fromObject({
    name: `${protocolName} cToken Market Attack Event`,
    description: `The address ${maliciousAddress} is potentially manipulating the cToken ${compTokenSymbol} market`,
    alertId: `${developerAbbreviation}-${protocolAbbreviation}-MARKET-ATTACK-EVENT`,
    type: FindingType.Suspicious,
    severity: FindingSeverity.Info,
    protocol: protocolName,
    metadata: {
      compTokenSymbol,
      compTokenAddress,
      mintAmount,
      mintTokens,
      maliciousAddress,
      maliciousAmount,
    },
  });
  return finding;
}

async function getCompoundTokens(
  provider,
  comptrollerContract,
  compTokenAbi,
  excludeAddresses,
  compTokens,
) {
  let compTokenAddresses = await comptrollerContract.getAllMarkets();
  compTokenAddresses = compTokenAddresses
    .map((addr) => addr.toLowerCase())
    .filter((addr) => excludeAddresses.indexOf(addr) === -1)
    .filter((addr) => !Object.keys(compTokens).includes(addr));

  const promises = compTokenAddresses.map(async (tokenAddress) => {
    const contract = new ethers.Contract(tokenAddress, compTokenAbi, provider);
    const symbol = await contract.symbol();

    // eslint-disable-next-line no-param-reassign
    compTokens[tokenAddress] = symbol;
  });
  await Promise.all(promises);
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    const { excludeAddresses } = config;
    data.excludeAddresses = excludeAddresses.map((addr) => addr.toLowerCase());

    data.provider = getEthersBatchProvider();

    const {
      Comptroller: comptroller,
      CompoundToken: compToken,
    } = config.contracts;

    // from the Comptroller contract, get all of the cTokens
    const comptrollerAbi = getAbi(comptroller.abiFile);
    data.comptrollerContract = new ethers.Contract(
      comptroller.address,
      comptrollerAbi,
      data.provider,
    );

    // cToken contracts
    data.compTokenAbi = getAbi(compToken.abiFile);
    data.compTokens = {};

    await getCompoundTokens(
      data.provider,
      data.comptrollerContract,
      data.compTokenAbi,
      data.excludeAddresses,
      data.compTokens,
    );
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      provider,
      excludeAddresses,
      compTokens,
      compTokenAbi,
      comptrollerContract,
    } = data;
    const findings = [];

    await getCompoundTokens(
      provider,
      comptrollerContract,
      compTokenAbi,
      excludeAddresses,
      compTokens,
    );

    const directTransferEvents = txEvent.filterLog(ERC20_TRANSFER_EVENT).filter(
      (transferEvent) => Object.keys(compTokens).includes(transferEvent.args.to),
    );

    directTransferEvents.forEach((transferEvent) => {
      const mintEvents = txEvent.filterLog(CERC20_MINT_EVENT, transferEvent.args.to);

      mintEvents.forEach((mintEvent) => {
        findings.push(createMarketAttackAlert(
          protocolName,
          protocolAbbreviation,
          developerAbbreviation,
          compTokens[transferEvent.args.to],
          transferEvent.args.to,
          mintEvent.args.mintAmount.toString(),
          mintEvent.args.mintTokens.toString(),
          transferEvent.args.from,
          transferEvent.args.amount.toString(),
        ));
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
  createMarketAttackAlert,
};
