// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {MerkleProofUpgradeable as MerkleProof} from "@openzeppelin/contracts-upgradeable/cryptography/MerkleProofUpgradeable.sol";
import "./base/ERC20NonTransferableRewards.sol";
import "./libraries/TransferHelper.sol";
import "hardhat/console.sol";


contract ERC20NonTransferableRewardsOwned is ERC20NonTransferableRewards, Ownable {
  using TransferHelper for address;

  address public token;
  bytes32 public participationMerkleRoot;

  event CollectedFor(uint256 amount, address indexed collector, address indexed to, bytes32[] proof);


  enum ParticipationType{ INACTIVE, YES }

  modifier participationNeeded {
    require(participationMerkleRoot != bytes32(0), "participationNeeded: merkle root not set");
    _;
  }

  modifier participationNotNeeded {
    require(participationMerkleRoot == bytes32(0), "participationNeeded: merkle root set");
    _;
  }

  function initialize(address token_) public {
    require(token == address(0), "Already Initialized");
    token = token_;
  }

  function mint(address to, uint256 amount) external virtual onlyOwner {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external virtual onlyOwner {
    _burn(from, amount);
  }

  function collectFor(address account) public participationNotNeeded {
    uint256 amount = _prepareCollect(account);
    token.safeTransfer(account, amount);
  }

  function collect() external {
    collectFor(msg.sender);
  }

  function collectForWithParticipation(address account, bytes32[] memory proof) public participationNeeded {
    bytes32 leaf = keccak256(abi.encodePacked(account, uint256(ParticipationType.YES)));
    // console.log("leaf", leaf);
    console.log("account", account);
    console.log("participation type", uint256(ParticipationType.YES));
    require(MerkleProof.verify(proof, participationMerkleRoot, leaf), "collectForWithParticipation: Invalid merkle proof");
    uint256 amount = _prepareCollect(account);
    token.safeTransfer(account, amount);

    emit CollectedFor(amount, msg.sender, account, proof);
  }

  function collectWithParticipation(bytes32[] calldata proof) external {
    collectForWithParticipation(msg.sender, proof);
  }

  function redistribute(address[] calldata accounts, bytes32[][] calldata proofs) external {
    require(accounts.length == proofs.length, "redistribute: Array length mismatch");

    uint256 totalRedistributed = 0;
    // Save some S_LOADs
    bytes32 root = participationMerkleRoot;

    for(uint256 i = 0; i < accounts.length; i ++) {
      bytes32 leaf = keccak256(abi.encodePacked(accounts[i], uint256(ParticipationType.INACTIVE)));
      if(!MerkleProof.verify(proofs[i], root, leaf)) {
        // skip if proof is invalid
        continue;
      }
      totalRedistributed += _prepareCollect(accounts[i]);
    }

    _distributeRewards(totalRedistributed);
  }

  function distribute(uint256 amount) external {
    token.safeTransferFrom(msg.sender, address(this), amount);
    _distributeRewards(amount);
  }


  function setParticipationMerkleRoot(bytes32 newParticipationMerkleRoot) external onlyOwner {
    participationMerkleRoot = newParticipationMerkleRoot;
  }
}