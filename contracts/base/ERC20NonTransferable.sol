// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./ERC20.sol";


contract ERC20NonTransferable is ERC20 {
  // constructor(
  //   string memory name_,
  //   string memory symbol_,
  //   uint8 decimals_
  // ) ERC20(name_, symbol_, decimals_) {
  //   // nothing
  // }

  /**
   * @dev Disables all transfer related functions
   */
  function _transfer(address, address, uint256) internal virtual override {
    revert("ERC20NonTransferable: Transfer not supported");
  }

  /**
   * @dev Disables all approval related functions
   *
   */
  function _approve(address, address, uint256) internal virtual override {
    revert("ERC20NonTransferable: Approval not supported");
  }
}