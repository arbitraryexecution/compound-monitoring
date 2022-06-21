/* eslint-disable no-loss-of-precision */
const { ethers } = require('forta-agent');

/* eslint-disable no-loss-of-precision */
const defaultTypeMap = {
  uint256: 0,
  'uint256[]': [0],
  address: ethers.constants.AddressZero,
  'address[]': [ethers.constants.AddressZero],
  bytes: '0xff',
  'bytes[]': ['0xff'],
  bytes32: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF,
  'bytes32[]': [0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF],
  string: 'test',
  'string[]': ['test'],
};
/* eslint-enable no-loss-of-precision */

function getObjectsFromAbi(abi, objectType) {
  const contractObjects = {};
  abi.forEach((entry) => {
    if (entry.type === objectType) {
      contractObjects[entry.name] = entry;
    }
  });
  return contractObjects;
}

function getEventFromConfig(abi, events) {
  let eventInConfig;
  let eventNotInConfig;
  let findingType;
  let findingSeverity;

  const eventsInConfig = Object.keys(events);
  const eventObjects = getObjectsFromAbi(abi, 'event');
  Object.keys(eventObjects).forEach((name) => {
    if ((eventNotInConfig !== undefined) && (eventInConfig !== undefined)) {
      return;
    }

    if ((eventsInConfig.indexOf(name) === -1) && (eventNotInConfig === undefined)) {
      eventNotInConfig = eventObjects[name];
    }

    if ((eventsInConfig.indexOf(name) !== -1) && (eventInConfig === undefined)) {
      eventInConfig = eventObjects[name];
      findingType = events[name].type;
      findingSeverity = events[name].severity;
    }
  });
  return {
    eventInConfig, eventNotInConfig, findingType, findingSeverity,
  };
}

function createMockEventLogs(eventObject, iface, override = undefined) {
  const mockArgs = [];
  const mockTopics = [];
  const eventTypes = [];
  const defaultData = [];
  const abiCoder = ethers.utils.defaultAbiCoder;

  // push the topic hash of the event to mockTopics - this is the first item in a topics array
  const fragment = iface.getEvent(eventObject.name);
  mockTopics.push(iface.getEventTopic(fragment));

  eventObject.inputs.forEach((entry) => {
    let value;

    // check to make sure type is supported
    if (defaultTypeMap[entry.type] === undefined) {
      throw new Error(`Type ${entry.type} is not supported`);
    }

    // check to make sure any array types are not indexed
    if ((entry.type in ['uint256[]', 'address[]', 'bytes[]', 'bytes32[]', 'string[]'])
      && entry.indexed) {
      throw new Error(`Indexed type ${entry.type} is not supported`);
    }

    // determine whether to take the default value for the type, or if an override is given, take
    // that value
    if (override !== undefined && override[entry.name] !== undefined) {
      value = override[entry.name];
    } else {
      value = defaultTypeMap[entry.type];
    }

    // push the values into the correct array, indexed arguments go into topics, otherwise they go
    // into data
    if (entry.indexed) {
      mockTopics.push(ethers.utils.hexZeroPad(value, 32));
    } else {
      eventTypes.push(entry.type);
      defaultData.push(value);
    }

    // do not overwrite reserved JS words!
    if (mockArgs[entry.name] == null) {
      mockArgs[entry.name] = value;
    }
  });

  // encode the data array given the types array
  const data = abiCoder.encode(eventTypes, defaultData);
  return { mockArgs, mockTopics, data };
}

module.exports = {
  getObjectsFromAbi,
  getEventFromConfig,
  createMockEventLogs,
};
