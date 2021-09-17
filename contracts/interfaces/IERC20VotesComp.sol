// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./IERC20.sol";


interface IERC20VotesComp is IERC20 {
  event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

  event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance);

  struct Checkpoint {
    uint32 fromBlock;
    uint96 votes;
  }

  function nonces(address) external view returns (uint256);

  function delegates(address) external view returns (address);

  function checkpoints(address, uint32) external view returns (uint32 fromBlock, uint96 votes);

  function numCheckpoints(address) external view returns (uint32);

  function getCurrentVotes(address account) external view returns (uint96);

  function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96);

  function delegate(address delegatee) external;

  function delegateBySig(
    address delegatee,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;
}