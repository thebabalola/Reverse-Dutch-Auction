// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReverseDutchSwap {
    using SafeERC20 for IERC20; 
    
    address public owner;
    
    struct Auction {
        address seller;
        address tokenAddress;
        uint256 tokenAmount;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        address buyer;
    }
    
    uint256 private nextAuctionId = 1;
    mapping(uint256 => Auction) public auctions;

    constructor() {
        owner = msg.sender;
    }

    function createAuction(address _tokenAddress, uint256 _amount, uint256 _startPrice, uint256 _endPrice, uint256 _duration) external returns (uint256 auctionId) {
        require(_startPrice > _endPrice, "Start price must be greater than end price.");
        require(_duration > 0, "Auction must have a valid duration.");
        require(_amount > 0, "Cannot auction zero tokens.");

        IERC20 token = IERC20(_tokenAddress);

        token.safeTransferFrom(msg.sender, address(this), _amount);

        auctionId = nextAuctionId++;

        auctions[auctionId] = Auction({
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

        emit NewAuction(auctionId, msg.sender, _tokenAddress, _amount, _startPrice, _endPrice, _duration);
    }
        event NewAuction(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration);


    function getCurrentPrice(uint256 id) public view returns (uint256) {
        Auction storage auction = auctions[id];
        require(auction.isActive, "Auction is not active.");

        if (block.timestamp >= auction.endTime) {
            return auction.endPrice;
        }

        uint256 elapsedTime = block.timestamp - auction.startTime;
        uint256 totalDuration = auction.endTime - auction.startTime;
        uint256 priceDifference = auction.startPrice - auction.endPrice;

        return auction.startPrice - ((priceDifference * elapsedTime) / totalDuration);
    }

    function buy(uint256 id) external payable {
        Auction storage auction = auctions[id];

        require(auction.isActive, "This auction is no longer active.");
        require(block.timestamp <= auction.endTime, "Auction has already ended.");
        
        uint256 price = getCurrentPrice(id);
        require(msg.value >= price, "Insufficient ETH sent for purchase.");

        auction.isActive = false;
        auction.buyer = msg.sender;

        IERC20 token = IERC20(auction.tokenAddress);
        token.safeTransfer(msg.sender, auction.tokenAmount);

        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }

        payable(auction.seller).transfer(price);

        emit AuctionCompleted(id, msg.sender, price);
    }
        event AuctionCompleted(uint256 indexed auctionId, address indexed buyer, uint256 finalPrice);

    function cancelAuction(uint256 id) external {
        Auction storage auction = auctions[id];

        require(msg.sender == auction.seller || msg.sender == owner, "Only seller or owner can cancel.");
        require(auction.isActive, "Auction is not active.");

        auction.isActive = false;

        IERC20 token = IERC20(auction.tokenAddress);
        token.safeTransfer(auction.seller, auction.tokenAmount);

        emit AuctionCancelled(id, auction.seller);
    }
        event AuctionCancelled(uint256 indexed auctionId, address indexed seller);

    function getAuctionDetails(uint256 id) external view returns (address seller, address token, uint256 amount, uint256 currentPrice, uint256 endTime, bool active) {
        Auction memory auction = auctions[id];
        uint256 price = getCurrentPrice(id);

        return (auction.seller, auction.tokenAddress, auction.tokenAmount, price, auction.endTime, auction.isActive);
    }
}
