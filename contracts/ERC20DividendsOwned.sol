// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./base/ERC20Dividends.sol";
import "./libraries/TransferHelper.sol";
import "./interfaces/IWETH.sol";


contract ERC20DividendsOwned is ERC20Dividends, Ownable {
  using TransferHelper for address;

  address public immutable weth;

  receive() external payable { return; }

  constructor(
    address weth_,
    string memory name_,
    string memory symbol_
  ) ERC20Dividends(name_, symbol_) Ownable() {
    weth = weth_;
  }

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external onlyOwner {
    _burn(from, amount);
  }

  function collect() external {
    uint256 amount = _prepareCollect(msg.sender);
    weth.safeTransfer(msg.sender, amount);
  }

  function collectETH() external {
    uint256 amount = _prepareCollect(msg.sender);
    IWETH(weth).withdraw(amount);
    address(msg.sender).safeTransferETH(amount);
  }

  function distribute(uint256 amount) external {
    weth.safeTransferFrom(msg.sender, address(this), amount);
    _distributeDividends(amount);
  }

  function distribute() external payable {
    IWETH(weth).deposit{value: msg.value}();
    _distributeDividends(msg.value);
  }
}