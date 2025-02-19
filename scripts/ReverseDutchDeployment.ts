import { ethers } from "hardhat";
import { ReverseDutchSwap, ReverseDutchSwap__factory, MockERC20 } from "../typechain-types";

async function main() {
  console.log("Starting deployment...");

  console.log("Deploying Mock ERC20 Token...");
  const [deployer, seller, buyer] = await ethers.getSigners();
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20Factory.deploy(
    "Test Token", 
    "TST", 
    ethers.parseEther("1000000")
  );
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  console.log(`Mock ERC20 Token deployed to: ${mockTokenAddress}`);

  console.log("Deploying ReverseDutchSwap...");
  const ReverseDutchSwapFactory = await ethers.getContractFactory("ReverseDutchSwap");
  const reverseDutchSwap = await ReverseDutchSwapFactory.deploy();
  await reverseDutchSwap.waitForDeployment();
  const contractAddress = await reverseDutchSwap.getAddress();
  console.log(`ReverseDutchSwap deployed to: ${contractAddress}`);

  console.log("\n--- Demonstration of contract interaction ---");

  const tokenAmount = ethers.parseEther("100");
  console.log(`Transferring ${ethers.formatEther(tokenAmount)} tokens to seller...`);
  await mockToken.transfer(seller.address, tokenAmount);
  console.log(`Seller balance: ${ethers.formatEther(await mockToken.balanceOf(seller.address))}`);

  console.log("Approving tokens for auction...");
  await mockToken.connect(seller).approve(contractAddress, tokenAmount);
  console.log("Tokens approved");

  const startPrice = ethers.parseEther("2");
  const endPrice = ethers.parseEther("1");
  const duration = 3600; 
  console.log(`Creating auction: Start price: ${ethers.formatEther(startPrice)} ETH, End price: ${ethers.formatEther(endPrice)} ETH, Duration: ${duration} seconds`);
  
  const createTx = await reverseDutchSwap.connect(seller).createAuction(
    mockTokenAddress,
    tokenAmount,
    startPrice,
    endPrice,
    duration
  );
  const receipt = await createTx.wait();
  
  const auctionCreatedEvent = receipt?.logs.find(
    log => log.topics[0] === ethers.id("NewAuction(uint256,address,address,uint256,uint256,uint256,uint256)")
  );
  
  if (!auctionCreatedEvent) {
    console.error("Failed to find auction created event");
    return;
  }
  
  const auctionId = 1; 
  console.log(`Auction created with ID: ${auctionId}`);

  const currentPrice = await reverseDutchSwap.getCurrentPrice(auctionId);
  console.log(`Current auction price: ${ethers.formatEther(currentPrice)} ETH`);

  if (process.env.HARDHAT_NETWORK === "hardhat") {
    console.log("Simulating 30 minutes passing...");
    await ethers.provider.send("evm_increaseTime", [1800]);
    await ethers.provider.send("evm_mine", []);
    
    const midwayPrice = await reverseDutchSwap.getCurrentPrice(auctionId);
    console.log(`Price after 30 minutes: ${ethers.formatEther(midwayPrice)} ETH`);
  }

  console.log("\nFetching auction details...");
  const [auctionSeller, auctionToken, auctionAmount, auctionPrice, auctionEndTime, auctionActive] = 
    await reverseDutchSwap.getAuctionDetails(auctionId);
  
  console.log({
    seller: auctionSeller,
    token: auctionToken,
    amount: ethers.formatEther(auctionAmount),
    currentPrice: ethers.formatEther(auctionPrice),
    endTime: new Date(Number(auctionEndTime) * 1000).toLocaleString(),
    active: auctionActive
  });

  if (process.env.HARDHAT_NETWORK === "hardhat") {
    console.log("\nBuying tokens from auction...");
    const buyPrice = await reverseDutchSwap.getCurrentPrice(auctionId);
    const buyTx = await reverseDutchSwap.connect(buyer).buy(auctionId, { value: buyPrice });
    await buyTx.wait();
    
    console.log("Purchase successful!");
    console.log(`Buyer token balance: ${ethers.formatEther(await mockToken.balanceOf(buyer.address))}`);
    
    const [, , , , , auctionActiveAfter] = await reverseDutchSwap.getAuctionDetails(auctionId);
    console.log(`Auction active: ${auctionActiveAfter}`);
  } else {
    console.log("\nSkipping purchase simulation on production network");
    console.log(`To buy from this auction, send at least ${ethers.formatEther(currentPrice)} ETH to the contract`);
    console.log(`with the 'buy' function and auction ID ${auctionId}`);
  }

  console.log("\nDeployment and interaction complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });