// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReverseDutchSwap {
    address public owner;
    
    struct Auction {
        address seller;
        address tokenAddress;
        uint tokenAmount;
        uint startPrice;
        uint endPrice;
        uint startTime;
        uint endTime;
        bool isActive;
        address buyer;
    }
    
    uint public auctionId;
    mapping(uint => Auction) public auctions;
    
    event NewAuction(uint auctionId, address seller, address tokenAddress, uint amount, uint startPrice, uint endPrice, uint duration);
    event AuctionCompleted(uint auctionId, address buyer, uint price);
    event AuctionCancelled(uint auctionId);
    
    constructor() {
        owner = msg.sender;
        auctionId = 1;
    }
    
    function createAuction(
        address _tokenAddress,
        uint _amount,
        uint _startPrice,
        uint _endPrice,
        uint _duration
    ) external returns (uint) {
        require(_startPrice > _endPrice, "start price must be higher than end");
        require(_duration > 0, "auction must last some time");
        require(_amount > 0, "cant auction zero tokens");
        
        IERC20 token = IERC20(_tokenAddress);
        
        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "token transfer failed");
        
        uint id = auctionId;
        
        auctions[id] = Auction({
            seller: msg.sender,
            tokenAddress: _tokenAddress,
            tokenAmount: _amount,
            startPrice: _startPrice,
            endPrice: _endPrice,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            isActive: true,
            buyer: address(0)
        });
        
        auctionId++;
        
        emit NewAuction(id, msg.sender, _tokenAddress, _amount, _startPrice, _endPrice, _duration);
        
        return id;
    }
    
    function getCurrentPrice(uint id) public view returns (uint) {
        Auction memory auction = auctions[id];
        require(auction.isActive, "auction not active");
        
        if (block.timestamp >= auction.endTime) {
            return auction.endPrice;
        }
        
        uint timeElapsed = block.timestamp - auction.startTime;
        uint duration = auction.endTime - auction.startTime;
        uint priceDrop = auction.startPrice - auction.endPrice;
        
        uint currentPrice = auction.startPrice - (priceDrop * timeElapsed / duration);
        return currentPrice;
    }
    
    function buy(uint id) external payable {
        Auction storage auction = auctions[id];
        
        require(auction.isActive, "auction not active");
        require(block.timestamp <= auction.endTime, "auction expired");
        
        uint price = getCurrentPrice(id);
        require(msg.value >= price, "not enough eth sent");
        
        auction.isActive = false;
        auction.buyer = msg.sender;
        
        IERC20 token = IERC20(auction.tokenAddress);
        bool success = token.transfer(msg.sender, auction.tokenAmount);
        require(success, "token transfer failed");
        
        uint refund = msg.value - price;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
        
        payable(auction.seller).transfer(price);
        
        emit AuctionCompleted(id, msg.sender, price);
    }
    
    function cancelAuction(uint id) external {
        Auction storage auction = auctions[id];
        
        require(auction.seller == msg.sender || msg.sender == owner, "not seller or owner");
        require(auction.isActive, "auction not active");
        
        auction.isActive = false;
        
        IERC20 token = IERC20(auction.tokenAddress);
        token.transfer(auction.seller, auction.tokenAmount);
        
        emit AuctionCancelled(id);
    }
    
    function checkAuctionDetails(uint id) external view returns (
        address seller,
        address token,
        uint amount,
        uint currentPrice,
        uint endTime,
        bool active
    ) {
        Auction memory auction = auctions[id];
        uint price = getCurrentPrice(id);
        
        return (
            auction.seller,
            auction.tokenAddress,
            auction.tokenAmount,
            price,
            auction.endTime,
            auction.isActive
        );
    }
}