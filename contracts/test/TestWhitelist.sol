// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../SharesTimeLock.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract TestWhitelist {

    SharesTimeLock public immutable sharesTimeLock;

    constructor(address sharesTimeLock_) {
        sharesTimeLock = SharesTimeLock(sharesTimeLock_);
    }

    /// @notice Deposit tokens should already be in there
    function testWhitelistDepositByMonths(uint256 amount, uint256 months, address receiver) external {
        IERC20 token = IERC20(sharesTimeLock.depositToken());

        token.approve(address(sharesTimeLock), amount);
        sharesTimeLock.depositByMonths(amount, months, receiver);
    }
}