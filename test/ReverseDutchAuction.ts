import { expect } from "chai";
import { ethers } from "hardhat";
import { ReverseDutchSwap, ReverseDutchSwap__factory, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ReverseDutchSwap", function () {
  let reverseDutchSwap: ReverseDutchSwap;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  
  const tokenAmount = ethers.parseEther("100");
  const startPrice = ethers.parseEther("2");
  const endPrice = ethers.parseEther("1");
  const duration = 3600; // 1 hour

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();
    
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20Factory.deploy("Mock Token", "MTK", ethers.parseEther("1000000"));
    
    const ReverseDutchSwapFactory = await ethers.getContractFactory("ReverseDutchSwap");
    reverseDutchSwap = await ReverseDutchSwapFactory.deploy();
    
    await mockToken.transfer(seller.address, tokenAmount);
    
    await mockToken.connect(seller).approve(await reverseDutchSwap.getAddress(), tokenAmount);
  });

  describe("Auction Creation", function () {
    it("Should create an auction successfully", async function () {
      const tx = await reverseDutchSwap.connect(seller).createAuction(
        await mockToken.getAddress(),
        tokenAmount,
        startPrice,
        endPrice,
        duration
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        log => log.topics[0] === ethers.id("NewAuction(uint256,address,address,uint256,uint256,uint256,uint256)")
      );
      
      expect(event).to.not.be.undefined;
      
      const auctionId = 1;
      const auction = await reverseDutchSwap.auctions(auctionId);
      
      expect(auction.seller).to.equal(seller.address);
      expect(auction.tokenAddress).to.equal(await mockToken.getAddress());
      expect(auction.tokenAmount).to.equal(tokenAmount);
      expect(auction.startPrice).to.equal(startPrice);
      expect(auction.endPrice).to.equal(endPrice);
      expect(auction.isActive).to.be.true;
    });

    it("Should revert if start price is not greater than end price", async function () {
      await expect(
        reverseDutchSwap.connect(seller).createAuction(
          await mockToken.getAddress(),
          tokenAmount,
          endPrice,
          endPrice,
          duration
        )
      ).to.be.revertedWith("Start price must be greater than end price.");
    });
  });

  describe("Price Calculation", function () {
    let auctionId: number;

    beforeEach(async function () {
      const tx = await reverseDutchSwap.connect(seller).createAuction(
        await mockToken.getAddress(),
        tokenAmount,
        startPrice,
        endPrice,
        duration
      );
      const receipt = await tx.wait();
      auctionId = 1;
    });

    it("Should calculate the correct price at start time", async function () {
      const price = await reverseDutchSwap.getCurrentPrice(auctionId);
      expect(price).to.be.closeTo(startPrice, ethers.parseEther("0.001"));
    });

    it("Should calculate the correct price at halfway point", async function () {
      await time.increase(duration / 2);
      
      const price = await reverseDutchSwap.getCurrentPrice(auctionId);
      const expectedPrice = startPrice - ((startPrice - endPrice) / 2n);
      
      expect(price).to.be.closeTo(expectedPrice, ethers.parseEther("0.001"));
    });

    it("Should return end price after auction duration", async function () {
      await time.increase(duration + 10);
      
      const price = await reverseDutchSwap.getCurrentPrice(auctionId);
      expect(price).to.equal(endPrice);
    });
  });

  describe("Buying Tokens", function () {
    let auctionId: number;

    beforeEach(async function () {
      const tx = await reverseDutchSwap.connect(seller).createAuction(
        await mockToken.getAddress(),
        tokenAmount,
        startPrice,
        endPrice,
        duration
      );
      auctionId = 1;
    });

    it("Should allow buying at current price", async function () {
      await time.increase(duration / 2);
      
      const price = await reverseDutchSwap.getCurrentPrice(auctionId);
      const buyerBalanceBefore = await mockToken.balanceOf(buyer.address);
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      const tx = await reverseDutchSwap.connect(buyer).buy(auctionId, { value: price });
      await tx.wait();
      
      const buyerBalanceAfter = await mockToken.balanceOf(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(tokenAmount);
      
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter > sellerBalanceBefore).to.be.true;
      
      const auction = await reverseDutchSwap.auctions(auctionId);
      expect(auction.isActive).to.be.false;
      expect(auction.buyer).to.equal(buyer.address);
    });

    // it("Should refund excess ETH when overpaying", async function () {
    //   const price = await reverseDutchSwap.getCurrentPrice(auctionId);
    //   const overpayment = price + ethers.parseEther("0.5");
      
    //   const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      
    //   const tx = await reverseDutchSwap.connect(buyer).buy(auctionId, { value: overpayment });
    //   const receipt = await tx.wait();
      
    //   const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      
    //   const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    //   const expectedBalance = buyerBalanceBefore - price - gasUsed;
      
    //   expect(buyerBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
    // });

    it("Should revert when trying to buy with insufficient funds", async function () {
      const price = await reverseDutchSwap.getCurrentPrice(auctionId);
      const insufficientAmount = price - ethers.parseEther("0.1");
      
      await expect(
        reverseDutchSwap.connect(buyer).buy(auctionId, { value: insufficientAmount })
      ).to.be.revertedWith("Insufficient ETH sent for purchase.");
    });
  });

  describe("Auction Cancellation", function () {
    let auctionId: number;

    beforeEach(async function () {
      const tx = await reverseDutchSwap.connect(seller).createAuction(
        await mockToken.getAddress(),
        tokenAmount,
        startPrice,
        endPrice,
        duration
      );
      auctionId = 1;
    });

    it("Should allow seller to cancel auction", async function () {
      const sellerTokensBefore = await mockToken.balanceOf(seller.address);
      
      await reverseDutchSwap.connect(seller).cancelAuction(auctionId);
    
      const sellerTokensAfter = await mockToken.balanceOf(seller.address);
      expect(sellerTokensAfter - sellerTokensBefore).to.equal(tokenAmount);
      
      const auction = await reverseDutchSwap.auctions(auctionId);
      expect(auction.isActive).to.be.false;
    });

    it("Should allow owner to cancel auction", async function () {
      const sellerTokensBefore = await mockToken.balanceOf(seller.address);
      
      await reverseDutchSwap.connect(owner).cancelAuction(auctionId);
    
      const sellerTokensAfter = await mockToken.balanceOf(seller.address);
      expect(sellerTokensAfter - sellerTokensBefore).to.equal(tokenAmount);
    });

    it("Should prevent non-owner/non-seller from cancelling", async function () {
      await expect(
        reverseDutchSwap.connect(buyer).cancelAuction(auctionId)
      ).to.be.revertedWith("Only seller or owner can cancel.");
    });
  });

  describe("Auction Details", function () {
    let auctionId: number;

    beforeEach(async function () {
      const tx = await reverseDutchSwap.connect(seller).createAuction(
        await mockToken.getAddress(),
        tokenAmount,
        startPrice,
        endPrice,
        duration
      );
      auctionId = 1;
    });

    it("Should return correct auction details", async function () {
      const [sellerAddr, tokenAddr, amount, currentPrice, endTime, active] = 
        await reverseDutchSwap.getAuctionDetails(auctionId);
      
      expect(sellerAddr).to.equal(seller.address);
      expect(tokenAddr).to.equal(await mockToken.getAddress());
      expect(amount).to.equal(tokenAmount);
      expect(currentPrice).to.be.closeTo(startPrice, ethers.parseEther("0.001"));
      expect(active).to.be.true;
    });
  });
});