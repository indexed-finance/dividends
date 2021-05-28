// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../SharesTimeLock.sol";

contract TestSharesTimeLock is SharesTimeLock {

    uint256 public secPerMonth;

    function setSecondsPerMonth(uint256 secondsPerMonth_) external onlyOwner {
        secPerMonth = secondsPerMonth_;
    }

    function secondsPerMonth() internal view override returns(uint256) {
        return secPerMonth;
    }
}