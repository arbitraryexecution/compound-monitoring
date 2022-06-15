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

// load values from the .env file
require('dotenv').config();

// load our JSON-RPC endpoint URL
const polygonEndpoint = process.env.POLYGON_ENDPOINT;

// load the private key for one of the owners of the Gnosis Safe
const ownerPrivateKey = process.env.PROPOSE_PRIVATE_KEY;

// load defender api keys and secrets
const defenderApiKey = process.env.DEFENDER_API_KEY;
const defnederApiSecret = process.env.DEFENDER_SECRET_KEY;

async function main() {
  // set up an ethers.js provider
  const provider = new ethers.providers.JsonRpcProvider(polygonEndpoint);

  // create an ethers.js Wallet (signer) and connect it to the provider
  const deployerWallet = new ethers.Wallet(ownerPrivateKey);
  const signer = deployerWallet.connect(provider);

//   // Forta SDK function
//   // get the private key for signing the manifest from the forta.config.json file
//   const { privateKey } = await getCredentials();

//   // set up an ethers.js Wallet
//   const fortaDeployerWallet = new ethers.Wallet(privateKey);

//   // Forta SDK function
//   // get the ethers.js Contract Object for interacting with the Forta AgentRegistry contract
//   const contract = agentRegistry.getContract(fortaDeployerWallet);

//   // Forta SDK function
//   // uploadImage() will look for a Dockerfile in the main level of the repository
//   // then it will invoke 'docker build' and push the image to the Forta Disco image repository
//   const imageReference = await uploadImage();

//   // Forta SDK function
//   // uploadManifest() will:
//   //   - upload documentation to IPFS
//   //   - create a bot manifest
//   //   - sign the bot manifest with a privateKey
//   //   - upload the manifest and signature to IPFS
//   //   - return the content ID for that content
//   const manifestReference = await uploadManifest(imageReference, privateKey);

const client = new AdminClient({apiKey: defenderApiKey, apiSecret: defnederApiSecret});


}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });