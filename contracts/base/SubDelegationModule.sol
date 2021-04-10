// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../interfaces/IERC20Delegatable.sol";


interface IDelegateController {
  function getNextAction() external view returns (IERC20Delegatable token, bool delegateOrTransfer, address to, uint256 amount);
}


/**
 * @dev This is a work-around for the delegation mechanic in COMP.
 * It allows a wrapper contract to "hold" tokens for multiple other accounts
 * while still allowing the original holders to delegate their voting shares.
 *
 * "Hold" in this case really means "lock", for example with a staking contract,
 * as the wrapper contract will not have access to the tokens - they must be
 * transferred to the module.
 *
 * Note: This contract MUST be deployed with create2 and a deterministic Create2 salt,
 * otherwise the entire balance will be permanently lost.
 *
 * Note: This contract MUST receive the full balance it is meant to hold prior to
 * deployment.
 *
 * Note: The deployer MUST implement the `IDelegateController` interface, which
 * should return the address of the delegatable token, a boolean indicating whether
 * to delegate (true) or transfer (false), and the address of the account to delegate
 * or transfer to.
 *
 * Note: If the deployment reverts at any point, the original create2 call will not revert
 * and the c2 address will become permanently unusable, meaning any tokens held by the
 * contract will be locked forever. The best way to handle this is to verify that the returned
 * address is not zero.
 */
contract SubDelegationModule {
  constructor() {
    (IERC20Delegatable token, bool delegateOrTransfer, address to, uint256 amount) = IDelegateController(msg.sender).getNextAction();
    if (delegateOrTransfer) {
      token.delegate(to);
    } else {
      require(token.transfer(to, amount));
    }
    selfdestruct(msg.sender);
  }
}