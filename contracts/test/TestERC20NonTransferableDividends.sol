// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../ERC20NonTransferableDividendsOwned.sol";


contract TestERC20NonTransferableDividends is ERC20NonTransferableDividendsOwned {
  constructor() ERC20NonTransferableDividendsOwned(address(0), "ERC20Dividends", "DIV") {}

  function mint(address account, uint256 amount) external override {
    _mint(account, amount);
  }

  function burn(address account, uint256 amount) external override {
    _burn(account, amount);
  }

  function distributeDividends(uint256 amount) external {
    _distributeDividends(amount);
  }

  function getPointsCorrection(address account) external view returns (int256) {
    return pointsCorrection[account];
  }

  function getWithdrawnDividends(address account) external view returns (uint256) {
    return withdrawnDividendsOf(account);
  }

  function prepareCollect(address account) external returns (uint256) {
    return _prepareCollect(account);
  }
}