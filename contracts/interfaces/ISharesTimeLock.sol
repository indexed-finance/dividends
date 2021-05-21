// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
import "./IDelegationModule.sol";


interface ISharesTimeLock is IDelegationModule {
  event LockCreated(
    uint256 indexed lockId,
    address indexed account,
    uint256 amountLocked,
    uint32 duration
  );

  event LockDestroyed(
    uint256 indexed lockId,
    address indexed account,
    uint256 amount
  );

  event MinimumDepositSet(uint256 minimumDeposit);

  event FeesReceived(uint256 amount);

  event FeesDistributed(uint256 amount);

  /**
   * @dev Struct for token locks.
   * @param amount Amount of tokens deposited.
   * @param lockedAt Timestamp the lock was created at.
   * @param lockDuration Duration of lock in seconds.
   * @param owner Account that made the deposit.
   */
  struct Lock {
    uint256 amount;
    uint32 lockedAt;
    uint32 lockDuration;
    address owner;
  }

  function emergencyUnlockTriggered() external view returns (bool);

  function dividendsToken() external view returns (address);

  function minLockDuration() external view returns (uint32);

  function maxLockDuration() external view returns (uint32);

  function minEarlyWithdrawalFee() external view returns (uint256);

  function baseEarlyWithdrawalFee() external view returns (uint256);

  function maxDividendsBonusMultiplier() external view returns (uint256);

  function locks(uint256) external view returns (uint256 amount, uint32 lockedAt, uint32 lockDuration, address owner);
  
  function minimumDeposit() external view returns (uint256);

  function pendingFees() external view returns (uint256);

  function getLocksLength() external view returns (uint256);

  function setMinimumDeposit(uint256 minimumDeposit_) external;

  function getDividendsMultiplier(uint256 duration) external view returns (uint256 multiplier);

  function getWithdrawalParameters(
    uint256 amount,
    uint256 lockedAt,
    uint256 lockDuration
  )
    external
    view
    returns (uint256 dividendShares, uint256 earlyWithdrawalFee);

  function triggerEmergencyUnlock() external;

  function distributeFees() external;

  function deposit(uint256 amount, uint32 duration) external;

  function delegate(address delegatee) external;

  function withdraw(uint256 lockId) external;
}