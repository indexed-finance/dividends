import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestDividendBearingLockedShares } from '../typechain/TestDividendBearingLockedShares';
import { TestERC20 } from '../typechain/TestERC20';
import { encodeTokenId, POINTS_MULTIPLIER, toBigNumber } from './shared/utils';
import { BigNumber, constants, ContractTransaction } from 'ethers';
import { advanceTime, latest, duration, setNextTimestamp, advanceBlock } from './shared/time';
import { erc721Fixture } from './shared/fixtures';

const createFixtureLoader = waffle.createFixtureLoader

describe('DividendBearingLockedShares', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let lockedShares: TestDividendBearingLockedShares

  let loadFixture: ReturnType<typeof createFixtureLoader>

  let deployERC721: (lockPeriod: number, earlyWithdrawalFee: number) => Promise<TestDividendBearingLockedShares>;

  before('create fixture loader', async () => {
    loadFixture = createFixtureLoader([wallet, wallet1])
  })

  beforeEach('Deploy TestDividendBearingLockedShares', async () => {
    ({ deployERC721 } = await loadFixture(erc721Fixture));
    lockedShares = await deployERC721(duration.years(1), 1000)
  })

  describe('Settings', () => {
    it('earlyWithdrawalFeeBips', async () => {
      expect(await lockedShares.earlyWithdrawalFeeBips()).to.eq(1000)
    })

    it('lockDuration', async () => {
      expect(await lockedShares.lockDuration()).to.eq(duration.years(1))
    })
  })

  describe('Constructor', () => {
    it('Should revert if lockDuration is >= 3650 days', async () => {
      await expect(
        deployERC721(duration.days(3650), 1000)
      ).to.be.revertedWith('DividendBearingLockedShares: exceeds max lock duration')
    })

    it('Should revert if earlyWithdrawalFeeBips is 0', async () => {
      await expect(
        deployERC721(duration.years(1), 0)
      ).to.be.revertedWith('DividendBearingLockedShares: invalid fee bips')
    })

    it('Should revert if earlyWithdrawalFeeBips is >= 10000', async () => {
      await expect(
        deployERC721(duration.years(1), 10000)
      ).to.be.revertedWith('DividendBearingLockedShares: invalid fee bips')
    })
  })

  

  const nextUnlockTime = async () => {
    await advanceBlock();
    const timestamp = await latest()
    await setNextTimestamp(timestamp + 10)
    return timestamp + 10 + duration.years(1)
  }

  const getPointsPerShare = (amount: BigNumber, totalSupply: BigNumber) => amount.mul(POINTS_MULTIPLIER).div(totalSupply);
  
  describe('deposit()', () => {
    it('Should mint a locked shares NFT for the caller', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await expect(lockedShares.deposit(amount))
        .to.emit(lockedShares, 'Transfer')
          .withArgs(
            constants.AddressZero, 
            wallet.address,
            tokenId
          )
      expect(await lockedShares.ownerOf(tokenId)).to.eq(wallet.address)
    })

    it('Should increase totalShares', async () => {
      const amount = toBigNumber(10)
      await lockedShares.deposit(amount)
      expect(await lockedShares.totalShares()).to.eq(amount)
    })

    it('Should not change pointsCorrection if points distributed is 0', async () => {
      const amount = toBigNumber(10)
      await lockedShares.deposit(amount)
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(0)
    })

    it('Should decrease pointsCorrection if points distributed is >0', async () => {
      const amount = toBigNumber(5)
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(amount)
      await lockedShares.deposit(amount)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare).mul(-1))
    })

    it('Should revert if amount is 0', async () => {
      await expect(
        lockedShares.deposit(0)
      ).to.be.revertedWith('DividendBearingLockedShares: null deposit')
    })
  })

  describe('withdraw()', () => {
    it('Should revert if token does not exist', async () => {
      await expect(
        lockedShares.withdraw(1)
      ).to.be.revertedWith('ERC721: owner query for nonexistent token')
    })

    it('Should revert if account does not own token', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await expect(
        lockedShares.connect(wallet1).withdraw(tokenId)
      ).to.be.revertedWith('DividendBearingLockedShares: burn caller is not owner')
    })

    it('Should not change pointsCorrection if points distributed is 0', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await lockedShares.withdraw(tokenId)
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(0)
    })

    it('Should increase pointsCorrection if points distributed is >0', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(toBigNumber(5))
      await lockedShares.withdraw(tokenId)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare))
    })

    it('Should withdraw full amount when deposit is unlocked', async () => {
      const amount = toBigNumber(10)
      const unlockTime = await nextUnlockTime()
      const tokenId = encodeTokenId(0, amount, unlockTime)
      await lockedShares.deposit(amount)
      await advanceBlock()
      await setNextTimestamp(unlockTime)
      await advanceBlock()
      expect(await lockedShares.callStatic.withdraw(tokenId)).to.eq(amount)
    })

    it('Should withdraw full amount less early withdrawal fee when deposit is locked', async () => {
      const amount = toBigNumber(10)
      const unlockTime = await nextUnlockTime()
      const tokenId = encodeTokenId(0, amount, unlockTime)
      await lockedShares.deposit(amount)
      expect(await lockedShares.callStatic.withdraw(tokenId)).to.eq(toBigNumber(9))
    })
  })

  describe('transferFrom()', () => {
    it('Should revert if token does not exist', async () => {
      await expect(lockedShares.transferFrom(wallet.address, wallet1.address, '0'))
        .to.be.revertedWith('ERC721: operator query for nonexistent token')
    })

    it('Should not affect pointsCorrection if points distributed is 0', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await lockedShares.transferFrom(wallet.address, wallet1.address, tokenId)
      expect(await lockedShares.totalShares()).to.eq(amount)
      expect(await lockedShares.sharesOf(wallet.address)).to.eq(0)
      expect(await lockedShares.sharesOf(wallet1.address)).to.eq(amount)
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(0)
      expect(await lockedShares.getPointsCorrection(wallet1.address)).to.eq(0)
    })

    it('Should increase pointsCorrection for sender and decrease for recipient', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(toBigNumber(5))
      await lockedShares.transferFrom(wallet.address, wallet1.address, tokenId)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await lockedShares.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare))
      expect(await lockedShares.getPointsCorrection(wallet1.address)).to.eq(amount.mul(pointsPerShare).mul(-1))
    })

    it('Sender should be able to claim dividends, but not recipient', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(toBigNumber(5))
      await lockedShares.transferFrom(wallet.address, wallet1.address, tokenId)
      expect(await lockedShares.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5).sub(1))
      expect(await lockedShares.withdrawableDividendsOf(wallet1.address)).to.eq(0)
    })
  })

  describe('distributeDividends()', () => {
    it('Should revert if total supply is 0', async () => {
      await expect(lockedShares.distributeDividends(1)).to.be.revertedWith('SHARES')
    })

    it('Should increase pointsPerShare', async () => {
      const amount = toBigNumber(10)
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(toBigNumber(1))
      expect(await lockedShares.pointsPerShare()).to.eq(POINTS_MULTIPLIER.div(10))
    })

    it('Should do nothing if amount is 0', async () => {
      const amount = toBigNumber(10)
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(0)
      expect(await lockedShares.pointsPerShare()).to.eq(0)
    })
  })

  describe('withdrawableDividendsOf()', () => {
    it('Should return 0 if no dividends distributed', async () => {
      const amount = toBigNumber(10)
      await lockedShares.deposit(amount)
      expect(await lockedShares.withdrawableDividendsOf(wallet.address)).to.eq(0)
    })

    it('Should return distributed amount if owner has all shares', async () => {
      const amount = toBigNumber(5)
      await lockedShares.deposit(amount)
      await lockedShares.distributeDividends(amount)
      expect(await lockedShares.withdrawableDividendsOf(wallet.address)).to.eq(amount)
    })
  })

  describe('withdrawableSharesOf()', () => {
    it('Should revert if token does not exist', async () => {
      await expect(lockedShares.withdrawableSharesOf('0'))
        .to.be.revertedWith('DividendBearingLockedShares: query for nonexistent token')
    })

    it('Should return deposit minus early wd fee if unlock period has not passed', async () => {
      const amount = toBigNumber(10)
      const tokenId = encodeTokenId(0, amount, await nextUnlockTime())
      await lockedShares.deposit(amount)
      expect(await lockedShares.withdrawableSharesOf(tokenId)).to.eq(toBigNumber(9))
    })

    it('Should return full deposit if unlock period has passed', async () => {
      const amount = toBigNumber(10)
      const unlockTime = await nextUnlockTime()
      const tokenId = encodeTokenId(0, amount, unlockTime)
      await lockedShares.deposit(amount)
      await advanceBlock()
      await setNextTimestamp(unlockTime)
      await advanceBlock()
      expect(await lockedShares.withdrawableSharesOf(tokenId)).to.eq(amount)
    })
  })

  describe('getTokenData()', () => {
    it('Should revert if owner does not exist', async () => {
      await expect(lockedShares.getTokenData('0'))
        .to.be.revertedWith('ERC721: owner query for nonexistent token')
    })

    it('Should return token data', async () => {
      const amount = toBigNumber(10)
      const unlockTime = await nextUnlockTime()
      const tokenId = encodeTokenId(0, amount, unlockTime)
      await lockedShares.deposit(amount)
      expect(await lockedShares.getTokenData(tokenId)).to.deep.eq([
        wallet.address, amount, unlockTime
      ])
    })
  })
})