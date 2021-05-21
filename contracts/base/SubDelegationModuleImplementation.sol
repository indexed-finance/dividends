// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../interfaces/IERC20Delegatable.sol";


/**
 * @dev This is a work-around for the delegation mechanic in COMP.
 * It allows the balance of a staked governance token to be held in separate wallets
 * for each user who makes a deposit so that they will retain the ability to control
 * their governance delegation individually.
 *
 * This is an implementation contract that should be used for a separate proxy per user.
 */
contract SubDelegationModuleImplementation {
  IERC20Delegatable public immutable token;
  address public immutable module;


  constructor(address _token) {
    token = IERC20Delegatable(_token);
    module = msg.sender;
  }

  function delegate(address to) external {
    require(msg.sender == module, "!module");
    token.delegate(to);
  }

  function transfer(address to, uint256 amount) external {
    require(msg.sender == module, "!module");
    token.transfer(to, amount);
  }
}