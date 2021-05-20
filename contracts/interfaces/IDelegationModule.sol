// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
import "./ISubDelegationModule.sol";


interface IDelegationModule {
  event SubDelegationModuleCreated(address indexed account, address module);

  function moduleImplementation() external view returns (address);

  function depositToken() external view returns (address);

  function subDelegationModuleForUser(address) external view returns (ISubDelegationModule);
}