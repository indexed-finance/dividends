import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20 } from '../typechain/TestERC20';
import { ERC20DividendsOwned } from '../typechain/ERC20DividendsOwned';
import { SharesTimeLock } from '../typechain/SharesTimeLock';
import { toBigNumber } from './shared/utils';
import { advanceBlock, duration, latest, setNextTimestamp } from './shared/time';
import { constants } from 'ethers';
import { getContractAddress } from '@ethersproject/address';

const minLockDuration = duration.days(90);
const maxLockDuration = duration.days(720);
const minEarlyWithdrawalFee = toBigNumber(1, 17) // 10%
const baseEarlyWithdrawalFee = toBigNumber(1, 17) 
const maxDividendsBonusMultiplier = toBigNumber(2) // 200%

describe('SharesTimelock', () => {
  let [wallet, wallet1] = waffle.provider.getWallets()
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
      minLockDuration,
      maxLockDuration,
      minEarlyWithdrawalFee,
      baseEarlyWithdrawalFee,
      maxDividendsBonusMultiplier
    )) as SharesTimeLock
    await depositToken.mint(wallet.address, toBigNumber(10))
    await depositToken.approve(timeLock.address, toBigNumber(10))
    await dividendsToken.transferOwnership(timeLock.address)
  })

  describe('Constructor', () => {
    it('Should revert if maxLockDuration <= minLockDuration', async () => {
      const factory = await ethers.getContractFactory('SharesTimeLock')
      await expect(factory.deploy(
        depositToken.address,
        dividendsToken.address,
        duration.days(30),
        duration.days(30),
        toBigNumber(1),
        toBigNumber(1),
        toBigNumber(1)
      )).to.be.revertedWith('min>=max')
    })

    it('Should revert if maxEarlyWithdrawalFee > 1', async () => {
      const factory = await ethers.getContractFactory('SharesTimeLock')
      await expect(factory.deploy(
        depositToken.address,
        dividendsToken.address,
        minLockDuration,
        maxLockDuration,
        toBigNumber(1, 16),
        toBigNumber(5, 17),
        toBigNumber(2)
      )).to.be.revertedWith('maxFee')
    })

    describe('Settings', () => {
      it('depositToken', async () => {
        expect(await timeLock.depositToken()).to.eq(depositToken.address)
      })
  
      it('dividendsToken', async () => {
        expect(await timeLock.dividendsToken()).to.eq(dividendsToken.address)
      })
  
      it('minLockDuration', async () => {
        expect(await timeLock.minLockDuration()).to.eq(minLockDuration)
      })
  
      it('maxLockDuration', async () => {
        expect(await timeLock.maxLockDuration()).to.eq(maxLockDuration)
      })
  
      it('maxDividendsBonusMultiplier', async () => {
        expect(await timeLock.maxDividendsBonusMultiplier()).to.eq(maxDividendsBonusMultiplier)
      })
  
      it('minEarlyWithdrawalFee', async () => {
        expect(await timeLock.minEarlyWithdrawalFee()).to.eq(minEarlyWithdrawalFee)
      })
  
      it('baseEarlyWithdrawalFee', async () => {
        expect(await timeLock.baseEarlyWithdrawalFee()).to.eq(baseEarlyWithdrawalFee)
      })
    })
  })

  describe('getDividendsMultiplier()', () => {
    it('Should revert if duration less than minimum', async () => {
      await expect(timeLock.getDividendsMultiplier(minLockDuration - 1)).to.be.revertedWith('OOB')
    })

    it('Should revert if duration higher than maximum', async () => {
      await expect(timeLock.getDividendsMultiplier(maxLockDuration + 1)).to.be.revertedWith('OOB')
    })

    it('Should return 1e18 for minimum duration', async () => {
      expect(await timeLock.getDividendsMultiplier(minLockDuration)).to.eq(toBigNumber(1))
    })

    it('Should return 1e18 + max bonus for maximum duration', async () => {
      expect(await timeLock.getDividendsMultiplier(maxLockDuration)).to.eq(maxDividendsBonusMultiplier.add(toBigNumber(1)))
    })

    it('Should return 1 + bonus/2 for duration between min/max', async () => {
      expect(
        await timeLock.getDividendsMultiplier(minLockDuration + (maxLockDuration - minLockDuration) / 2)
      ).to.eq(maxDividendsBonusMultiplier.div(2).add(toBigNumber(1)))
    })
  })

  describe('setMinimumDeposit', () => {
    it('Should revert if not called by owner', async () => {
      await expect(timeLock.connect(wallet1).setMinimumDeposit(1)).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should set minimumDeposit', async () => {
      await expect(timeLock.setMinimumDeposit(10))
        .to.emit(timeLock, 'MinimumDepositSet')
        .withArgs(10)
      expect(await timeLock.minimumDeposit()).to.eq(10)
    })
  })

  describe('deposit()', () => {
    it('Should revert if transfer fails', async () => {
      await expect(
        timeLock.deposit(toBigNumber(11), minLockDuration)
      ).to.be.revertedWith('STF')
    })

    it('Should revert if duration < minLockDuration', async () => {
      await expect(
        timeLock.deposit(toBigNumber(10), minLockDuration - 1)
      ).to.be.revertedWith('OOB')
    })

    it('Should revert if duration > maxLockDuration', async () => {
      await expect(
        timeLock.deposit(toBigNumber(10), maxLockDuration + 1)
      ).to.be.revertedWith('OOB')
    })

    it('Should revert if amount < minimumDeposit', async () => {
      await timeLock.setMinimumDeposit(100)
      await expect(
        timeLock.deposit(99, maxLockDuration)
      ).to.be.revertedWith('min deposit')
    })

    it('Should revert if emergency unlock triggered', async () => {
      await timeLock.triggerEmergencyUnlock()
      await expect(timeLock.deposit(99, maxLockDuration))
        .to.be.revertedWith('deposits blocked')
    })

    it('Should deposit amount to the sub-delegation module of the caller', async () => {
      const delegationModule = getContractAddress({ from: timeLock.address, nonce: 2 })
      await timeLock.deposit(toBigNumber(5), minLockDuration)
      expect(await depositToken.balanceOf(delegationModule)).to.eq(toBigNumber(5))
      await timeLock.deposit(toBigNumber(5), minLockDuration)
      expect(await depositToken.balanceOf(delegationModule)).to.eq(toBigNumber(10))
    })

    it('Should push to locks', async () => {
      await expect(timeLock.deposit(toBigNumber(5), minLockDuration))
        .to.emit(timeLock, 'LockCreated')
        .withArgs(0, wallet.address, toBigNumber(5), minLockDuration)
      const timestamp = await latest()
      expect(await timeLock.locks(0)).to.deep.eq([
        toBigNumber(5),
        timestamp,
        minLockDuration,
        wallet.address
      ])
      expect(await timeLock.getLocksLength()).to.eq(1)
    })

    it('Should mint amount times multiplier', async () => {
      await expect(timeLock.deposit(toBigNumber(5), minLockDuration))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(5))
      await expect(timeLock.deposit(toBigNumber(5), maxLockDuration))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, toBigNumber(15))
    })
  })

  describe('triggerEmergencyUnlock()', async () => {
    it('Should revert if not called by owner', async () => {
      await expect(timeLock.connect(wallet1).triggerEmergencyUnlock())
        .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if already triggered', async () => {
      await timeLock.triggerEmergencyUnlock()
      await expect(timeLock.triggerEmergencyUnlock())
        .to.be.revertedWith('already triggered')
    })

    it('Should set emergencyUnlockTriggered to true', async () => {
      await timeLock.triggerEmergencyUnlock()
      expect(await timeLock.emergencyUnlockTriggered()).to.be.true
    })
  })

  describe('getWithdrawalParameters()', () => {
    describe('When lock duration has passed', () => {
      describe('When lock duration is minimum', async () => {
        it('Should return lock amount for dividendShares', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + minLockDuration)
          await advanceBlock()
          const { dividendShares } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, minLockDuration)
          expect(dividendShares).to.eq(toBigNumber(1))
        })

        it('Should return 0 for fee', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + minLockDuration)
          await advanceBlock()
          const { earlyWithdrawalFee } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, minLockDuration)
          expect(earlyWithdrawalFee).to.eq(0)
        })
      })

      describe('When lock duration is maximum', async () => {
        it('Should return lock amount times maximum multiplier for dividendShares', async () => {
          await timeLock.deposit(toBigNumber(1), maxLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + maxLockDuration)
          await advanceBlock()
          const { dividendShares } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, maxLockDuration)
          expect(dividendShares).to.eq(toBigNumber(3))
        })

        it('Should return 0 for fee', async () => {
          await timeLock.deposit(toBigNumber(1), maxLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + maxLockDuration)
          await advanceBlock()
          const { earlyWithdrawalFee } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, maxLockDuration)
          expect(earlyWithdrawalFee).to.eq(0)
        })
      })
    })

    describe('When lock duration has not passed', () => {
      describe('When lock duration is minimum', async () => {
        it('Should return lock amount for dividendShares', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await advanceBlock()
          const { dividendShares } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, minLockDuration)
          expect(dividendShares).to.eq(toBigNumber(1))
        })

        it('Should return minimum fee plus base fee', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          const { earlyWithdrawalFee } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, minLockDuration)
          expect(earlyWithdrawalFee).to.eq(toBigNumber(2, 17))
        })

        it('Should give no fee if emergency unlock has been triggered', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await advanceBlock()
          await timeLock.triggerEmergencyUnlock();
          const { dividendShares, earlyWithdrawalFee } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, minLockDuration)
          expect(dividendShares).to.eq(toBigNumber(1))
          expect(earlyWithdrawalFee).to.eq(0)
        })
      })

      describe('When lock duration is maximum', async () => {
        it('Should return lock amount times maximum multiplier for dividendShares', async () => {
          await timeLock.deposit(toBigNumber(1), maxLockDuration)
          const timestamp = await latest()
          const { dividendShares } = await timeLock.getWithdrawalParameters(toBigNumber(1, 18), timestamp, maxLockDuration)
          expect(dividendShares).to.eq(toBigNumber(3))
          
        })

        it('Should return minimum fee plus base fee times max multiplier', async () => {
          await timeLock.deposit(toBigNumber(1), maxLockDuration)
          const timestamp = await latest()
          const { earlyWithdrawalFee } = await timeLock.getWithdrawalParameters(toBigNumber(1), timestamp, maxLockDuration)
          expect(earlyWithdrawalFee).to.eq(toBigNumber(4, 17))
        })
      })
    })
  })

  describe('withdraw()', () => {
    it('Should revert if lockId does not exist', async () => {
      await expect(timeLock.withdraw(1)).to.be.reverted
    })

    it('Should revert if caller does not have all dividend tokens minted', async () => {
      await timeLock.deposit(toBigNumber(5), minLockDuration)
      await dividendsToken.transfer(wallet1.address, 1)
      await expect(
        timeLock.withdraw(0)
      ).to.be.revertedWith('ERC20: burn amount exceeds balance')
    })

    it('Should revert if caller is not the owner', async () => {
      await timeLock.deposit(toBigNumber(5), minLockDuration)
      await expect(
        timeLock.connect(wallet1).withdraw(0)
      ).to.be.revertedWith('!owner')
    })

    describe('When timelock has passed', () => {
      it('Should burn dividends token from caller', async () => {
        await timeLock.deposit(toBigNumber(5), minLockDuration)
        await expect(timeLock.withdraw(0))
          .to.emit(dividendsToken, 'Transfer')
          .withArgs(wallet.address, constants.AddressZero, toBigNumber(5))
      })
  
      it('Should withdraw full deposit from sub-delegation module to the caller', async () => {
        const timestamp = await latest()
        await timeLock.deposit(toBigNumber(5), minLockDuration)
        await setNextTimestamp(timestamp + duration.days(100))
        const delegationModule = getContractAddress({ from: timeLock.address, nonce: 2 })
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(delegationModule, wallet.address, toBigNumber(5))
      })
  
      it('Should delete lock', async () => {
        await timeLock.deposit(toBigNumber(5), minLockDuration)
        await timeLock.withdraw(0)
        expect(await timeLock.locks(0)).to.deep.eq([
          constants.Zero, 0, 0, constants.AddressZero
        ])
        expect(await timeLock.getLocksLength()).to.eq(1)
      })
    })

    describe('When timelock has not passed', () => {
      describe('When emergency unlock has not been triggered', () => {
        it('Should burn dividends token from caller', async () => {
          await timeLock.deposit(toBigNumber(5), minLockDuration)
          await expect(timeLock.withdraw(0))
            .to.emit(dividendsToken, 'Transfer')
            .withArgs(wallet.address, constants.AddressZero, toBigNumber(5))
        })
    
        it('Should withdraw full deposit from sub-delegation to the timelock contract', async () => {
          await timeLock.deposit(toBigNumber(5), minLockDuration)
          const delegationModule = getContractAddress({ from: timeLock.address, nonce: 2 })
          await expect(timeLock.withdraw(0))
            .to.emit(depositToken, 'Transfer')
            .withArgs(delegationModule, timeLock.address, toBigNumber(5))
        })
    
        it('Should transfer deposit less fees to the caller', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + (minLockDuration / 2))
          const earlyWithdrawalFee = toBigNumber(15, 16)
  
          await expect(timeLock.withdraw(0))
            .to.emit(depositToken, 'Transfer')
            .withArgs(timeLock.address, wallet.address, toBigNumber(1).sub(earlyWithdrawalFee))
          expect(await depositToken.balanceOf(timeLock.address)).to.eq(earlyWithdrawalFee)
        })
    
        it('Should delete lock', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + (minLockDuration / 2))
          await expect(timeLock.withdraw(0))
            .to.emit(timeLock, 'LockDestroyed')
            .withArgs(0, wallet.address, toBigNumber(85, 16))
          expect(await timeLock.locks(0)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
          ])
          expect(await timeLock.getLocksLength()).to.eq(1)
        })
    
        it('Should emit FeesReceived', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + (minLockDuration / 2))
          await expect(timeLock.withdraw(0))
            .to.emit(timeLock, 'FeesReceived')
            .withArgs(toBigNumber(15, 16))
        })
  
        it('Should add fee to pendingFees', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          const timestamp = await latest()
          await setNextTimestamp(timestamp + duration.days(1))
          const fee = minEarlyWithdrawalFee.add(
            baseEarlyWithdrawalFee
              .mul(minLockDuration - duration.days(1))
              .div(minLockDuration)
          )
          await timeLock.withdraw(0)
          expect(await timeLock.pendingFees()).to.eq(fee)
        })
      })
      describe('When emergency unlock has not been triggered', () => {
        it('Should burn dividends token from caller', async () => {
          await timeLock.deposit(toBigNumber(5), minLockDuration)
          await timeLock.triggerEmergencyUnlock()
          await expect(timeLock.withdraw(0))
            .to.emit(dividendsToken, 'Transfer')
            .withArgs(wallet.address, constants.AddressZero, toBigNumber(5))
        })
    
        it('Should withdraw full deposit from sub-delegation to the owner', async () => {
          await timeLock.deposit(toBigNumber(5), minLockDuration)
          await timeLock.triggerEmergencyUnlock()
          const delegationModule = getContractAddress({ from: timeLock.address, nonce: 2 })
          await expect(timeLock.withdraw(0))
            .to.emit(depositToken, 'Transfer')
            .withArgs(delegationModule, wallet.address, toBigNumber(5))
        })
    
        it('Should delete lock', async () => {
          await timeLock.deposit(toBigNumber(1), minLockDuration)
          await timeLock.triggerEmergencyUnlock()
          await expect(timeLock.withdraw(0))
            .to.emit(timeLock, 'LockDestroyed')
            .withArgs(0, wallet.address, toBigNumber(1))
          expect(await timeLock.locks(0)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
          ])
          expect(await timeLock.getLocksLength()).to.eq(1)
        })
      })
    })
  })

  describe('distributeFees()', () => {
    it('Should revert if pendingFees = 0', async () => {
      await expect(timeLock.distributeFees())
        .to.be.revertedWith('ZF')
    })
    it('Should revert if dividends token has 0 shares', async () => {
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      const timestamp = await latest()
      await setNextTimestamp(timestamp + (minLockDuration / 2))
      await timeLock.withdraw(0)
      await expect(timeLock.distributeFees())
        .to.be.revertedWith('SHARES')
    })

    it('Should emit FeesDistributed', async () => {
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      const timestamp = await latest()
      await setNextTimestamp(timestamp + (minLockDuration / 2))
      await timeLock.withdraw(0)
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      await expect(timeLock.distributeFees())
        .to.emit(timeLock, 'FeesDistributed')
        .withArgs(toBigNumber(15, 16))
    })

    it('Should set pendingFees to 0', async () => {
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      const timestamp = await latest()
      await setNextTimestamp(timestamp + (minLockDuration / 2))
      await timeLock.withdraw(0)
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      await timeLock.distributeFees()
      expect(await timeLock.pendingFees()).to.eq(0)
    })

    it('Should distribute dividends to the dividendsToken', async () => {
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      const timestamp = await latest()
      await setNextTimestamp(timestamp + (minLockDuration / 2))
      await timeLock.withdraw(0)
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      await expect(timeLock.distributeFees())
        .to.emit(dividendsToken, 'DividendsDistributed')
        .withArgs(timeLock.address, toBigNumber(15, 16))
    })
  })

  describe('delegate()', () => {
    it('Should delegate from sub-delegation module for caller to delegatee', async () => {
      await timeLock.deposit(toBigNumber(1), minLockDuration)
      const delegationModule = getContractAddress({ from: timeLock.address, nonce: 2 })
      await expect(timeLock.delegate(wallet1.address))
        .to.emit(depositToken, 'Delegate')
        .withArgs(delegationModule, wallet1.address)
    })
  })
})