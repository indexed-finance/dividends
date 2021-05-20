// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../base/DelegationModule.sol";


contract TestDelegationModule is DelegationModule {
  constructor(address depositToken_) DelegationModule(depositToken_) {}

  function depositToModule(address account, uint256 amount) external {
    _depositToModule(account, amount);
  }

  function withdrawFromModule(address account, address to, uint256 amount) external {
    _withdrawFromModule(account, to, amount);
  }

  function delegateFromModule(address account, address delegatee) external {
    _delegateFromModule(account, delegatee);
  }

  function getOrCreateModuleInternal(address account) external {
    getOrCreateModule(account);
  }
}