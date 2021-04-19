## Notes

```
  /**
   * @dev Increases or decreases the points correction for `account` by
   * `shares*pointsPerShare`.
   */
  function _correctPoints(address account, int256 shares) internal {
    pointsCorrection[account] = pointsCorrection[account]
      .add(shares.mul(int256(pointsPerShare)));
  }
```

Why is this needed? 
So this function basically update to the current state of amount staked so that rewards are calculated accordingly.
Otherwise you would receive rewards for old deposits.

If you mint && withdraw --> this corrected negatively
if you burn --> this corrected positevely

No rewards decay as long as we can snipe it 
    - add eject function
    - add batch eject

No voting power decay on chain, if we want that we can add in an offchain snapshot adapter because of Aragon V2



### TODO

- no transfer
- add eject
- remove early exit fee
- remove delegate
- change the multiplier function to do 1*MAX_LOCK = 1
- Min staking amount (amount tbd or setter)
