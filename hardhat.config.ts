import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@typechain/hardhat";

require('dotenv').config()
const {BASE_SEPOLIA_KEY, ACCOUNT_PRIVATE_KEY, BASESCAN_KEY } = process.env;


const config: HardhatUserConfig = {
  solidity: "0.8.28",

  typechain: {
    outDir: "typechain",  // Folder for the generated types
  },

  networks: {
    base: {
      url: BASE_SEPOLIA_KEY,
      accounts: [`0x${ACCOUNT_PRIVATE_KEY}`],
      chainId: 84532,
    },

    
  },
  etherscan: {
    apiKey: BASESCAN_KEY,
       
  }   
};

export default config;


