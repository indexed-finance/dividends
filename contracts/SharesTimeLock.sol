// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./base/DelegationModule.sol";
import "./libraries/LowGasSafeMath.sol";
import "./interfaces/ISharesTimeLock.sol";


contract SharesTimeLock is ISharesTimeLock, DelegationModule, Ownable() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/** ========== Constants ==========  */

  /**
   * @dev Token used for dividend payments and given to users for deposits.
   * Must be an ERC20DividendsOwned with this contract set as the owner.
   */
  address public immutable override dividendsToken;

  /**
   * @dev Minimum number of seconds shares can be locked for.
   */
  uint32 public immutable override minLockDuration;

  /**
   * @dev Maximum number of seconds shares can be locked for.
   */
  uint32 public immutable override maxLockDuration;

  /**
   * @dev Minimum early withdrawal fee added to every dynamic withdrawal fee.
   */
  uint256 public immutable override minEarlyWithdrawalFee;

  /**
   * @dev Base early withdrawal fee expressed as a fraction of 1e18.
   * This is the fee paid if tokens are withdrawn immediately after being locked.
   * It is multiplied by the dividend multiplier, and added to the minimum early withdrawal fee.
   */
  uint256 public immutable override baseEarlyWithdrawalFee;

  /**
   * @dev Maximum dividends multiplier for a lock duration of `maxLockDuration`
   */
  uint256 public immutable override maxDividendsBonusMultiplier;

/** ========== Storage ==========  */

  /**
   * @dev Array of token locks.
   */
  Lock[] public override locks;
  /**
   * @dev Minimum amount of tokens that can be deposited.
   * If zero, there is no minimum.
   */
  uint256 public override minimumDeposit;
  /**
   * @dev Accumulated early withdrawal fees.
   */
  uint256 public override pendingFees;

/** ========== Queries ==========  */

  /**
   * @dev Returns the number of locks that have been created.
   */
  function getLocksLength() external view override returns (uint256) {
    return locks.length;
  }

  /**
   * @dev Returns the dividends multiplier for `duration` expressed as a fraction of 1e18.
   */
  function getDividendsMultiplier(uint256 duration) public view override returns (uint256 multiplier) {
    require(duration >= minLockDuration && duration <= maxLockDuration, "OOB");
    uint256 durationRange = maxLockDuration - minLockDuration;
    uint256 overMinimum = duration - minLockDuration;
    return uint256(1e18).add(
      maxDividendsBonusMultiplier.mul(overMinimum) / durationRange
    );
  }

  /**
   * @dev Returns the withdrawal fee and withdrawable shares for a withdrawal of a
   * lock created at `lockedAt` with a duration of `lockDuration`, if it was withdrawan
   * now.
   *
   * The early withdrawal fee is 0 if the full duration has passed; otherwise, it is
   * calculated as the fraction of the total duration that has not elapsed, multiplied by
   * the maximum base withdrawal fee and the dividends multiplier, plus the minimum
   * withdrawal fee.
   */
  function getWithdrawalParameters(
    uint256 amount,
    uint256 lockedAt,
    uint256 lockDuration
  )
    public
    view
    override
    returns (uint256 dividendShares, uint256 earlyWithdrawalFee)
  {
    uint256 multiplier = getDividendsMultiplier(lockDuration);
    dividendShares = amount.mul(multiplier) / uint256(1e18);
    uint256 unlockAt = lockedAt + lockDuration;
    if (block.timestamp >= unlockAt) {
      earlyWithdrawalFee = 0;
    } else {
      uint256 timeRemaining = unlockAt - block.timestamp;
      uint256 minimumFee = amount.mul(minEarlyWithdrawalFee) / uint256(1e18);
      uint256 dynamicFee = amount.mul(
        baseEarlyWithdrawalFee.mul(timeRemaining).mul(multiplier)
      ) / uint256(1e36 * lockDuration);
      earlyWithdrawalFee = minimumFee.add(dynamicFee);
    }
  }

  /**
   * @dev Distributes the accumulated early withdrawal fees through the dividends token.
   */
  function distributeFees() external override {
    uint256 amount = pendingFees;
    require(amount > 0, "ZF");
    pendingFees = 0;
    IERC20(depositToken).approve(dividendsToken, amount);
    IERC20DividendsOwned(dividendsToken).distribute(amount);
    emit FeesDistributed(amount);
  }

  constructor(
    address depositToken_,
    address dividendsToken_,
    uint32 minLockDuration_,
    uint32 maxLockDuration_,
    uint256 minEarlyWithdrawalFee_,
    uint256 baseEarlyWithdrawalFee_,
    uint256 maxDividendsBonusMultiplier_
  ) payable DelegationModule(depositToken_) {
    dividendsToken = dividendsToken_;
    require(minLockDuration_ < maxLockDuration_, "min>=max");
    require(
      minEarlyWithdrawalFee_.add(baseEarlyWithdrawalFee_.mul(maxDividendsBonusMultiplier_)) <= 1e36,
      "maxFee"
    );
    minLockDuration = minLockDuration_;
    maxLockDuration = maxLockDuration_;
    maxDividendsBonusMultiplier = maxDividendsBonusMultiplier_;
    minEarlyWithdrawalFee = minEarlyWithdrawalFee_;
    baseEarlyWithdrawalFee = baseEarlyWithdrawalFee_;
  }

  /**
   * @dev Set the minimum deposit to `minimumDeposit_`. If it is 0, there will be no minimum.
   */
  function setMinimumDeposit(uint256 minimumDeposit_) external override onlyOwner {
    minimumDeposit = minimumDeposit_;
    emit MinimumDepositSet(minimumDeposit_);
  }

  /**
   * @dev Lock `amount` of `depositToken` for `duration` seconds.
   *
   * Mints an amount of dividend tokens equal to the amount of tokens locked
   * times 1 + (duration-minDuration) / (maxDuration - minDuration).
   *
   * Uses transferFrom - caller must have approved the contract to spend `amount`
   * of `depositToken`.
   */
  function deposit(uint256 amount, uint32 duration) external override {
    require(amount >= minimumDeposit, "min deposit");
    _depositToModule(msg.sender, amount);
    uint256 multiplier = getDividendsMultiplier(duration);
    uint256 dividendShares = amount.mul(multiplier) / 1e18;
    IERC20DividendsOwned(dividendsToken).mint(msg.sender, dividendShares);
    locks.push(Lock({
      amount: amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: duration,
      owner: msg.sender
    }));
    emit LockCreated(
      locks.length - 1,
      msg.sender,
      amount,
      duration
    );
  }

  /**
   * @dev Delegate all voting shares the caller has in its sub-delegation module
   * to `delegatee`.
   * Note: This will revert if the sub-delegation module does not exist.
   */
  function delegate(address delegatee) external override {
    _delegateFromModule(msg.sender, delegatee);
  }

  /**
   * @dev Withdraw the tokens locked in `lockId`.
   * The caller will incur an early withdrawal fee if the lock duration has not elapsed.
   * All of the dividend tokens received when the lock was created will be burned from the
   * caller's account.
   * This can only be executed by the lock owner.
   */
  function withdraw(uint256 lockId) external override {
    Lock memory lock = locks[lockId];
    require(msg.sender == lock.owner, "!owner");
    delete locks[lockId];
    (uint256 dividendShares, uint256 earlyWithdrawalFee) = getWithdrawalParameters(
      lock.amount,
      uint256(lock.lockedAt),
      uint256(lock.lockDuration)
    );
    uint256 owed = lock.amount.sub(earlyWithdrawalFee);

    IERC20DividendsOwned(dividendsToken).burn(msg.sender, dividendShares);
    if (earlyWithdrawalFee > 0) {
      _withdrawFromModule(msg.sender, address(this), lock.amount);
      depositToken.safeTransfer(msg.sender, owed);
      pendingFees = pendingFees.add(earlyWithdrawalFee);
      emit FeesReceived(earlyWithdrawalFee);
    } else {
      _withdrawFromModule(msg.sender, msg.sender, lock.amount);
    }
    emit LockDestroyed(lockId, msg.sender, owed);
  }
}


interface IERC20DividendsOwned {
  function mint(address to, uint256 amount) external;
  function burn(address from, uint256 amount) external;
  function distribute(uint256 amount) external;
}