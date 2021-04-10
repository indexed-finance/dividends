# @indexed-finance/dividends

This repository contains the following primary contracts:

`AbstractDividends.sol` is a generic contract for distributing pro-rata dividends amongst an arbitrary number of "shareholders", where the inheriting contract defines what a shareholder is and how many shares they have.

`ERC20Dividends.sol` is an ERC20 contract implementing `AbstractDividends.sol`, where the shareholders are token holders and their balances are their shares. This contract does not expose any external functions for minting tokens.

`ERC20DividendsOwned.sol` is an ERC20 contract that inherits `ERC20Dividends.sol` and allows an owner to mint and burn shares to accounts. It stores a `token` address which is the token that dividends are paid out in. It allows anyone to distribute dividends via the function `distributeDividends`.

`SharesTimeLock.sol` is the owner of an `ERC20DividendsOwned.sol` contract. It allows users to lock up a `depositToken` for a variable duration in exchange for the dividend-bearing token, which must be burned in order to withdraw the locked tokens.

`DelegationModule.sol` is a contract that separates delegatable token balances into sub-modules per user that can then delegate voting shares.

# [`SharesTimeLock.sol`](./contracts/SharesTimeLock.sol)

## Overview

The timelock contract allows users to deposit one token (`depositToken`) and lock it for a set duration. In exchange, the user receives a second token, `dividendsToken`, which represents proportional ownership over future cashflows.

The duration of the lock is limited by a configured range, but is set by the user making the deposit. The longer the deposit is locked for, the more dividend-bearing tokens will be minted for the user. The minimum lock duration will give 1 dividend token for every deposited token, and the maximum duration will give 1 + a configured bonus multiplier (set at deployment) for every locked token.

In order to withdraw the locked tokens, the user must burn the amount of dividend tokens received when the deposit was made.

Tokens may be withdrawn early in exchange for an early withdrawal fee. The early withdrawal fee is determined by the fraction of the total lock period remaining as well as a configured maximum fee set at deployment.

## Configuration

SharesTimeLock can be configured with the following values, which are immutable after deployment:
- `depositToken` - The ERC20 token which can be locked in exchange for dividend-bearing shares.
- `minLockDuration` - The minimum period of time that deposited tokens can be locked for.
- `maxLockDuration` - The maximum period of time that deposited tokens can be locked for.
- `maxDividendsBonusMultiplier` - The bonus in dividend tokens that users receive when locking tokens for `maxLockDuration`.
- `maxEarlyWithdrawalFee` - The withdrawal fee paid if tokens are withdrawn in the same block that they are deposited.

## Deposits

Users can deposit an arbitrary amount of `depositToken` for `duration` seconds in order to mint dividend tokens. The timelock contract uses `transferFrom` to receive the deposit, so the depositing account must give the timelock contract an allowance of at least the deposit value.

The depositor can call the `delegate` function on the timelock contract to delegate the voting shares for their locked tokens to another account if it is a delegatable ERC20 token such as COMP, UNI or NDX with a `delegate(address delegatee) external;` function.

The timelock contract does not actually hold the tokens being deposited. It uses a `DelegationModule` contract which creates a separate "sub-module" for each depositor. See [DelegationModule](#delegationmodulesol) for details about this contract.

## Lock Duration

The lock duration must be at or between `minLockDuration` and `maxLockDuration`. If tokens are locked for exactly `minLockDuration`, the ratio of dividend tokens to deposited tokens will be 1. If tokens are locked for exactly `maxLockDuration`, the ratio of dividend tokens to deposited tokens will be `1 + maxDividendsBonusMultiplier` As the user increases the lock duration, they receive more dividend tokens.

> **Note:** The bonus multiplier is actually stored as a large integer with a base value of 1e18=1. The formulae here are simplified for readability.

The exact amount of dividend tokens received for locking `amount` deposit tokens for `duration` seconds is:

`amount * (1 + maxDividendsBonusMultiplier * ((duration-minLockDuration)/(maxLockDuration-minLockDuration)))`

**Examples**

With the configuration:
- `minLockDuration` = 50 days
- `maxLockDuration` = 100 days
- `maxDividendsBonusMultiplier` = 5

We'd get the following values:

| Deposit | Duration | Dividend Tokens |
|---------|----------|-----------------|
| 50      | 50 days  | 50              |
| 50      | 80 days  | 200             |
| 50      | 90 days  | 250             |
| 50      | 100 days | 300             |

## Early Withdrawal Fees
The early withdrawal fee is determined by the proportion of the lock period that has passed when the tokens are withdrawn. If `amount` tokens are locked for `duration` at the time `lockedAt`, the early withdrawal fee at the time `now` is:
```
unlockAt = lockedAt+duration
timeRemaining = unlockAt - now
earlyWithdrawalFee = (amount * timeRemaining * maxEarlyWithdrawalFee) / lockDuration
```

**Examples**

With the configuration:
- `maxEarlyWithdrawalFee` = 50%

We'd get the following values:
| Lock Duration | Withdrawn After | Fee (%)|
|---------------|-----------------|--------|
| 60 days       | 0 days          | 50%    |
| 60 days       | 20 days         | 33.33% |
| 60 days       | 30 days         | 25%    |
| 60 days       | 40 days         | 16.66% |
| 60 days       | 50 days         | 8.33%  |

# [`DelegationModule.sol`](./contracts/base/DelegationModule.sol)

Delegatable tokens such as COMP do not allow partial delegation. When these tokens are wrapped, the wrapper contract can not allow the holders of the wrapped token to delegate voting shares with the underlying tokens. The only way to do so is to use a separate contract for each user which holds the underlying token and enables the user to delegate their voting shares.

DelegationModule is a contract that handles this functionality by creating contracts called "Sub-delegation modules" which execute a single action in the constructor and immediately self-destruct in order to minimize gas spent.

These modules can execute two actions: token transfers and delegation. They use constant initialization code so that their create2 addresses can be determined with a salt, which is calculated as the hash of the user address the module is for. They determine what action to execute by querying the deployer account, which uses ephemeral storage values returned in a `getNextAction` function.

### Early withdrawal fees

## Scripts

`yarn test`

Runs all tests in `test/`

`yarn coverage`

Runs all tests with solidity-coverage and generates a coverage report.

`yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

`yarn lint`

Runs solhint against the contracts.
