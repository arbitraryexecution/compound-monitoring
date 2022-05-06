const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');

const { getAbi } = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

const ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create distribution alerts
function createExceedsMaximumDistributionAlert(
  protocolName,
  protocolAbbreviation,
  developerAbbreviation,
  maxCompDistribution,
  compToken,
  maliciousAddress,
  compDelta,
  compIndex,
) {
  const finding = Finding.fromObject({
    name: `${protocolName} Exceeds Maximum Distribution Event`,
    description: `Distribution of ${compDelta} COMP to ${maliciousAddress} exceeds ${maxCompDistribution}`,
    alertId: `${developerAbbreviation}-${protocolAbbreviation}-EXCEEDS-MAXIMUM-DISTRIBUTION-EVENT`,
    protocol: protocolName,
    type: FindingType.Info,
    severity: FindingSeverity.Info,
    addresses: [
      compToken,
      maliciousAddress,
    ],
    metadata: {
      compDelta,
      compIndex,
    },
  });
  return finding;
}

function createExceedsSaneDistributionAlert(
  protocolName,
  protocolAbbreviation,
  developerAbbreviation,
  accruedToDistributedRatio,
  receiver,
  compDistributed,
  compAccrued,
) {
  const finding = Finding.fromObject({
    name: `${protocolName} Distribution Event`,
    description: `Distributed ${accruedToDistributedRatio.toFixed(0)}% more COMP to ${receiver} than expected`,
    alertId: `${developerAbbreviation}-${protocolAbbreviation}-DISTRIBUTION-EVENT`,
    protocol: protocolName,
    type: FindingType.Info,
    severity: FindingSeverity.Info,
    metadata: {
      compDistributed,
      compAccrued,
      receiver
    },
  });
  return finding;
}

function provideInitialize(data) {
  return async function initialize() {
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    data.distributionThresholdPercent = config.distributionThresholdPercent;
    data.minimumDistributionAmount = config.minimumDistributionAmount;

    data.provider = getEthersProvider();

    const {
      Comptroller: comptroller,
      CompoundToken: compToken,
    } = config.contracts;

    // from the Comptroller contract
    const comptrollerAbi = getAbi(comptroller.abiFile);
    const comptrollerAddress = comptroller.address.toLowerCase();

    data.comptrollerAddress = comptrollerAddress;
    data.comptrollerContract = new ethers.Contract(
      comptrollerAddress,
      comptrollerAbi,
      data.provider,
    );

    const sigType = ethers.utils.FormatTypes.full;
    const iface = new ethers.utils.Interface(comptrollerAbi);
    data.distributionSignatures = [
      iface.getEvent('DistributedSupplierComp').format(sigType),
      iface.getEvent('DistributedBorrowerComp').format(sigType),
    ];

    const decimalsAbi = ['function decimals() view returns (uint8)'];
    const compAddress = compToken.address.toLowerCase();
    const compContract = new ethers.Contract(compAddress, decimalsAbi, data.provider);
    const compDecimals = await compContract.decimals();

    data.compoundTokenDecimalsMultiplier = new BigNumber(10).pow(compDecimals);
    data.compAddress = compAddress;
  }
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      compoundTokenDecimalsMultiplier,
      comptrollerContract,
      comptrollerAddress,
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      distributionSignatures
    } = data;

    if (!comptrollerContract) throw new Error('handleTransaction called before initialization');
    const findings = [];
  
    // if no events found for distributing COMP, return
    const distributionEvents = txEvent.filterLog(
      distributionSignatures, 
      comptrollerAddress
    );

    await Promise.all(distributionEvents.map(async (distributionEvent) => {
      const amountCompDistributedBN = new BigNumber(
        distributionEvent.args.compDelta.toString(),
      ).div(compoundTokenDecimalsMultiplier);

      let cToken = distributionEvent.args.cToken;
      let maliciousAddress;
      let compIndex;
      let compPreviousIndex;
      let compSpeed;
      let compState;
      if (distributionEvent.name === 'DistributedBorrowerComp') {
        maliciousAddress = distributionEvent.args.borrower;
        compIndex = distributionEvent.args.compBorrowIndex;

        compPreviousIndex = await comptrollerContract.compBorrowerIndex(cToken, maliciousAddress, { blockTag: txEvent.blockNumber - 1 })
        compState = await comptrollerContract.compBorrowState(cToken, { blockTag: txEvent.blockNumber - 1 });
        compSpeed = await comptrollerContract.compBorrowSpeeds(cToken);
      } else if (distributionEvent.name === 'DistributedSupplierComp') {
        maliciousAddress = distributionEvent.args.supplier;
        compIndex = distributionEvent.args.compSupplyIndex;

        compPreviousIndex = await comptrollerContract.compSupplierIndex(cToken, maliciousAddress, { blockTag: txEvent.blockNumber - 1 })
        compState = await comptrollerContract.compSupplyState(cToken, { blockTag: txEvent.blockNumber - 1 });
        compSpeed = await comptrollerContract.compSupplySpeeds(cToken);
      }

      const compSpeedBN = new BigNumber(compSpeed.toString()).div(compoundTokenDecimalsMultiplier);
      const compIndexBN = new BigNumber(compIndex.toString()).div(compoundTokenDecimalsMultiplier);
      const compDelta = txEvent.blockNumber - compState.block;
      const maxCompDistribution = compSpeedBN.times(compDelta);

      console.log("speed: ", compSpeedBN.toString());
      console.log("block delta: ", compDelta.toString());
      console.log("current index: ", compState.index.toString())
      console.log("previous index: ", compPreviousIndex.toString())
      console.log("delta index: ", )
      console.log("max: ", maxCompDistribution.toString());
      console.log("amount: ", amountCompDistributedBN.toString());

      // check against the maximum amount of COMP that can be
      //  distributed to a CToken
      if (amountCompDistributedBN.gt(maxCompDistribution.div(compoundTokenDecimalsMultiplier))) {
        findings.push(createExceedsMaximumDistributionAlert(
          protocolName,
          protocolAbbreviation,
          developerAbbreviation,
          maxCompDistribution,
          distributionEvent.args.cToken,
          maliciousAddress,
          amountCompDistributedBN.toString(),
          compIndexBN.toFixed(),
        ));
      } else if (amountCompDistributedBN.gt(maximumSaneDistributionAmount)) { 
      // check against a maximum "sane" distribution amount of COMP
      //  and alert then even if the previous is zero?
        findings.push(createExceedsSaneDistributionAlert(
          protocolName,
          protocolAbbreviation,
          developerAbbreviation,
          maximumSaneDistributionAmount,
          distributionEvent.args.cToken,
          maliciousAddress,
          amountCompDistributedBN.toString(),
          compIndexBN.toString(),
        ));
      }
    }));

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};