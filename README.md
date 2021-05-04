# pie-dao-staking-rewards

## Core contracts

### [ERC20NonTransferableRewardsOwned.sol](contracts/ERC20NonTransferableRewardsOwned.sol)

Contract keeping tracking of voting/reward weights and handling payout of rewards. ERC20 compatible but transfers are disabled.

### [SharesTimeLock](contracts/SharesTimeLock.sol)

Owner of `ERC20NonTransferableRewardsOwned` and handles the locking and unlocking of `depositToken` and mints/burns `ERC20NonTransferableRewardsOwned` on deposit and withdraw.

## Overview

The `SharesTimeLock` contract allows users to deposit the `depositToken` and lock it to receive `stakedDepositToken`, which represents a share in the total voting and reward weight.

The duration of the lock is limited to 36 months and is at minimum 1 month. The voting and reward weight for each lock time is determined by the `maxRatioArray` in [`SharesTimeLock.sol`]("contracts/SharesTimeLock.sol").

Once locked the `depositToken` cannot be withdrawn early but can be locked again for the max duration by calling: `boostToMax` this extends your lock to the max duration and if the lock is longer than the previous one mints you more `stakedDepositToken`.

If a user's lock expires he should not be entitled anymore to a share of the voting and reward weight. Due to the nature of how smart contracts work this ejection needs to be done actively. Any user can remove an expired `lock` from staking by calling the `eject` function. Other stakers are incentivised to do so to because it gives them a bigger share of the voting and reward weight.

### Forced participation

For users to be able to claim their rewards they need to participate in offchain voting. Participation is tracked ofchain and tracked using a merkle tree, the root of this tree is tracked as `participationMerkleRoot`.

A user can be in the 3 following states:

#### Not included

When an address is not included in the merkle tree it cannot claim rewards

#### Inactive

When an address is included into the tree and its value is set to `0` it has been inactive and the rewards accrued can be redistributed to other stakers by calling `redistribute`.

#### Active

When an address is included into the tree and its value is set to `1` it has been active and the rewards can be claimed by calling ``claim``. Rewards can also be claimed for another address using ``claimFor``

## Scripts

`yarn test`

Runs all tests in `test/`

`yarn coverage`

Runs all tests with solidity-coverage and generates a coverage report.

`yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

`yarn lint`

Runs solhint against the contracts.