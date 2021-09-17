// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../base/ERC20VotesComp.sol";
import "../libraries/TransferHelper.sol";


contract TestERC20 is ERC20VotesComp {
  using TransferHelper for address;

  event Delegate(address indexed delegator, address indexed delegatee);

  constructor(string memory name_, string memory symbol_) ERC20VotesComp(name_, symbol_) {}

  function mint(address account, uint256 amount) external {
    _mint(account, amount);
  }

  function burn(address account, uint256 amount) public {
    _burn(account, amount);
  }

  function transferInternal(address from, address to, uint96 value) public {
    _transfer(from, to, value);
  }

  function deposit() external payable {
    _mint(msg.sender, msg.value);
  }

  function withdraw(uint256 amount) external {
    _burn(msg.sender, amount);
    address(msg.sender).safeTransferETH(amount);
  }
}