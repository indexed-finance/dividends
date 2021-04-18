// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

/* ---  External Libraries  --- */
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import "../libraries/TransferHelper.sol";
import "./SubDelegationModule.sol";


contract DelegationModule {
  using TransferHelper for address;

  // @todo Fix hardhat error running out of memory with keccak256(type(SubDelegationModule).creationCode)

  bytes32 internal constant INIT_CODE_HASH = keccak256(type(SubDelegationModule).creationCode);

  address public immutable depositToken;
  address private delegationTarget;
  bool private delegateOrTransfer;
  uint256 private transferAmount;

  constructor(address depositToken_) {
    depositToken = depositToken_;
  }

  function getNextAction() external view returns (address, bool, address, uint256) {
    return (depositToken, delegateOrTransfer, delegationTarget, transferAmount);
  }

  function computeSubDelegationAddress(address account) public view returns (address) {
    bytes32 salt = keccak256(abi.encodePacked(account));
    return Create2.computeAddress(salt, INIT_CODE_HASH);
  }

  /**
   * @dev Execute a call to the sub-delegation module for `account`.
   */
  function _executeModuleAction(address account) internal {
    Create2.deploy(0, keccak256(abi.encodePacked(account)), type(SubDelegationModule).creationCode);
    delegationTarget = address(0);
    delegateOrTransfer = false;
    transferAmount = 0;
  }

  /**
   * @dev Send `amount` of the delegatable token to the sub-delegation
   * module for `account`. 
   */
  function _depositToModule(address account, uint256 amount) internal {
    address module = computeSubDelegationAddress(account);
    depositToken.safeTransferFrom(account, module, amount);
  }

  /**
   * @dev Withdraw the full balance of the delegatable token from the
   * sub-delegation module for `account` to `to`.
   */
  function _withdrawFromModule(address account, address to, uint256 amount) internal {
    transferAmount = amount;
    delegationTarget = to;
    delegateOrTransfer = false;
    _executeModuleAction(account);
  }

  /**
   * @dev Delegates the balance of the sub-delegation module for `account`
   * to `delegatee`.
   */
  function _delegateFromModule(address account, address delegatee) internal {
    delegationTarget = delegatee;
    delegateOrTransfer = true;
    _executeModuleAction(account);
  }
}