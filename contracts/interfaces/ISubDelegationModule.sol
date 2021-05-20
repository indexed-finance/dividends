// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;


interface ISubDelegationModule {
  function delegate(address to) external;
  function transfer(address to, uint256 amount) external;
}