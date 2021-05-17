// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./ERC20NonTransferableRewardsOwned.sol";
import "./libraries/LowGasSafeMath.sol";
import "hardhat/console.sol";


contract SharesTimeLock is Ownable() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

  address public depositToken;

  ERC20NonTransferableRewardsOwned public rewardsToken;

  // min amount in 
  uint32 public minLockDuration;

  uint32 public maxLockDuration;

  uint256 public minLockAmount;

  uint256 private constant avgSecondsMonth = 2628000;

  /*
    Mapping of coefficient for the staking curve
    y=x/k*log(x)
    where `x` is the staking time
    and `k` is a constant 56.0268900276223
    the period of staking here is calculated in months.
   */
  uint256[37] private maxRatioArray = [
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

  event MinLockAmountChanged(uint256 newLockAmount);
  event Deposited(uint256 amount, uint32 lockDuration, address indexed owner);
  event Withdrawn(uint256 amount, address indexed owner);
  event Ejected(uint256 amount, address indexed owner);
  event BoostedToMax(uint256 amount, address indexed owner);

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

  /**
   * @dev Returns the rewards multiplier for `duration` expressed as a fraction of 1e18.
   */
  function getRewardsMultiplier(uint32 duration) public view returns (uint256 multiplier) {
    require(duration >= minLockDuration && duration <= maxLockDuration, "getRewardsMultiplier: Duration not correct");
    uint256 month = uint256(duration) / avgSecondsMonth;
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
  }

  function depositByMonths(uint256 amount, uint256 _months, address receiver) external {
    //require(_months > 5 && _months <= 36, 'Wrong duration');
    uint32 duration = uint32( _months.mul(avgSecondsMonth) );
    deposit(amount, duration, receiver);
  }

  function deposit(uint256 amount, uint32 duration, address receiver) internal {
    require(amount >= minLockAmount, "Deposit: amount too small");
    depositToken.safeTransferFrom(msg.sender, address(this), amount);
    uint256 multiplier = getRewardsMultiplier(duration);
    uint256 rewardShares = amount.mul(multiplier) / 1e18;
    rewardsToken.mint(receiver, rewardShares);
    locks.push(Lock({
      amount: amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: duration,
      owner: receiver
    }));
    emit Deposited(amount, duration, receiver);
  }

  function withdraw(uint256 lockId) external {
    Lock memory lock = locks[lockId];
    require(msg.sender == lock.owner, "!owner");
    require(block.timestamp > lock.lockedAt + lock.lockDuration, "lock not expired");
    delete locks[lockId];
    uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
    uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
    rewardsToken.burn(msg.sender, rewardShares);
      
    depositToken.safeTransfer(msg.sender, lock.amount);
    emit Withdrawn(lock.amount, msg.sender);
  }

  function boostToMax(uint256 lockId) external {
    Lock memory lock = locks[lockId];
    require(msg.sender == lock.owner, "!owner");

    delete locks[lockId];
    uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
    uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
    require(rewardsToken.balanceOf(lock.owner) >= rewardShares, "boostToMax: Wrong shares number");

    uint256 newMultiplier = getRewardsMultiplier(maxLockDuration);
    uint256 newRewardShares = lock.amount.mul(newMultiplier) / 1e18;
    rewardsToken.mint(msg.sender, newRewardShares.sub(rewardShares));
    locks.push(Lock({
      amount: lock.amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: maxLockDuration,
      owner: msg.sender
    }));

    emit BoostedToMax(lock.amount, msg.sender);
  }

  // Eject expired locks
  function eject(uint256[] memory lockIds) external {
    
    for(uint256 i = 0; i < lockIds.length; i ++) {
      Lock memory lock = locks[lockIds[i]];
      //skip if lock not expired or locked amount is zero
      if(lock.lockedAt + lock.lockDuration > block.timestamp || lock.amount == 0) {
        continue;
      }

      delete locks[lockIds[i]];
      uint256 multiplier = getRewardsMultiplier(lock.lockDuration);
      uint256 rewardShares = lock.amount.mul(multiplier) / 1e18;
      rewardsToken.burn(lock.owner, rewardShares);

      depositToken.safeTransfer(lock.owner, lock.amount);

      emit Ejected(lock.amount, lock.owner);
    }
  }

  /**
  * Setters
  */
  function setMinLockAmount(uint256 minLockAmount_) external onlyOwner {
    minLockAmount = minLockAmount_;
    emit MinLockAmountChanged(minLockAmount_);
  }
}