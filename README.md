# @indexed-finance/dividends

This repository contains the following primary contracts:

`AbstractDividends.sol` is a generic contract for distributing pro-rata dividends amongst an arbitrary number of "shareholders", where the inheriting contract defines what a shareholder is and how many shares they have.

`ERC20Dividends.sol` is an ERC20 contract implementing `AbstractDividends.sol`, where the shareholders are token holders and their balances are their shares. This contract does not expose any external functions for minting or burning tokens.

`ERC20DividendsOwned.sol` is an ERC20 contract that inherits `ERC20Dividends.sol` and allows an owner to mint and burn shares to accounts. It stores a `token` address which is the token that dividends are paid out in. It allows anyone to distribute dividends via the function `distributeDividends`.

`SharesTimeLock.sol` is the owner of an `ERC20DividendsOwned.sol` contract. It allows users to lock up a `depositToken` for a variable duration in exchange for the dividend-bearing token, which must be burned in order to withdraw the locked tokens.

`DelegationModule.sol` is a contract that separates delegatable token balances into sub-modules per user that can then delegate voting shares.

# [`SharesTimeLock.sol`](./contracts/SharesTimeLock.sol)

## Overview

The timelock contract allows users to deposit one token (`depositToken`) and lock it for a set duration. In exchange, the user receives a second token, `dividendsToken`, which represents proportional ownership over future cashflows.

The duration of the lock is set by the user making the deposit, limited by a configured range. The longer the deposit is locked for, the more dividend-bearing tokens will be minted for the user. The minimum lock duration will give 1 dividend token for every deposited token, and the maximum duration will give 1 + a configured bonus multiplier (set at deployment) for every locked token.

In order to withdraw the locked tokens, the user must burn the amount of dividend tokens received when the deposit was made.

Tokens may be withdrawn early in exchange for an early withdrawal fee. The early withdrawal fee is determined by the fraction of the total lock period remaining as well as a configured maximum fee set at deployment.

## Configuration

SharesTimeLock can be configured with the following values, which are immutable after deployment:
- `depositToken` - The ERC20 token which can be locked in exchange for dividend-bearing shares. This must be a delegatable ERC20 such as COMP, UNI, NDX.
- `minEarlyWithdrawalFee` - The minimum early withdrawal fee which is paid on all early withdrawals.
- `baseEarlyWithdrawalFee` - The dynamic portion of the early withdrawal fee that is multiplied by the proportion of the lock duration that has elapsed and by the bonus multiplier for the lock.
- `minLockDuration` - The minimum period of time that deposited tokens can be locked for.
- `maxLockDuration` - The maximum period of time that deposited tokens can be locked for.
- `maxDividendsBonusMultiplier` - The bonus in dividend tokens that users receive when locking tokens for `maxLockDuration`.
- `maxEarlyWithdrawalFee` - The withdrawal fee paid if tokens are withdrawn in the same block that they are deposited.

There is an additional configurable value `minimumDeposit` which can be adjusted after deployment by the owner.

## Deposits

Users can deposit `depositToken` for an arbitrary duration (between `minLockDuration` and `maxLockDuration`) in order to mint dividend-bearing tokens. The timelock contract uses `transferFrom` to receive the deposit, so the depositing account must give the timelock contract an allowance of at least the deposit value.

The timelock contract does not actually hold the tokens being deposited. It uses a `DelegationModule` contract which creates a separate "sub-module" for each depositor. See [DelegationModule](#delegationmodulesol) for details about this contract.

If a `minimumDeposit` value is set by the owner, the deposit amount must be greater than the minimum deposit.

The depositor can call the `delegate` function on the timelock contract to delegate the voting shares for their locked tokens to another account.


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
The early withdrawal fee has two components: a static component which is the same for every early withdrawal, and a dynamic component which is determined by the proportion of the lock period that has passed and the dividends multiplier for the lock.

If `amount` tokens are locked for `duration` at the time `lockedAt`, the early withdrawal fee at the time `now` is:
```
unlockAt = lockedAt+duration
timeRemaining = unlockAt - now
earlyWithdrawalFee = amount * (minEarlyWithdrawalFee +  ((baseEarlyWithdrawalFee * maxEarlyWithdrawalFee) / lockDuration) * dividendsMultiplier(duration))
```

For more information on this, [read this thread](https://forum.indexed.finance/t/create-dndx-a-dividends-token-for-indexed-fee-revenue/610/42?u=d1ll0n) or see [examples here](https://docs.google.com/spreadsheets/d/1DSqK2XcjrIDkJ82HUa2alYzfbIDPUqhWvSmtpgASeN4/edit?usp=sharing).

## Emergency Unlock

The owner may trigger an "emergency unlock", which blocks deposits and allows all locked tokens to be withdrawn with no fees.

# [`DelegationModule.sol`](./contracts/base/DelegationModule.sol)

Delegatable tokens such as COMP do not allow partial delegation. When these tokens are wrapped, the wrapper contract can not allow the holders of the wrapped token to delegate voting shares with the underlying tokens. The only way to do so is to use a separate contract for each user which holds the underlying token and enables the user to delegate their voting shares.

DelegationModule is a contract that handles this functionality by creating contracts called "sub-delegation modules". A sub-delegation module is a simple contract that allows the owner (the delegation module) to deposit, withdraw and delegate tokens held in the sub-module.

When a deposit is made, the deposited tokens are transferred to a sub-delegation module which is deployed for each user. When a delegation module is first deployed for each user, it will delegate its voting shares to the account that made the deposit. After that, the user can call the timelock at any time to re-delegate the tokens they have locked.

## Scripts

`yarn test`

Runs all tests in `test/`

`yarn coverage`

Runs all tests with solidity-coverage and generates a coverage report.

`yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

`yarn lint`

Runs solhint against the contracts.
