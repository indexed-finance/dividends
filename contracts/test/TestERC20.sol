// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../base/ERC20.sol";


contract TestERC20 is ERC20 {
  mapping(address => address) public delegates;
  event Delegate(address indexed delegator, address indexed delegatee);

  // constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_, 18) {}

  function mint(address account, uint256 amount) external {
    _mint(account, amount);
  }

  function delegate(address delegatee) external {
    delegates[msg.sender] = delegatee;
    emit Delegate(msg.sender, delegatee);
  }
}