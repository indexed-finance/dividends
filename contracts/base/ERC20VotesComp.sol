// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import "../interfaces/IERC20VotesComp.sol";


contract ERC20VotesComp is IERC20VotesComp {
/** ========== Constants ==========  */

  /** @dev The EIP-712 typehash for the contract's domain */
  bytes32 public constant DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");

  /** @dev The EIP-712 typehash for the delegation struct used by the contract */
  bytes32 public constant DELEGATION_TYPEHASH = keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

  /** @dev The EIP-712 typehash for the permit struct used by the contract */
  bytes32 public constant PERMIT_TYPEHASH = keccak256(
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
  );

  /** @dev The EIP-712 domain separator */
  bytes32 public immutable domainSeparator;

  /** @dev EIP-20 token decimals for this token */
  uint8 public constant decimals = 18;

  /** @dev EIP-20 token name for this token */
  string public name;

  /** @dev EIP-20 token symbol for this token */
  string public symbol;

/** ========== Storage ==========  */

  /** @dev Total number of tokens in circulation */
  uint96 internal _totalSupply;

  /** @dev Allowance amounts on behalf of others */
  mapping(address => mapping(address => uint96)) internal allowances;

  /** @dev Official record of token balances for each account */
  mapping(address => uint96) internal balances;

  /** @dev A record of each accounts delegate */
  mapping(address => address) public override delegates;

  /** @dev A record of votes checkpoints for each account, by index */
  mapping(address => mapping(uint32 => Checkpoint)) public override checkpoints;

  /** @dev The number of checkpoints for each account */
  mapping(address => uint32) public override numCheckpoints;

  /** @dev A record of states for signing / validating signatures */
  mapping(address => uint256) public override nonces;

/** ========== Constructor ==========  */

  constructor(string memory _name, string memory _symbol) {
    name = _name;
    symbol = _symbol;
    domainSeparator = keccak256(abi.encode(
      DOMAIN_TYPEHASH, keccak256(bytes(_name)), getChainId(), address(this)
    ));
  }

/** ========== Queries ==========  */

  function totalSupply() public view override returns (uint256) {
    return _totalSupply;
  }

  /**
   * @dev Get the number of tokens `spender` is approved to spend on behalf of `account`
   * @param account The address of the account holding the funds
   * @param spender The address of the account spending the funds
   * @return The number of tokens approved
   */
  function allowance(address account, address spender) public view override returns (uint256) {
    return allowances[account][spender];
  }

  /**
   * @dev Get the number of tokens held by the `account`
   * @param account The address of the account to get the balance of
   * @return The number of tokens held
   */
  function balanceOf(address account) public view override returns (uint256) {
    return balances[account];
  }

  /**
   * @dev Gets the current votes balance for `account`
   * @param account The address to get votes balance
   * @return The number of current votes for `account`
   */
  function getCurrentVotes(address account) external view override returns (uint96) {
    uint32 nCheckpoints = numCheckpoints[account];
    return nCheckpoints > 0 ? checkpoints[account][nCheckpoints - 1].votes : 0;
  }

  /**
   * @dev Determine the prior number of votes for an account as of a block number
   * Block number must be a finalized block or else this function will revert to prevent misinformation.
   * @param account The address of the account to check
   * @param blockNumber The block number to get the vote balance at
   * @return The number of votes the account had as of the given block
   */
  function getPriorVotes(address account, uint256 blockNumber) external view override returns (uint96) {
    require(blockNumber < block.number, "not yet determined");

    uint32 nCheckpoints = numCheckpoints[account];
    if (nCheckpoints == 0) {
      return 0;
    }

    // First check most recent balance
    if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
      return checkpoints[account][nCheckpoints - 1].votes;
    }

    // Next check implicit zero balance
    if (checkpoints[account][0].fromBlock > blockNumber) {
      return 0;
    }

    uint32 lower = 0;
    uint32 upper = nCheckpoints - 1;
    while (upper > lower) {
      uint32 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      Checkpoint memory cp = checkpoints[account][center];
      if (cp.fromBlock == blockNumber) {
        return cp.votes;
      } else if (cp.fromBlock < blockNumber) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return checkpoints[account][lower].votes;
  }

/** ========== ERC20 Actions ==========  */

  /**
   * @dev Approve `spender` to transfer up to `amount` from `src`
   * This will overwrite the approval amount for `spender`
   *  and is subject to issues noted [here](https://eips.ethereum.org/EIPS/eip-20#approve)
   * @param spender The address of the account which may transfer tokens
   * @param rawAmount The number of tokens that are approved (2^256-1 means infinite)
   * @return Whether or not the approval succeeded
   */
  function approve(address spender, uint256 rawAmount) external override returns (bool) {
    uint96 amount;
    if (rawAmount == uint256(-1)) {
      amount = uint96(-1);
    } else {
      amount = safe96(rawAmount);
    }

    allowances[msg.sender][spender] = amount;

    emit Approval(msg.sender, spender, amount);
    return true;
  }

  function permit(
    address owner,
    address spender,
    uint256 rawAmount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external {
    uint96 amount;
    if (rawAmount == uint256(-1)) {
      amount = uint96(-1);
    } else {
      amount = safe96(rawAmount);
    }

    bytes32 structHash = keccak256(
      abi.encode(
        PERMIT_TYPEHASH,
        owner,
        spender,
        rawAmount,
        nonces[owner]++,
        deadline
      )
    );
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", domainSeparator, structHash)
    );
    address signatory = ecrecover(digest, v, r, s);
    require(signatory != address(0), "invalid signature");
    require(signatory == owner, "unauthorized");
    require(block.timestamp <= deadline, "signature expired");

    allowances[owner][spender] = amount;

    emit Approval(owner, spender, amount);
  }

  /**
   * @dev Transfer `amount` tokens from `msg.sender` to `dst`
   * @param dst The address of the destination account
   * @param rawAmount The number of tokens to transfer
   * @return Whether or not the transfer succeeded
   */
  function transfer(address dst, uint256 rawAmount) external override returns (bool) {
    uint96 amount = safe96(rawAmount);
    _transfer(msg.sender, dst, amount);
    return true;
  }

  /**
   * @dev Transfer `amount` tokens from `src` to `dst`
   * @param src The address of the source account
   * @param dst The address of the destination account
   * @param rawAmount The number of tokens to transfer
   * @return Whether or not the transfer succeeded
   */
  function transferFrom(
    address src,
    address dst,
    uint256 rawAmount
  ) external override returns (bool) {
    address spender = msg.sender;
    uint96 spenderAllowance = allowances[src][spender];
    uint96 amount = safe96(rawAmount);

    if (spender != src && spenderAllowance != uint96(-1)) {
      uint96 newAllowance =
        sub96(spenderAllowance, amount, "transfer amount exceeds allowance");
      allowances[src][spender] = newAllowance;

      emit Approval(src, spender, newAllowance);
    }

    _transfer(src, dst, amount);
    return true;
  }

/** ========== Delegation Actions ==========  */

  /**
   * @dev Delegate votes from `msg.sender` to `delegatee`
   * @param delegatee The address to delegate votes to
   */
  function delegate(address delegatee) external override {
    return _delegate(msg.sender, delegatee);
  }

  /**
   * @dev Delegates votes from signatory to `delegatee`
   * @param delegatee The address to delegate votes to
   * @param nonce The contract state required to match the signature
   * @param expiry The time at which to expire the signature
   * @param v The recovery byte of the signature
   * @param r Half of the ECDSA signature pair
   * @param s Half of the ECDSA signature pair
   */
  function delegateBySig(
    address delegatee,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external override {
    bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    address signatory = ecrecover(digest, v, r, s);
    require(signatory != address(0), "invalid signature");
    require(nonce == nonces[signatory]++, "invalid nonce");
    require(block.timestamp <= expiry, "signature expired");
    return _delegate(signatory, delegatee);
  }

/** ========== Internal Helpers ==========  */

  function _mint(address dst, uint256 rawAmount) internal virtual {
    require(dst != address(0), "mint to the zero address");
    uint96 amount = safe96(rawAmount);
    _totalSupply = add96(_totalSupply, amount, "mint amount overflows");
    balances[dst] += amount; // add96 not needed because totalSupply does not overflow
    emit Transfer(address(0), dst, amount);
    _moveDelegates(address(0), delegates[dst], amount);
  }

  function _burn(address src, uint256 rawAmount) internal virtual {
    require(src != address(0), "burn from the zero address");
    uint96 amount = safe96(rawAmount);
    balances[src] = sub96(balances[src], amount, "burn amount exceeds balance");
    _totalSupply -= amount; // add96 not needed because balance does not underflow
    emit Transfer(src, address(0), amount);
    _moveDelegates(delegates[src], address(0), amount);
  }

  function _delegate(address delegator, address delegatee) internal {
    address currentDelegate = delegates[delegator];
    uint96 delegatorBalance = balances[delegator];
    delegates[delegator] = delegatee;
    emit DelegateChanged(delegator, currentDelegate, delegatee);
    _moveDelegates(currentDelegate, delegatee, delegatorBalance);
  }

  function _transfer(
    address src,
    address dst,
    uint96 amount
  ) internal virtual {
    require(src != address(0), "transfer from the zero address");
    require(dst != address(0), "transfer to the zero address");

    balances[src] = sub96(balances[src], amount, "transfer amount exceeds balance");
    balances[dst] = add96(balances[dst], amount, "transfer amount overflows");
    emit Transfer(src, dst, amount);

    _moveDelegates(delegates[src], delegates[dst], amount);
  }

  function _moveDelegates(
    address srcRep,
    address dstRep,
    uint96 amount
  ) internal {
    if (srcRep != dstRep && amount > 0) {
      if (srcRep != address(0)) {
        uint32 srcRepNum = numCheckpoints[srcRep];
        uint96 srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1].votes : 0;
        uint96 srcRepNew = sub96(srcRepOld, amount, "vote amount underflows");
        _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
      }

      if (dstRep != address(0)) {
        uint32 dstRepNum = numCheckpoints[dstRep];
        uint96 dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1].votes : 0;
        uint96 dstRepNew = add96(dstRepOld, amount, "vote amount overflows");
        _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
      }
    }
  }

  function _writeCheckpoint(
    address delegatee,
    uint32 nCheckpoints,
    uint96 oldVotes,
    uint96 newVotes
  ) internal {
    uint32 blockNumber = safe32(block.number, "block number exceeds 32 bits");

    if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
      checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
    } else {
      checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
      numCheckpoints[delegatee] = nCheckpoints + 1;
    }

    emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
  }

  function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32) {
    require(n < 2**32, errorMessage);
    return uint32(n);
  }

  function safe96(uint256 n) internal pure returns (uint96) {
    require(n < 2**96, "amount exceeds 96 bits");
    return uint96(n);
  }

  function add96(
    uint96 a,
    uint96 b,
    string memory errorMessage
  ) internal pure returns (uint96) {
    uint96 c = a + b;
    require(c >= a, errorMessage);
    return c;
  }

  function sub96(
    uint96 a,
    uint96 b,
    string memory errorMessage
  ) internal pure returns (uint96) {
    require(b <= a, errorMessage);
    return a - b;
  }

  function getChainId() internal pure returns (uint256) {
    uint256 chainId;
    assembly { chainId := chainid() }
    return chainId;
  }
}
