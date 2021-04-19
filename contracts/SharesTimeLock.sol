// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20NonTransferableDividendsOwned.sol";
import "./libraries/LowGasSafeMath.sol";
import "hardhat/console.sol";


contract SharesTimeLock is Ownable() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

  address public immutable depositToken;

  ERC20NonTransferableDividendsOwned public immutable dividendsToken;

  uint32 public immutable minLockDuration;

  uint32 public immutable maxLockDuration;

  uint256 public minLockAmount;

  //Weird stuff
  uint256 private constant avgSecondsMonth = 2628000;
  uint256[8] private maxRatioArray = [
    1,
    2,
    3,
    4,
    5,
    6,
    83333333333300000,
    105586554548800000
  ];

  event MinLockAmountChanged(uint256 newLockAmount);
  event Deposited(uint256 amount, uint32 lockDuration, address owner);
  event Withdrawn(uint256 amount, address owner);

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
   * @dev Returns the dividends multiplier for `duration` expressed as a fraction of 1e18.
   */
  function getDividendsMultiplier(uint32 duration) public view returns (uint256 multiplier) {
    require(duration >= minLockDuration && duration <= maxLockDuration, "getDividendsMultiplier: Duration not correct");
    uint256 month = uint256(duration) / avgSecondsMonth;
    uint256 multiplier = maxRatioArray[month];

    return multiplier;
  }

  constructor(
    address depositToken_,
    ERC20NonTransferableDividendsOwned dividendsToken_,
    uint32 minLockDuration_,
    uint32 maxLockDuration_,
    uint256 minLockAmount_
  ) payable {
    dividendsToken = dividendsToken_;
    depositToken = depositToken_;
    require(minLockDuration_ < maxLockDuration_, "min>=max");
    minLockDuration = minLockDuration_;
    maxLockDuration = maxLockDuration_;
    minLockAmount = minLockAmount_;
    
  }

  function depositByMonths(uint256 amount, uint256 _months, address receiver) external {
    //require(_months > 5 && _months <= 36, 'Wrong duration');
    uint32 duration = uint32( _months.mul(avgSecondsMonth) );
    console.log("depositByMonths", duration);
    deposit(amount, duration, receiver);
  }

  function deposit(uint256 amount, uint32 duration, address receiver) internal {
    require(amount >= minLockAmount, "Deposit: amount too small");
    depositToken.safeTransferFrom(msg.sender, address(this), amount);
    uint256 multiplier = getDividendsMultiplier(duration);
    uint256 dividendShares = amount.mul(multiplier) / 1e18;
    dividendsToken.mint(receiver, dividendShares);
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
    uint256 multiplier = getDividendsMultiplier(lock.lockDuration);
    uint256 dividendShares = lock.amount.mul(multiplier) / 1e18;
    dividendsToken.burn(msg.sender, dividendShares);
      
    depositToken.safeTransfer(msg.sender, lock.amount);
    emit Withdrawn(lock.amount, msg.sender);
  }

  function boostToMax(uint256 lockId) external {
    Lock memory lock = locks[lockId];
    require(msg.sender == lock.owner, "!owner");

    delete locks[lockId];
    uint256 multiplier = getDividendsMultiplier(lock.lockDuration);
    uint256 dividendShares = lock.amount.mul(multiplier) / 1e18;
    require(dividendsToken.balanceOf(lock.owner) >= dividendShares, "boostToMax: Wrong shares number");

    uint256 newMultiplier = getDividendsMultiplier(maxLockDuration);
    uint256 newDividendShares = lock.amount.mul(newMultiplier) / 1e18;
    dividendsToken.mint(msg.sender, newDividendShares.sub(dividendShares));
    locks.push(Lock({
      amount: lock.amount,
      lockedAt: uint32(block.timestamp),
      lockDuration: maxLockDuration,
      owner: msg.sender
    }));
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

  /**
  * Setters
  */
  function setMinLockAmount(uint256 minLockAmount_) external onlyOwner {
    minLockAmount = minLockAmount_;
    emit MinLockAmountChanged(minLockAmount_);
  }
}