import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20 } from '../typechain/TestERC20';
import { ERC20NonTransferableDividendsOwned } from '../typechain/ERC20NonTransferableDividendsOwned';
import { SharesTimeLock } from '../typechain/SharesTimeLock';
import { SharesTimeLock__factory } from '../typechain/factories/SharesTimeLock__factory';
import { toBigNumber } from './shared/utils';
import { advanceBlock, duration, latest, setNextTimestamp } from './shared/time';
import { constants } from 'ethers';

describe('DelegationModule', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let timeLock: SharesTimeLock;
  let depositToken: TestERC20
  let dividendsToken: ERC20NonTransferableDividendsOwned
  
  beforeEach('Deploy fixtures', async () => {
    const erc20Factory = await ethers.getContractFactory('TestERC20')
    depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20
    const dividendsFactory = await ethers.getContractFactory('ERC20NonTransferableDividendsOwned')
    dividendsToken = (await dividendsFactory.deploy(depositToken.address, 'dTest', 'dTest')) as ERC20NonTransferableDividendsOwned
    const factory = await ethers.getContractFactory('SharesTimeLock') as SharesTimeLock__factory;
    timeLock = (await factory.deploy(
      depositToken.address,
      dividendsToken.address,
      duration.days(30),
      duration.days(90),
      toBigNumber(1),
      toBigNumber(1)
    )) as SharesTimeLock
    await depositToken.mint(wallet.address, toBigNumber(10))
    await depositToken.approve(timeLock.address, toBigNumber(10))
    await dividendsToken.transferOwnership(timeLock.address)
  })

  describe('Constructor', () => {
    it('Should revert if maxLockDuration <= minLockDuration', async () => {
      const factory = await ethers.getContractFactory('SharesTimeLock') as SharesTimeLock__factory
      await expect(factory.deploy(
        depositToken.address,
        dividendsToken.address,
        duration.days(30),
        duration.days(30),
        toBigNumber(1),
        toBigNumber(1)
      )).to.be.revertedWith('min>=max')
    })

    describe('Settings', () => {
      it('depositToken', async () => {
        expect(await timeLock.depositToken()).to.eq(depositToken.address)
      })
  
      it('dividendsToken', async () => {
        expect(await timeLock.dividendsToken()).to.eq(dividendsToken.address)
      })
  
      it('minLockDuration', async () => {
        expect(await timeLock.minLockDuration()).to.eq(duration.days(30))
      })
  
      it('maxLockDuration', async () => {
        expect(await timeLock.maxLockDuration()).to.eq(duration.days(90))
      })
  
      it('maxDividendsBonusMultiplier', async () => {
        expect(await timeLock.maxDividendsBonusMultiplier()).to.eq(toBigNumber(1))
      })
    })
  })

  describe('getDividendsMultiplier()', () => {
    it('Should revert if duration less than minimum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.days(29))).to.be.revertedWith('OOB')
    })

    it('Should revert if duration higher than maximum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.days(91))).to.be.revertedWith('OOB')
    })

    it('Should return 0.5 for min duration in this case', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(30))).to.eq(toBigNumber(5, 17))
    })

    it('Should return 1 for maximum duration', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(90))).to.eq(toBigNumber(1))
    })

    it('Should return 0.75 for duration between min/max in this case', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(60))).to.eq(toBigNumber(75, 16))
    })
  })

  describe('deposit()', () => {
    it('Should revert if transfer fails', async () => {
      await expect(
        timeLock.deposit(toBigNumber(11), duration.days(30))
      ).to.be.revertedWith('STF')
    })

    it('Should revert if duration < minLockDuration', async () => {
      await expect(
        timeLock.deposit(toBigNumber(10), duration.days(29))
      ).to.be.revertedWith('OOB')
    })

    it('Should revert if duration > maxLockDuration', async () => {
      await expect(
        timeLock.deposit(toBigNumber(10), duration.days(91))
      ).to.be.revertedWith('OOB')
    })

    it('Should deposit amount to sharesTimeLock contract', async () => {
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(5))
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(10))
    })

    it('Should push to locks', async () => {
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      const timestamp = await latest()
      expect(await timeLock.locks(0)).to.deep.eq([
        toBigNumber(5),
        timestamp,
        duration.days(30),
        wallet.address
      ])
      expect(await timeLock.getLocksLength()).to.eq(1)
    })

    it('Should mint amount times multiplier', async () => {
      await expect(timeLock.deposit(toBigNumber(5), duration.days(30)))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(25, 17))
      await expect(timeLock.deposit(toBigNumber(5), duration.days(90)))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(5, 18))
    })
  })

  describe('withdraw()', () => {
    it('Should revert if lockId does not exist', async () => {
      await expect(timeLock.withdraw(1)).to.be.reverted
    })

    // NOTE: shares are no longer transferable so this check is redundant
    // it('Should revert if caller does not have all dividend tokens minted', async () => {
    //   await timeLock.deposit(toBigNumber(5), duration.days(30))
    //   await dividendsToken.transfer(wallet1.address, 1)
    //   await expect(
    //     timeLock.withdraw(0)
    //   ).to.be.revertedWith('ERC20: burn amount exceeds balance')
    // })

    it('Should revert if caller is not the owner', async () => {
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      await expect(
        timeLock.connect(wallet1).withdraw(0)
      ).to.be.revertedWith('!owner')
    })

    describe('When timelock has passed', () => {
      it('Should burn dividends token from caller', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await setNextTimestamp(timestamp + duration.days(100))
        await expect(timeLock.withdraw(0))
          .to.emit(dividendsToken, 'Transfer')
          .withArgs(wallet.address, constants.AddressZero, toBigNumber(25,17))
      })
  
      it('Should withdraw full deposit from SharesTimeLock to the caller', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await setNextTimestamp(timestamp + duration.days(100))
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(timeLock.address, wallet.address, toBigNumber(5))
      })
  
      it('Should delete lock', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await setNextTimestamp(timestamp + duration.days(100))
        await timeLock.withdraw(0)
        expect(await timeLock.locks(0)).to.deep.eq([
          constants.Zero, 0, 0, constants.AddressZero
        ])
        expect(await timeLock.getLocksLength()).to.eq(1)
      })
    })

    describe('When timelock has not passed', () => {
      it('Should revert on early withdraw', async () => {
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        const timestamp = await latest()
        await setNextTimestamp(timestamp + duration.days(1))
        await expect(timeLock.withdraw(0)).to.be.revertedWith("lock not expired")
      })
    })
  })
})