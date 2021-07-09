// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./ERC20NonTransferableRewardsOwned.sol";
import "./libraries/LowGasSafeMath.sol";

contract SharesTimeLock is Ownable() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

  address public depositToken;

  ERC20NonTransferableRewardsOwned public rewardsToken;

  // min amount in 
  uint32 public minLockDuration;

  uint32 public maxLockDuration;

  uint256 public minLockAmount;

  uint256 private constant AVG_SECONDS_MONTH = 2628000;

  bool public emergencyUnlockTriggered;

  /*
    Mapping of coefficient for the staking curve
    y=x/k*log(x)
    where `x` is the staking time
    and `k` is a constant 56.0268900276223
    the period of staking here is calculated in months.
   */
  uint256[37] public maxRatioArray;

  event MinLockAmountChanged(uint256 newLockAmount);
  event WhitelistedChanged(address indexed user, bool indexed whitelisted);
  event Deposited(uint256 indexed lockId, uint256 amount, uint32 lockDuration, address indexed owner);
  event Withdrawn(uint256 indexed lockId, uint256 amount, address indexed owner);
  event Ejected(uint256 indexed lockId, uint256 amount, address indexed owner);
  event BoostedToMax(uint256 indexed oldLockId, uint256 indexed newLockId, uint256 amount, address indexed owner);

  struct Lock {
    uint256 amount;
    uint32 lockedAt;
    uint32 lockDuration;
  }

  struct StakingData {
    uint256 totalStaked;
    uint256 veTokenTotalSupply;
    uint256 accountVeTokenBalance;
    uint256 accountWithdrawableRewards;
    uint256 accountWithdrawnRewards;
    uint256 accountDepositTokenBalance;
    uint256 accountDepositTokenAllowance;
    Lock[] accountLocks;
  }

  mapping(address => Lock[]) public locksOf;

  mapping(address => bool) public whitelisted;


  function getLocksOfLength(address account) external view returns (uint256) {
    return locksOf[account].length;
  }

  /**
   * @dev Returns the rewards multiplier for `duration` expressed as a fraction of 1e18.
   */
  function getRewardsMultiplier(uint32 duration) public view returns (uint256 multiplier) {
    require(duration >= minLockDuration && duration <= maxLockDuration, "getRewardsMultiplier: Duration not correct");
    uint256 month = uint256(duration) / secondsPerMonth();
    multiplier = maxRatioArray[month];
    return multiplier;
  }

  function initialize(
    address depositToken_,
    ERC20NonTransferableRewardsOwned rewardsToken_,
    uint32 minLockDuration_,
    uint32 maxLockDuration_,
    uint256 minLockAmount_
  ) public {
    __Ownable_init();
    
    rewardsToken = rewardsToken_;
    depositToken = depositToken_;
    require(minLockDuration_ < maxLockDuration_, "min>=max");
    minLockDuration = minLockDuration_;
    maxLockDuration = maxLockDuration_;
    minLockAmount = minLockAmount_;

    maxRatioArray = [
      1,
      2,
      3,
      4,
      5,
      6,
      83333333333300000, // 6 
      105586554548800000, // 7 
      128950935744800000, // 8
      153286798191400000, // 9
      178485723463700000, // 10
      204461099502300000, // 11
      231142134539100000, // 12
      258469880674300000, // 13
      286394488282000000, // 14
      314873248847800000, // 15
      343869161986300000, // 16
      373349862059400000, // 17
      403286798191400000, // 18
      433654597035900000, // 19
      464430560048100000, // 20
      495594261536300000, // 21
      527127223437300000, // 22
      559012649336100000, // 23
      591235204823000000, // 24
      623780834516600000, // 25
      656636608405400000, // 26
      689790591861100000, // 27
      723231734933100000, // 28
      756949777475800000, // 29
      790935167376600000, // 30
      825178989697100000, // 31
      859672904965600000, // 32
      894409095191000000, // 33
      929380216424000000, // 34
      964579356905500000, // 35
      1000000000000000000 // 36
    ];
  }

  function depositByMonths(uint256 amount, uint256 months, address receiver) external {
    // only allow whitelisted contracts or EOAS
    require(
      tx.origin == _msgSender() || whitelisted[_msgSender()],
      "Not EOA or whitelisted"
    );
    // only allow whitelisted addresses to deposit to another address
    require(
      _msgSender() == receiver || whitelisted[_msgSender()],
      "Only whitelised address can deposit to another address"
    );
    uint32 duration = uint32( months.mul(secondsPerMonth()) );
    deposit(amount, duration, receiver);
  }

  function deposit(uint256 amount, uint32 duration, address receiver) internal {
    require(amount >= minLockAmount, "Deposit: amount too small");
    require(!emergencyUnlockTriggered, "Deposit: deposits locked");
    depositToken.safeTransferFrom(_msgSender(), address(this), amount);
    uint256 multiplier = getRewardsMultiplier(duration);
    uint256 rewardShares = amount.mul(multiplier) / 1e18;
    rewardsToken.mint(receiver, rewardShares);
    locksOf[receiver].push(Lock({
      amount: amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: duration
    }));
    emit Deposited(locksOf[receiver].length - 1, amount, duration, receiver);
  }

  function withdraw(uint256 lockId) external {
    Lock memory lock = locksOf[_msgSender()][lockId];
    uint256 unlockAt = lock.lockedAt + lock.lockDuration;
    require(block.timestamp > unlockAt || emergencyUnlockTriggered, "Withdraw: lock not expired and timelock not in emergency mode");
    delete locksOf[_msgSender()][lockId];
    uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
    uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
    rewardsToken.burn(_msgSender(), rewardShares);
    
    depositToken.safeTransfer(_msgSender(), lock.amount);
    emit Withdrawn(lockId, lock.amount, _msgSender());
  }

  function boostToMax(uint256 lockId) external {
    require(!emergencyUnlockTriggered, "BoostToMax: emergency unlock triggered");
    
    Lock memory lock = locksOf[_msgSender()][lockId];
    delete locksOf[_msgSender()][lockId];
    uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
    uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
    require(rewardsToken.balanceOf(_msgSender()) >= rewardShares, "boostToMax: Wrong shares number");

    uint256 newMultiplier = getRewardsMultiplier(maxLockDuration);
    uint256 newRewardShares = lock.amount.mul(newMultiplier) / 1e18;
    rewardsToken.mint(_msgSender(), newRewardShares.sub(rewardShares));
    locksOf[_msgSender()].push(Lock({
      amount: lock.amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: maxLockDuration
    }));

    emit BoostedToMax(lockId, locksOf[_msgSender()].length - 1, lock.amount, _msgSender());
  }

  // Eject expired locks
  function eject(address[] memory lockAccounts, uint256[] memory lockIds) external {
    require(lockAccounts.length == lockIds.length, "Array length mismatch");
  
    for(uint256 i = 0; i < lockIds.length; i ++) {
      //skip if lockId is invalid
      if(locksOf[lockAccounts[i]].length - 1 < lockIds[i]) {
        continue;
      }

      Lock memory lock = locksOf[lockAccounts[i]][lockIds[i]];
      //skip if lock not expired or locked amount is zero
      if(lock.lockedAt + lock.lockDuration > block.timestamp || lock.amount == 0) {
        continue;
      }

      delete locksOf[lockAccounts[i]][lockIds[i]];
      uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
      uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
      rewardsToken.burn(lockAccounts[i], rewardShares);

      depositToken.safeTransfer(lockAccounts[i], lock.amount);

      emit Ejected(lockIds[i], lock.amount, lockAccounts[i]);
    }
  }

  /**
  * Setters
  */
  function setMinLockAmount(uint256 minLockAmount_) external onlyOwner {
    minLockAmount = minLockAmount_;
    emit MinLockAmountChanged(minLockAmount_);
  }

  function setWhitelisted(address user, bool isWhitelisted) external onlyOwner {
    whitelisted[user] = isWhitelisted;
    emit WhitelistedChanged(user, isWhitelisted);
  }

  function triggerEmergencyUnlock() external onlyOwner {
    require(!emergencyUnlockTriggered, "TriggerEmergencyUnlock: already triggered");
    emergencyUnlockTriggered = true;
  }

  /**
  * Getters
  */

  function getStakingData(address account) external view returns (StakingData memory data) {
    data.totalStaked = IERC20(depositToken).balanceOf(address(this));
    data.veTokenTotalSupply = rewardsToken.totalSupply();
    data.accountVeTokenBalance = rewardsToken.balanceOf(account);
    data.accountWithdrawableRewards = rewardsToken.withdrawableRewardsOf(account);
    data.accountWithdrawnRewards = rewardsToken.withdrawnRewardsOf(account);
    data.accountDepositTokenBalance = IERC20(depositToken).balanceOf(account);
    data.accountDepositTokenAllowance = IERC20(depositToken).allowance(account, address(this));

    data.accountLocks = new Lock[](locksOf[account].length);

    for(uint256 i = 0; i < locksOf[account].length; i ++) {
      data.accountLocks[i] = locksOf[account][i];
    }
  }

  // Used to overwrite in testing situations
  function secondsPerMonth() internal view virtual returns(uint256) {
    return AVG_SECONDS_MONTH;
  }

  function canEject(address account, uint256 lockId) public view returns(bool) {

    //cannot eject non existing locks
    if(locksOf[account].length - 1 < lockId) {
      return false;
    }

    Lock memory lock = locksOf[account][lockId];

    // if lock is already removed it cannot be ejected
    if(lock.lockedAt == 0) {
      return false;
    }

    return lock.lockedAt + lock.lockDuration <= block.timestamp;
  }
}