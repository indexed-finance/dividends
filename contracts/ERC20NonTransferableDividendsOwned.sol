// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./base/ERC20NonTransferableDividends.sol";
import "./libraries/TransferHelper.sol";


contract ERC20NonTransferableDividendsOwned is ERC20NonTransferableDividends, Ownable {
  using TransferHelper for address;

  address public immutable token;

  constructor(
    address token_,
    string memory name_,
    string memory symbol_
  ) ERC20NonTransferableDividends(name_, symbol_) Ownable() {
    token = token_;
  }

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external onlyOwner {
    _burn(from, amount);
  }

  function collectFor(address account) public {
    uint256 amount = _prepareCollect(account);
    token.safeTransfer(account, amount);
  }

  function collect() external {
    collectFor(msg.sender);
  }

  function distribute(uint256 amount) external {
    token.safeTransferFrom(msg.sender, address(this), amount);
    _distributeDividends(amount);
  }
}