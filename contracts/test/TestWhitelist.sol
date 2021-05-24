// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../SharesTimeLock.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract TestWhitelist {

    SharesTimeLock public immutable sharesTimeLock;

    constructor(address _sharesTimeLock) {
        sharesTimeLock = SharesTimeLock(_sharesTimeLock);
    }

    /// @notice Deposit tokens should already be in there
    function testWhitelistDepositByMonths(uint256 _amount, uint256 _months, address _receiver) external {
        IERC20 token = IERC20(sharesTimeLock.depositToken());

        token.approve(address(sharesTimeLock), _amount);
        sharesTimeLock.depositByMonths(_amount, _months, _receiver);
    }
}