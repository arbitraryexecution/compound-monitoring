const fortaAgent = require('forta-agent');
const { AdminClient } = require('defender-admin-client')

const { ethers } = fortaAgent;

// get the Awilix container with its registered modules
const container = fortaAgent.configureContainer();

const {
    agentRegistry,
    uploadImage,
    uploadManifest,
    getCredentials,
    agentId,
    chainIds,
  } = container.cradle;

  console.log(chainIds)

// load values from the .env file
require('dotenv').config();

// load our JSON-RPC endpoint URL
const polygonEndpoint = process.env.POLYGON_ENDPOINT;

// load the private key for one of the owners of the Gnosis Safe
const ownerPrivateKey = process.env.PROPOSE_PRIVATE_KEY;

// load defender api keys and secrets
const defenderApiKey = process.env.DEFENDER_API_KEY;
const defenderApiSecret = process.env.DEFENDER_SECRET_KEY;

async function main() {
  // set up an ethers.js provider
  const provider = new ethers.providers.JsonRpcProvider(polygonEndpoint);

  // create an ethers.js Wallet (signer) and connect it to the provider
  const deployerWallet = new ethers.Wallet(ownerPrivateKey);
  const signer = deployerWallet.connect(provider);

  // Forta SDK function
  // get the private key for signing the manifest from the forta.config.json file
  const { privateKey } = await getCredentials();

  // set up an ethers.js Wallet
  // const fortaDeployerWallet = new ethers.Wallet(privateKey);

  // Forta SDK function
  // get the ethers.js Contract Object for interacting with the Forta AgentRegistry contract
  // const contract = agentRegistry.getContract(fortaDeployerWallet);

  // Forta SDK function
  // uploadImage() will look for a Dockerfile in the main level of the repository
  // then it will invoke 'docker build' and push the image to the Forta Disco image repository
  const imageReference = await uploadImage();

  // Forta SDK function
  // uploadManifest() will:
  //   - upload documentation to IPFS
  //   - create a bot manifest
  //   - sign the bot manifest with a privateKey
  //   - upload the manifest and signature to IPFS
  //   - return the content ID for that content
  const manifestReference = await uploadManifest(imageReference, privateKey);

  const owner = signer.address // the user's address who input their private key in the .env will be the owner

  const client = new AdminClient({apiKey: defenderApiKey, apiSecret: defenderApiSecret});
  
  const agentRegistryAddress = agentRegistry.agentRegistryContractAddress;
  
  // 0xFCbD2052cdD0B4fB10EDc60Eb3eAFeE434aee943 - rinkeby test contract address

  // function createAgent(uint256 agentId, address owner, string calldata metadata, uint256[] calldata chainIds)
  await client.createProposal({
    contract: { address: agentRegistryAddress, network: 'matic'}, // target contract - should be the forta bot registrar smart contract
    title: 'Forta Bot Deployment Test', // title of proposal
    description: 'Testing Forta Bot deployment from Defender Admin', // description of proposal
    type: 'custom', // put custom for custom actions (anything that's not a pause, unpause or upgrade action)
    functionInterface: { // function ABI that you want to target
      name: "createAgent",
      inputs: 
        [{
          "name": "agentId",
          "type": "uint256"
        },
        {
          "name": "owner",
          "type": "address"
        },
        {
          "name": "metadata",
          "type": "string"
        },
        {
          "name": "chainIds",
          "type": "uint256[]"
        }]
    },
    functionInputs: [agentId, owner, manifestReference, ['137']], // function inputs
    via: owner, // address you want to execute the proposal
    viaType: 'EOA' // 'Gnosis Safe', 'Gnosis Multisig', or 'EOA'
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });