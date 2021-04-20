// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "./ERC721.sol";
import "./libraries/SafeCast.sol";
import "./libraries/LowGasSafeMath.sol";
import "./libraries/LowGasSafeMath128.sol";
import "./base/AbstractDividends.sol";


contract DividendBearingLockedShares is ERC721, AbstractDividends {
  using SafeCast for uint256;
  using SafeCast for int256;
  using LowGasSafeMath for uint256;
  using LowGasSafeMath128 for uint128;
  using SignedSafeMath for int256;

  uint24 public immutable earlyWithdrawalFeeBips;
  uint32 public immutable lockDuration;

  uint96 internal _nextNonce;
  uint256 internal _totalShares;

	mapping(address => uint256) internal _sharesOf;

  function totalShares() public view returns (uint256) {
    return _totalShares;
  }

  function sharesOf(address account) public view returns (uint256) {
    return _sharesOf[account];
  }

  function withdrawableSharesOf(uint256 tokenId) public view returns (uint128 sharesOut) {
    require(_exists(tokenId), "DividendBearingLockedShares: query for nonexistent token");
    uint32 unlockAt;
    (sharesOut, unlockAt) = decodeTokenId(tokenId);
    if (block.timestamp < unlockAt) {
      sharesOut = sharesOut.mul(10000 - earlyWithdrawalFeeBips) / 10000;
    }
  }

  function getTokenData(uint256 tokenId) external view returns (address owner, uint128 sharesLocked, uint32 unlocksAt) {
    owner = ownerOf(tokenId);
    (sharesLocked, unlocksAt) = decodeTokenId(tokenId);
  }

  constructor(
    string memory name_,
    string memory symbol_,
    uint32 lockDuration_,
    uint24 earlyWithdrawalFeeBips_
  )
    ERC721(name_, symbol_)
    AbstractDividends(sharesOf, totalShares)
  {
    require(lockDuration_ < 3650 days, "DividendBearingLockedShares: exceeds max lock duration");
    lockDuration = lockDuration_;
    earlyWithdrawalFeeBips = earlyWithdrawalFeeBips_;
    require(
      earlyWithdrawalFeeBips_ > 0 && earlyWithdrawalFeeBips_ < 10000,
      "DividendBearingLockedShares: invalid fee bips"
    );
  }

  function createTokenId(uint128 shares_, uint32 unlocksAt_) internal returns (uint256 tokenId) {
    uint96 nonce_ = _nextNonce++;
    assembly {
      tokenId :=  or(
        shl(160, nonce_),
        or(shl(32, shares_), unlocksAt_)
      )
    }
  }

  function decodeTokenId(uint256 tokenId) internal pure returns (uint128 shares_, uint32 unlocksAt_) {
    assembly {
      unlocksAt_ := and(tokenId, 0xffffffff)
      shares_ := and(shr(32, tokenId), 0xffffffffffffffffffffffffffffffff)
    }
  }

  function _deposit(address account, uint128 amount) internal virtual returns (uint256 tokenId) {
    require(amount > 0, "DividendBearingLockedShares: null deposit");
    _totalShares += amount;
    _sharesOf[account] += amount;

    _correctPoints(account, -int256(amount));

    super._safeMint(
      account,
      (tokenId = createTokenId(amount, uint32(block.timestamp) + lockDuration))
    );
  }

  function _burn(uint256 tokenId) internal virtual returns (uint128 sharesOut) {
    address owner = ERC721.ownerOf(tokenId);
    require(msg.sender == owner, "DividendBearingLockedShares: burn caller is not owner");
		super._burn(owner, tokenId);

    uint32 unlockAt;
    (sharesOut, unlockAt) = decodeTokenId(tokenId);
    uint128 earlyWithdrawalFee;
    if (block.timestamp < unlockAt) {
      earlyWithdrawalFee = sharesOut.mul(earlyWithdrawalFeeBips) / 10000;
    }

    _totalShares = _totalShares.sub(sharesOut);
    _sharesOf[owner] = _sharesOf[owner].sub(sharesOut);

    _correctPoints(owner, int256(sharesOut));
    if (earlyWithdrawalFee > 0) {
      sharesOut = sharesOut.sub(earlyWithdrawalFee);
    }
  }

  function _transfer(address from, address to, uint256 tokenId) internal virtual override {
    (uint128 shares_,) = decodeTokenId(tokenId);
		_correctPointsForTransfer(from, to, shares_);
    _sharesOf[from] = _sharesOf[from].sub(shares_);
    _sharesOf[to] = _sharesOf[to].add(shares_);
		super._transfer(from, to, tokenId);
  }
}