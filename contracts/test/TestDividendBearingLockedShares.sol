// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../DividendBearingLockedShares.sol";
import "../libraries/TransferHelper.sol";


contract TestDividendBearingLockedShares is DividendBearingLockedShares {
  using TransferHelper for address;

  // address public immutable sharesToken;
  // address public immutable dividendsToken;

  constructor(
    // address sharesToken_,
    // address dividendsToken_,
    uint32 lockDuration_,
    uint24 earlyWithdrawalFeeBips_
  ) DividendBearingLockedShares(
    "DividendBearingLockedShares",
    "SHR",
    lockDuration_,
    earlyWithdrawalFeeBips_
  ) {
    // sharesToken = sharesToken_;
    // dividendsToken = dividendsToken_;
  }

  function deposit(uint128 amount) external returns (uint256 tokenId) {
    return _deposit(msg.sender, amount);
  }

  function withdraw(uint256 tokenId) external returns (uint256 amount) {
    amount = _burn(tokenId);
    // sharesToken.safeTransfer(msg.sender, amount);
  }

  function collect() external returns (uint256 amount) {
    amount = _prepareCollect(msg.sender);
    // dividendsToken.safeTransfer(msg.sender, amount);
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
}