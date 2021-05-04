// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../ERC20NonTransferableRewardsOwned.sol";


contract TestERC20NonTransferableRewards is ERC20NonTransferableRewardsOwned {
  constructor() ERC20NonTransferableRewardsOwned(address(0), "ERC20Rewards", "DIV") {}

  function mint(address account, uint256 amount) external override {
    _mint(account, amount);
  }

  function burn(address account, uint256 amount) external override {
    _burn(account, amount);
  }

  function distributeRewards(uint256 amount) external {
    _distributeRewards(amount);
  }

  function getPointsCorrection(address account) external view returns (int256) {
    return pointsCorrection[account];
  }

  function getWithdrawnRewards(address account) external view returns (uint256) {
    return withdrawnRewardsOf(account);
  }

  function prepareCollect(address account) external returns (uint256) {
    return _prepareCollect(account);
  }
}