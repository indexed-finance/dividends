// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.0;

/************************************************************************************************
Originally from https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/LowGasSafeMath.sol

This source code has been modified from the original, which was copied from the github repository
at commit hash b83fcf497e895ae59b97c9d04e997023f69b5e97.

Subject to the GPL-2.0-or-later license
*************************************************************************************************/


/// @title Optimized overflow and underflow safe math operations
/// @notice Contains methods for doing math operations that revert on overflow or underflow for minimal gas cost
library LowGasSafeMath128 {
    /// @notice Returns x + y, reverts if sum overflows uint128
    /// @param x The augend
    /// @param y The addend
    /// @return z The sum of x and y
    function add(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require((z = x + y) >= x);
    }

    /// @notice Returns x + y, reverts if sum overflows uint128
    /// @param x The augend
    /// @param y The addend
    /// @return z The sum of x and y
    function add(uint128 x, uint128 y, string memory errorMessage) internal pure returns (uint128 z) {
        require((z = x + y) >= x, errorMessage);
    }

    /// @notice Returns x - y, reverts if underflows
    /// @param x The minuend
    /// @param y The subtrahend
    /// @return z The difference of x and y
    function sub(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require((z = x - y) <= x);
    }

    /// @notice Returns x - y, reverts if underflows
    /// @param x The minuend
    /// @param y The subtrahend
    /// @return z The difference of x and y
    function sub(uint128 x, uint128 y, string memory errorMessage) internal pure returns (uint128 z) {
        require((z = x - y) <= x, errorMessage);
    }

    /// @notice Returns x * y, reverts if overflows
    /// @param x The multiplicand
    /// @param y The multiplier
    /// @return z The product of x and y
    function mul(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require(x == 0 || (z = x * y) / x == y);
    }

    /// @notice Returns x * y, reverts if overflows
    /// @param x The multiplicand
    /// @param y The multiplier
    /// @return z The product of x and y
    function mul(uint128 x, uint128 y, string memory errorMessage) internal pure returns (uint128 z) {
        require(x == 0 || (z = x * y) / x == y, errorMessage);
    }
}
