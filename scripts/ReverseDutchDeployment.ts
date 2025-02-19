const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  // Deploy mock ERC20 token first
  const MockToken = await ethers.getContractFactory("MockERC20");
  const token = await MockToken.deploy("Test Token", "TST", ethers.utils.parseEther("10000"));
  await token.deployed();
  console.log("Mock token deployed to:", token.address);
  
  // Deploy the swap contract
  const SwapContract = await ethers.getContractFactory("ReverseDutchSwap");
  const swap = await SwapContract.deploy();
  await swap.deployed();
  console.log("Dutch auction swap deployed to:", swap.address);
  
  // Get a couple signers
  const [seller, buyer] = await ethers.getSigners();
  
  // Approve and create an auction
  const tokenAmount = ethers.utils.parseEther("100");
  const startPrice = ethers.utils.parseEther("1");
  const endPrice = ethers.utils.parseEther("0.5");
  const duration = 3600; // 1 hour
  
  await token.approve(swap.address, tokenAmount);
  
  console.log("Creating auction...");
  const tx = await swap.createAuction(
    token.address,
    tokenAmount,
    startPrice,
    endPrice,
    duration
  );
  
  const receipt = await tx.wait();
  const event = receipt.events.find(e => e.event === "NewAuction");
  const auctionId = event.args.auctionId;
  
  console.log(`Auction created with ID: ${auctionId}`);
  
  // Check the price after some time
  console.log("Initial price:", ethers.utils.formatEther(await swap.getCurrentPrice(auctionId)));
  
  // Wait some time to simulate price drop
  console.log("Waiting for price to decrease...");
  await hre.network.provider.send("evm_increaseTime", [1800]); // fast forward 30 minutes
  await hre.network.provider.send("evm_mine");
  
  const midPrice = await swap.getCurrentPrice(auctionId);
  console.log("Price after 30 minutes:", ethers.utils.formatEther(midPrice));
  
  // Execute the buy from buyer account
  console.log("Buyer purchasing tokens...");
  await swap.connect(buyer).buy(auctionId, { value: midPrice });
  
  console.log("Purchase complete!");
  
  // Check token balance of buyer
  const buyerBalance = await token.balanceOf(buyer.address);
  console.log("Buyer token balance:", ethers.utils.formatEther(buyerBalance));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });