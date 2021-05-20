// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

/* ---  External Libraries  --- */
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import "../libraries/TransferHelper.sol";
import "../libraries/CloneLibrary.sol";
import "./SubDelegationModuleImplementation.sol";
import "../interfaces/IDelegationModule.sol";


contract DelegationModule is IDelegationModule {
  using TransferHelper for address;
  address public immutable override moduleImplementation;
  address public immutable override depositToken;

  /**
   * @dev Contains the address of the sub-delegation module for a user
   * if one has been deployed.
   */
  mapping(address => ISubDelegationModule) public override subDelegationModuleForUser;

  constructor(address depositToken_) {
    depositToken = depositToken_;
    moduleImplementation = address(new SubDelegationModuleImplementation(depositToken_));
  }

  function getOrCreateModule(address account) internal returns (ISubDelegationModule module) {
    module = subDelegationModuleForUser[account];
    if (address(module) == address(0)) {
      module = ISubDelegationModule(CloneLibrary.createClone(moduleImplementation));
      subDelegationModuleForUser[account] = module;
      module.delegate(account);
      emit SubDelegationModuleCreated(account, address(module));
    }
  }

  /**
   * @dev Send `amount` of the delegatable token to the sub-delegation
   * module for `account`. 
   */
  function _depositToModule(address account, uint256 amount) internal {
    ISubDelegationModule module = getOrCreateModule(account);
    depositToken.safeTransferFrom(account, address(module), amount);
  }

  /**
   * @dev Withdraw the full balance of the delegatable token from the
   * sub-delegation module for `account` to `to`.
   */
  function _withdrawFromModule(address account, address to, uint256 amount) internal {
    ISubDelegationModule module = subDelegationModuleForUser[account];
    module.transfer(to, amount);
  }

  /**
   * @dev Delegates the balance of the sub-delegation module for `account`
   * to `delegatee`.
   */
  function _delegateFromModule(address account, address delegatee) internal {
    ISubDelegationModule module = subDelegationModuleForUser[account];
    module.delegate(delegatee);
  }
}