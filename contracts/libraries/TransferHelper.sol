// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.6.0;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
/************************************************************************************************
Originally from https://github.com/Uniswap/uniswap-v3-periphery/blob/main/contracts/libraries/TransferHelper.sol

This source code has been modified from the original, which was copied from the github repository
at commit hash 6a31c618fc3180a6ee945b869d1ce4449f253ee6.

Subject to the GPL-2.0-or-later license
*************************************************************************************************/


library TransferHelper {
  function safeTransferFrom(
    address token,
    address from,
    address to,
    uint256 value
  ) internal {
    (bool success, bytes memory data) =
      token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))), "STF");
  }

  function safeTransfer(
    address token,
    address to,
    uint256 value
  ) internal {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))), "ST");
  }

  function safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{value: value}(new bytes(0));
    require(success, "STE");
  }
}
