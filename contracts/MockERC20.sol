// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    constructor(
        string memory name, 
        string memory symbol, 
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) { // ✅ FIX: Pass msg.sender to Ownable
        _mint(msg.sender, initialSupply);
    }
    
    function mint(uint256 amount) external onlyOwner {
        _mint(msg.sender, amount);
    }
}
