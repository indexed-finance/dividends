// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

/* ---  External Libraries  --- */
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import "../libraries/TransferHelper.sol";
import "./SubDelegationModule.sol";

library SDM {
  bytes internal constant BYTECODE = hex"608060405234801561001057600080fd5b50600080600080336001600160a01b0316636542bff56040518163ffffffff1660e01b815260040160806040518083038186803b15801561005057600080fd5b505afa158015610064573d6000803e3d6000fd5b505050506040513d608081101561007a57600080fd5b5080516020820151604083015160609093015191965094509092509050821561010957836001600160a01b0316635c19a95c836040518263ffffffff1660e01b815260040180826001600160a01b03168152602001915050600060405180830381600087803b1580156100ec57600080fd5b505af1158015610100573d6000803e3d6000fd5b50505050610195565b836001600160a01b031663a9059cbb83836040518363ffffffff1660e01b815260040180836001600160a01b0316815260200182815260200192505050602060405180830381600087803b15801561016057600080fd5b505af1158015610174573d6000803e3d6000fd5b505050506040513d602081101561018a57600080fd5b505161019557600080fd5b33fffe";
}

contract DelegationModule {
  using TransferHelper for address;

  // @todo Fix hardhat error running out of memory with keccak256(type(SubDelegationModule).creationCode)

  bytes32 internal constant INIT_CODE_HASH = keccak256(
    hex"608060405234801561001057600080fd5b50600080600080336001600160a01b0316636542bff56040518163ffffffff1660e01b815260040160806040518083038186803b15801561005057600080fd5b505afa158015610064573d6000803e3d6000fd5b505050506040513d608081101561007a57600080fd5b5080516020820151604083015160609093015191965094509092509050821561010957836001600160a01b0316635c19a95c836040518263ffffffff1660e01b815260040180826001600160a01b03168152602001915050600060405180830381600087803b1580156100ec57600080fd5b505af1158015610100573d6000803e3d6000fd5b50505050610195565b836001600160a01b031663a9059cbb83836040518363ffffffff1660e01b815260040180836001600160a01b0316815260200182815260200192505050602060405180830381600087803b15801561016057600080fd5b505af1158015610174573d6000803e3d6000fd5b505050506040513d602081101561018a57600080fd5b505161019557600080fd5b33fffe"
  );
  //keccak256(type(SubDelegationModule).creationCode);

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
    Create2.deploy(0, keccak256(abi.encodePacked(account)), SDM.BYTECODE);
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