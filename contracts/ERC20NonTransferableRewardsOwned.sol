// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlUpgradeable as AccessControl} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {MerkleProofUpgradeable as MerkleProof} from "@openzeppelin/contracts-upgradeable/cryptography/MerkleProofUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./base/ERC20NonTransferableRewards.sol";
import "./libraries/TransferHelper.sol";
import "hardhat/console.sol";


contract ERC20NonTransferableRewardsOwned is ERC20NonTransferableRewards, Ownable, AccessControl {
  using TransferHelper for address;

  bytes32 public constant MAINTAINER_ROLE = keccak256("MAINTAINER_ROLE");

  address public token;
  bytes32 public participationMerkleRoot;


  event ClaimedFor(uint256 amount, address indexed collector, address indexed to, bytes32[] proof);


  enum ParticipationType{ INACTIVE, YES }

  modifier participationNeeded {
    require(participationMerkleRoot != bytes32(0), "participationNeeded: merkle root not set");
    _;
  }

  modifier onlyMaintainer {
    require(hasRole(MAINTAINER_ROLE, _msgSender()), "onlyMaintainer: sender is not maintainer");
    _;
  }

  function initialize(string memory name_, string memory symbol_, address token_, address maintainer_) public initializer {
    require(token == address(0), "Already Initialized");
    token = token_;

    __Ownable_init();
    __AccessControl_init();
    ERC20.initialize(name_, symbol_);

    _setupRole(MAINTAINER_ROLE, maintainer_);
    _setupRole(DEFAULT_ADMIN_ROLE, maintainer_);
  }

  function mint(address to, uint256 amount) external virtual onlyOwner {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external virtual onlyOwner {
    _burn(from, amount);
  }

  function claimFor(address account, bytes32[] memory proof) public participationNeeded {
    bytes32 leaf = keccak256(abi.encodePacked(account, uint256(ParticipationType.YES)));

    require(MerkleProof.verify(proof, participationMerkleRoot, leaf), "claimFor: Invalid merkle proof");

    uint256 amount = _prepareCollect(account);
    token.safeTransfer(account, amount);

    emit ClaimedFor(amount, _msgSender(), account, proof);
  }

  function claim(bytes32[] calldata proof) external {
    claimFor(_msgSender(), proof);
  }

  function redistribute(address[] calldata accounts, bytes32[][] calldata proofs) external participationNeeded {
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

  function distributeRewards(uint256 amount) external {
    token.safeTransferFrom(_msgSender(), address(this), amount);
    _distributeRewards(amount);
  }

  function getPointsCorrection(address account) external view returns (int256) {
    return pointsCorrection[account];
  }


  function setParticipationMerkleRoot(bytes32 newParticipationMerkleRoot) external onlyMaintainer {
    participationMerkleRoot = newParticipationMerkleRoot;
  }
}