import "dotenv/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy'
import 'solidity-coverage'
import 'hardhat-gas-reporter'

import { randomBytes } from 'crypto';
import { network } from "hardhat";

if(process.env.COMPILE_ONLY != "1") {
  require('./tasks/deploy');
  require('./tasks/inspect');
}

const configureNetwork = (network: string, chainId: number, gasPrice?: number) => ({
  url: `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`,
  chainId,
  accounts: [process.env[`${network.toUpperCase()}_PVT_KEY`] ?? randomBytes(32).toString('hex')],
  gasPrice: gasPrice ?? undefined
});

let networks = {
  hardhat: {
    allowUnlimitedContractSize: false,
    forking: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      enabled: true
    }
  },
  mainnet: configureNetwork('mainnet', 1),
  kovan: configureNetwork('kovan', 42),
  rinkeby: configureNetwork('rinkeby', 4),
  goerli: configureNetwork('goerli', 5),
  fork: {
    url: "http://127.0.0.1:8545/"
  }
}

if(process.env.SANDBOX_URL && process.env.SANDBOX_PVT_KEY) {
  // @ts-ignore
  networks.sandbox = {
    url: process.env.SANDBOX_URL,
    accounts: [process.env.SANDBOX_PVT_KEY],
  }
}

export default {
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks,
  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
}
