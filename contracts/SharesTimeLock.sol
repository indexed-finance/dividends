// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20NonTransferableDividendsOwned.sol";
import "./libraries/LowGasSafeMath.sol";


contract SharesTimeLock is Ownable() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

  address public immutable depositToken;

  ERC20NonTransferableDividendsOwned public immutable dividendsToken;

  uint32 public immutable minLockDuration;

  uint32 public immutable maxLockDuration;

  // /**
  //  * @dev Maximum early withdrawal fee expressed as a fraction of 1e18.
  //  * This is the fee paid if tokens are withdrawn immediately after being locked.
  //  */
  // uint256 public immutable maxEarlyWithdrawalFee;

  /**
   * @dev Maximum dividends multiplier for a lock duration of `maxLockDuration`
   */
  uint256 public immutable maxDividendsBonusMultiplier;

  struct Lock {
    uint256 amount;
    uint32 lockedAt;
    uint32 lockDuration;
    address owner;
  }

  Lock[] public locks;

  function getLocksLength() external view returns (uint256) {
    return locks.length;
  }

  // /**
  //  * @dev Returns the fee that will be paid on a deposit of `amount` which was deposited
  //  * at `lockedAt` with a timelock of `lockDuration`, if it is withdrawn now.
  //  *
  //  * The fractional fee is calculated as the time remaining in the timelock divided by the
  //  * duration of the lock, multiplied by the maximum early withdrawal fee.
  //  */
  // function getEarlyWithdrawalFee(uint256 amount, uint32 lockedAt, uint32 lockDuration) public view returns (uint256 fee) {
  //   uint32 unlockAt = lockedAt + lockDuration;
  //   if (block.timestamp >= unlockAt) return 0;
  //   uint32 timeRemaining = unlockAt - uint32(block.timestamp);
  //   return amount.mul(timeRemaining).mul(maxEarlyWithdrawalFee) / (uint256(lockDuration) * 1e18);
  // }

  /**
   * @dev Returns the dividends multiplier for `duration` expressed as a fraction of 1e18.
   */
  function getDividendsMultiplier(uint32 duration) public view returns (uint256 multiplier) {
    require(duration >= minLockDuration && duration <= maxLockDuration, "OOB");
    uint256 durationRange = maxLockDuration - minLockDuration;
    uint32 overMinimum = duration - minLockDuration;
    return uint256(1e18).add(
      maxDividendsBonusMultiplier.mul(overMinimum) / durationRange
    );
  }

  constructor(
    address depositToken_,
    ERC20NonTransferableDividendsOwned dividendsToken_,
    uint32 minLockDuration_,
    uint32 maxLockDuration_,
    uint256 maxDividendsBonusMultiplier_
  ) payable {
    dividendsToken = dividendsToken_;
    depositToken = depositToken_;
    require(minLockDuration_ < maxLockDuration_, "min>=max");
    minLockDuration = minLockDuration_;
    maxLockDuration = maxLockDuration_;
    maxDividendsBonusMultiplier = maxDividendsBonusMultiplier_;
  }

  // function withdrawFees(address to) external onlyOwner {
  //   depositToken.safeTransfer(to, IERC20(depositToken).balanceOf(address(this)));
  // }

  function deposit(uint256 amount, uint32 duration) external {
    depositToken.safeTransferFrom(msg.sender, address(this), amount);
    uint256 multiplier = getDividendsMultiplier(duration);
    uint256 dividendShares = amount.mul(multiplier) / 1e18;
    dividendsToken.mint(msg.sender, dividendShares);
    locks.push(Lock({
      amount: amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: duration,
      owner: msg.sender
    }));
  }

  function withdraw(uint256 lockId) external {
    Lock memory lock = locks[lockId];
    require(msg.sender == lock.owner, "!owner");
    require(block.timestamp > lock.lockedAt + lock.lockDuration, "lock not expired");
    delete locks[lockId];
    uint256 multiplier = getDividendsMultiplier(lock.lockDuration);
    uint256 dividendShares = lock.amount.mul(multiplier) / 1e18;
    dividendsToken.burn(msg.sender, dividendShares);
      
    depositToken.safeTransfer(msg.sender, lock.amount);
  }

  // Eject expired locks
  function eject(uint256[] memory lockIds) external {
    for(uint256 i = 0; i < lockIds.length; i ++) {
      Lock memory lock = locks[lockIds[i]];
      //skip if lock not expired or locked amount is zero
      if(lock.lockedAt + lock.lockDuration < block.timestamp || lock.amount == 0) {
        continue;
      }

      delete locks[lockIds[i]];
      uint256 multiplier = getDividendsMultiplier(lock.lockDuration);
      uint256 dividendShares = lock.amount.mul(multiplier) / 1e18;
      dividendsToken.burn(lock.owner, dividendShares);

      depositToken.safeTransfer(lock.owner, lock.amount);
    }
  }
}