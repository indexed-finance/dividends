// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/SafeCast.sol";
import "../interfaces/IAbstractDividends.sol";

/**
 * @dev Many functions in this contract were taken from this repository:
 * https://github.com/atpar/funds-distribution-token/blob/master/contracts/FundsDistributionToken.sol
 * which is an example implementation of ERC 2222, the draft for which can be found at
 * https://github.com/atpar/funds-distribution-token/blob/master/EIP-DRAFT.md
 *
 * This contract has been substantially modified from the original and does not comply with ERC 2222.
 * Many functions were renamed as "dividends" rather than "funds" and the core functionality was separated
 * into this abstract contract which can be inherited by anything tracking ownership of dividend shares.
 */
abstract contract AbstractDividends is IAbstractDividends {
  using LowGasSafeMath for uint256;
  using SafeCast for uint128;
  using SafeCast for uint256;
  using SafeCast for int256;
  using SignedSafeMath for int256;

/* ========  Constants  ======== */
  uint128 internal constant POINTS_MULTIPLIER = type(uint128).max;

/* ========  Internal Function References  ======== */
  function(address) view returns (uint256) private immutable getSharesOf;
  function() view returns (uint256) private immutable getTotalShares;

/* ========  Storage  ======== */
  uint256 public pointsPerShare;
  mapping(address => int256) internal pointsCorrection;
  mapping(address => uint256) private withdrawnDividends;

  constructor(
    function(address) view returns (uint256) getSharesOf_,
    function() view returns (uint256) getTotalShares_
  ) {
    getSharesOf = getSharesOf_;
    getTotalShares = getTotalShares_;
  }

/* ========  Public View Functions  ======== */
  /**
   * @dev Returns the total amount of dividends a given address is able to withdraw.
   * @param account Address of a dividend recipient
   * @return A uint256 representing the dividends `account` can withdraw
   */
  function withdrawableDividendsOf(address account) public view override returns (uint256) {
    return cumulativeDividendsOf(account).sub(withdrawnDividends[account]);
  }

  /**
   * @notice View the amount of dividends that an address has withdrawn.
   * @param account The address of a token holder.
   * @return The amount of dividends that `account` has withdrawn.
   */
  function withdrawnDividendsOf(address account) public view override returns (uint256) {
    return withdrawnDividends[account];
  }

  /**
   * @notice View the amount of dividends that an address has earned in total.
   * @dev accumulativeFundsOf(account) = withdrawableDividendsOf(account) + withdrawnDividendsOf(account)
   * = (pointsPerShare * balanceOf(account) + pointsCorrection[account]) / POINTS_MULTIPLIER
   * @param account The address of a token holder.
   * @return The amount of dividends that `account` has earned in total.
   */
  function cumulativeDividendsOf(address account) public view override returns (uint256) {
    return pointsPerShare
      .mul(getSharesOf(account))
      .toInt256()
      .add(pointsCorrection[account])
      .toUint256() / POINTS_MULTIPLIER;
  }

/* ========  Dividend Utility Functions  ======== */

  /** 
   * @notice Distributes dividends to token holders.
   * @dev It reverts if the total supply is 0.
   * It emits the `FundsDistributed` event if the amount to distribute is greater than 0.
   * About undistributed dividends:
   *   In each distribution, there is a small amount which does not get distributed,
   *   which is `(amount * POINTS_MULTIPLIER) % totalShares()`.
   *   With a well-chosen `POINTS_MULTIPLIER`, the amount of funds that are not getting
   *   distributed in a distribution can be less than 1 (base unit).
   */
  function _distributeDividends(uint256 amount) internal {
    uint256 shares = getTotalShares();
    require(shares > 0, "SHARES");

    if (amount > 0) {
      pointsPerShare = pointsPerShare.add(
        amount.mul(POINTS_MULTIPLIER) / shares
      );
      emit DividendsDistributed(msg.sender, amount);
    }
  }

  /**
   * @notice Prepares collection of owed dividends
   * @dev It emits a `DividendsWithdrawn` event if the amount of withdrawn dividends is
   * greater than 0.
   */
  function _prepareCollect(address account) internal returns (uint256) {
    uint256 _withdrawableDividend = withdrawableDividendsOf(account);
    if (_withdrawableDividend > 0) {
      withdrawnDividends[account] = withdrawnDividends[account].add(_withdrawableDividend);
      emit DividendsWithdrawn(account, _withdrawableDividend);
    }
    return _withdrawableDividend;
  }

  function _correctPointsForTransfer(address from, address to, uint256 shares) internal {
    int256 _magCorrection = pointsPerShare.mul(shares).toInt256();
    pointsCorrection[from] = pointsCorrection[from].add(_magCorrection);
    pointsCorrection[to] = pointsCorrection[to].sub(_magCorrection);
  }

  /**
   * @dev Increases or decreases the points correction for `account` by
   * `shares*pointsPerShare`.
   */
  function _correctPoints(address account, int256 shares) internal {
    pointsCorrection[account] = pointsCorrection[account]
      .add(shares.mul(int256(pointsPerShare)));
  }
}