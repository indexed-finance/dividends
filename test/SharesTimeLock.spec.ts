import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20 } from '../typechain/TestERC20';
import { ERC20DividendsOwned } from '../typechain/ERC20DividendsOwned';
import { SharesTimeLock } from '../typechain/SharesTimeLock';
import { toBigNumber } from './shared/utils';
import { advanceBlock, duration, latest, setNextTimestamp } from './shared/time';
import { constants } from 'ethers';

describe('DelegationModule', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let timeLock: SharesTimeLock;
  let depositToken: TestERC20
  let dividendsToken: ERC20DividendsOwned
  
  beforeEach('Deploy fixtures', async () => {
    const erc20Factory = await ethers.getContractFactory('TestERC20')
    depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20
    const dividendsFactory = await ethers.getContractFactory('ERC20DividendsOwned')
    dividendsToken = (await dividendsFactory.deploy(depositToken.address, 'dTest', 'dTest')) as ERC20DividendsOwned
    const factory = await ethers.getContractFactory('SharesTimeLock')
    timeLock = (await factory.deploy(
      depositToken.address,
      dividendsToken.address,
      duration.days(30),
      duration.days(90),
      toBigNumber(1),
      toBigNumber(2, 17) // 20%
    )) as SharesTimeLock
    await depositToken.mint(wallet.address, toBigNumber(10))
    await depositToken.approve(timeLock.address, toBigNumber(10))
    await dividendsToken.transferOwnership(timeLock.address)
  })

  describe('Constructor', () => {
    it('Should revert if maxEarlyWithdrawalFee > 1', async () => {
      const factory = await ethers.getContractFactory('SharesTimeLock')
      await expect(factory.deploy(
        depositToken.address,
        dividendsToken.address,
        duration.days(30),
        duration.days(90),
        toBigNumber(1),
        toBigNumber(2)
      )).to.be.revertedWith('maxFee')
    })

    it('Should revert if maxLockDuration <= minLockDuration', async () => {
      const factory = await ethers.getContractFactory('SharesTimeLock')
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
  
      it('maxEarlyWithdrawalFee', async () => {
        expect(await timeLock.maxEarlyWithdrawalFee()).to.eq(toBigNumber(2, 17))
      })
    })
  })

  describe('getEarlyWithdrawalFee()', () => {
    it('Should return 0 if unlockAt is <= now', async () => {
      const timestamp = await latest()
      expect(
        await timeLock.getEarlyWithdrawalFee(toBigNumber(1), timestamp - 100, 100)
      ).to.eq(0)
    })

    it('Should charge max fee if locked in same block', async () => {
      const timestamp = await latest()
      expect(
        await timeLock.getEarlyWithdrawalFee(toBigNumber(1), timestamp, 100)
      ).to.eq(toBigNumber(2, 17))
    })

    it('Should charge fee proportional to amount of duration elapsed', async () => {
      const timestamp = await latest()
      expect(
        await timeLock.getEarlyWithdrawalFee(toBigNumber(1), timestamp - 50, 100)
      ).to.eq(toBigNumber(1, 17))
    })
  })

  describe('getDividendsMultiplier()', () => {
    it('Should revert if duration less than minimum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.days(29))).to.be.revertedWith('OOB')
    })

    it('Should revert if duration higher than maximum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.days(91))).to.be.revertedWith('OOB')
    })

    it('Should return 1 for minimum duration', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(30))).to.eq(toBigNumber(1))
    })

    it('Should return 1 + bonus for maximum duration', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(90))).to.eq(toBigNumber(2))
    })

    it('Should return 1 + bonus/2 for duration between min/max', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.days(60))).to.eq(toBigNumber(15, 17))
    })
  })

  describe('withdrawFees()', () => {
    it('Should revert if not owner', async () => {
      await expect(timeLock.connect(wallet1).withdrawFees(wallet1.address))
        .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should withdraw entire balance of depositToken', async () => {
      await depositToken.mint(timeLock.address, toBigNumber(10))
      await timeLock.withdrawFees(wallet1.address)
      expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(10))
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

    it('Should deposit amount to the sub-delegation module of the caller', async () => {
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      const delegationModule = await timeLock.computeSubDelegationAddress(wallet.address)
      expect(await depositToken.balanceOf(delegationModule)).to.eq(toBigNumber(5))
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      expect(await depositToken.balanceOf(delegationModule)).to.eq(toBigNumber(10))
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
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(5))
      await expect(timeLock.deposit(toBigNumber(5), duration.days(90)))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(10))
    })
  })

  describe('withdraw()', () => {
    it('Should revert if lockId does not exist', async () => {
      await expect(timeLock.withdraw(1)).to.be.reverted
    })

    it('Should revert if caller does not have all dividend tokens minted', async () => {
      await timeLock.deposit(toBigNumber(5), duration.days(30))
      await dividendsToken.transfer(wallet1.address, 1)
      await expect(
        timeLock.withdraw(0)
      ).to.be.revertedWith('ERC20: burn amount exceeds balance')
    })

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
          .withArgs(wallet.address, constants.AddressZero, toBigNumber(5))
      })
  
      it('Should withdraw full deposit from sub-delegation module to the caller', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await setNextTimestamp(timestamp + duration.days(100))
        const delegationModule = await timeLock.computeSubDelegationAddress(wallet.address)
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(delegationModule, wallet.address, toBigNumber(5))
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
      it('Should burn dividends token from caller', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await setNextTimestamp(timestamp + duration.days(100))
        await expect(timeLock.withdraw(0))
          .to.emit(dividendsToken, 'Transfer')
          .withArgs(wallet.address, constants.AddressZero, toBigNumber(5))
      })
  
      it('Should withdraw full deposit from sub-delegation to the timelock contract', async () => {
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        const delegationModule = await timeLock.computeSubDelegationAddress(wallet.address)
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(delegationModule, timeLock.address, toBigNumber(5))
      })
  
      it('Should transfer deposit less fees to the caller', async () => {
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        const timestamp = await latest()
        await setNextTimestamp(timestamp + duration.days(1))
        const fee = toBigNumber(1).mul(29).div(30)
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(timeLock.address, wallet.address, toBigNumber(5).sub(fee))
        expect(await depositToken.balanceOf(timeLock.address)).to.eq(fee)
      })
  
      it('Should delete lock', async () => {
        await timeLock.deposit(toBigNumber(5), duration.days(30))
        await timeLock.withdraw(0)
        expect(await timeLock.locks(0)).to.deep.eq([
          constants.Zero, 0, 0, constants.AddressZero
        ])
        expect(await timeLock.getLocksLength()).to.eq(1)
      })
    })
  })

  describe('delegate()', () => {
    it('Should delegate from sub-delegation module for caller to delegatee', async () => {
      const delegationModule = await timeLock.computeSubDelegationAddress(wallet.address)
      await expect(timeLock.delegate(wallet1.address))
        .to.emit(depositToken, 'Delegate')
        .withArgs(delegationModule, wallet1.address)
    })
  })
})