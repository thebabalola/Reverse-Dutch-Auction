const hre = require("hardhat");

async function main() {
  console.log("Deploying Reverse Dutch Swap contract...");
  
  const ReverseDutchSwap = await hre.ethers.getContractFactory("ReverseDutchSwap");
  const swap = await ReverseDutchSwap.deploy();
  
  await swap.deployed();
  
  console.log("ReverseDutchSwap deployed to:", swap.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });