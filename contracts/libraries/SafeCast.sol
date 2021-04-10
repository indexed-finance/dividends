// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/************************************************************************************************
Originally from https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/SafeCast.sol

This source code has been modified from the original, which was copied from the github repository
at commit hash b83fcf497e895ae59b97c9d04e997023f69b5e97.

Subject to the GPL-2.0-or-later license
*************************************************************************************************/


/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
  /// @notice Cast a uint256 to a uint160, revert on overflow
  /// @param y The uint256 to be downcasted
  /// @return z The downcasted integer, now type uint160
  function toUint160(uint256 y) internal pure returns (uint160 z) {
    require((z = uint160(y)) == y);
  }

  /// @notice Cast a uint256 to a uint128, revert on overflow
  /// @param y The uint256 to be downcasted
  /// @return z The downcasted integer, now type uint128
  function toUint128(uint256 y) internal pure returns (uint128 z) {
    require((z = uint128(y)) == y);
  }

  /// @notice Cast a int256 to a int128, revert on overflow or underflow
  /// @param y The int256 to be downcasted
  /// @return z The downcasted integer, now type int128
  function toInt128(int256 y) internal pure returns (int128 z) {
    require((z = int128(y)) == y);
  }

  /// @notice Cast a uint256 to a int256, revert on overflow
  /// @param y The uint256 to be casted
  /// @return z The casted integer, now type int256
  function toInt256(uint256 y) internal pure returns (int256 z) {
    require(y < 2**255);
    z = int256(y);
  }

  /// @notice Cast an int256 to a uint256, revert on overflow
  /// @param y The uint256 to be downcasted
  /// @return z The downcasted integer, now type uint160
  function toUint256(int256 y) internal pure returns (uint256 z) {
    require(y >= 0);
    z = uint256(y);
  }
}
