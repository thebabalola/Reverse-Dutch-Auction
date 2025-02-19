const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ReverseDutchSwap", function () {
  async function setupAuctionFixture() {
    const [owner, seller, buyer1, buyer2] = await ethers.getSigners();
    
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Test Token", "TST", ethers.utils.parseEther("10000"));
    
    const DutchSwap = await ethers.getContractFactory("ReverseDutchSwap");
    const swap = await DutchSwap.deploy();
    
    const startPrice = ethers.utils.parseEther("1");
    const endPrice = ethers.utils.parseEther("0.5");
    const tokenAmount = ethers.utils.parseEther("100");
    const duration = 3600; // 1 hour
    
    await token.connect(seller).mint(ethers.utils.parseEther("1000"));
    await token.connect(seller).approve(swap.address, tokenAmount);
    
    return { swap, token, owner, seller, buyer1, buyer2, startPrice, endPrice, tokenAmount, duration };
  }
  
  it("should create an auction correctly", async function() {
    const { swap, token, seller, startPrice, endPrice, tokenAmount, duration } = await loadFixture(setupAuctionFixture);
    
    const tx = await swap.connect(seller).createAuction(
      token.address,
      tokenAmount,
      startPrice,
      endPrice,
      duration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "NewAuction");
    expect(event.args.seller).to.equal(seller.address);
    expect(event.args.tokenAddress).to.equal(token.address);
    expect(event.args.amount).to.equal(tokenAmount);
    
    const auctionId = event.args.auctionId;
    const auction = await swap.auctions(auctionId);
    expect(auction.isActive).to.equal(true);
  });
  
  it("should calculate price correctly over time", async function() {
    const { swap, token, seller, startPrice, endPrice, tokenAmount, duration } = await loadFixture(setupAuctionFixture);
    
    const tx = await swap.connect(seller).createAuction(
      token.address,
      tokenAmount,
      startPrice,
      endPrice,
      duration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "NewAuction");
    const auctionId = event.args.auctionId;
    
    const initialPrice = await swap.getCurrentPrice(auctionId);
    expect(initialPrice).to.equal(startPrice);
    
    await ethers.provider.send("evm_increaseTime", [duration / 2]);
    await ethers.provider.send("evm_mine");
    
    const halfwayPrice = await swap.getCurrentPrice(auctionId);
    const expectedHalfwayPrice = startPrice.sub(startPrice.sub(endPrice).div(2));
    
    expect(halfwayPrice).to.be.closeTo(expectedHalfwayPrice, ethers.utils.parseEther("0.01"));
    
    await ethers.provider.send("evm_increaseTime", [duration / 2]);
    await ethers.provider.send("evm_mine");
    
    const finalPrice = await swap.getCurrentPrice(auctionId);
    expect(finalPrice).to.equal(endPrice);
  });
  
  it("should allow buyer to purchase at current price", async function() {
    const { swap, token, seller, buyer1, startPrice, endPrice, tokenAmount, duration } = await loadFixture(setupAuctionFixture);
    
    const tx = await swap.connect(seller).createAuction(
      token.address,
      tokenAmount,
      startPrice,
      endPrice,
      duration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "NewAuction");
    const auctionId = event.args.auctionId;
    
    await ethers.provider.send("evm_increaseTime", [duration / 4]);
    await ethers.provider.send("evm_mine");
    
    const currentPrice = await swap.getCurrentPrice(auctionId);
    
    const balanceBefore = await ethers.provider.getBalance(seller.address);
    
    await swap.connect(buyer1).buy(auctionId, { value: currentPrice });
    
    const buyerTokenBalance = await token.balanceOf(buyer1.address);
    expect(buyerTokenBalance).to.equal(tokenAmount);
    
    const balanceAfter = await ethers.provider.getBalance(seller.address);
    expect(balanceAfter.sub(balanceBefore)).to.equal(currentPrice);
  });
  
  it("should prevent multiple buyers for the same auction", async function() {
    const { swap, token, seller, buyer1, buyer2, startPrice, endPrice, tokenAmount, duration } = await loadFixture(setupAuctionFixture);
    
    const tx = await swap.connect(seller).createAuction(
      token.address,
      tokenAmount,
      startPrice,
      endPrice,
      duration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "NewAuction");
    const auctionId = event.args.auctionId;
    
    const currentPrice = await swap.getCurrentPrice(auctionId);
    
    await swap.connect(buyer1).buy(auctionId, { value: currentPrice });
    
    await expect(
      swap.connect(buyer2).buy(auctionId, { value: currentPrice })
    ).to.be.revertedWith("auction not active");
  });
  
  it("should allow cancelling an auction", async function() {
    const { swap, token, seller, startPrice, endPrice, tokenAmount, duration } = await loadFixture(setupAuctionFixture);
    
    const tx = await swap.connect(seller).createAuction(
      token.address,
      tokenAmount,
      startPrice,
      endPrice,
      duration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "NewAuction");
    const auctionId = event.args.auctionId;
    
    const sellerBalanceBefore = await token.balanceOf(seller.address);
    
    await swap.connect(seller).cancelAuction(auctionId);
    
    const sellerBalanceAfter = await token.balanceOf(seller.address);
    expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(tokenAmount);
    
    const auction = await swap.auctions(auctionId);
    expect(auction.isActive).to.equal(false);
  });
});