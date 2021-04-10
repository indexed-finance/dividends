// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./IERC20Metadata.sol";


interface IERC20Delegatable is IERC20Metadata {
  function delegate(address delegatee) external;
}