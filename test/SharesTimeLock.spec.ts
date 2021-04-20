import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20 } from '../typechain/TestERC20';
import { ERC20NonTransferableDividendsOwned } from '../typechain/ERC20NonTransferableDividendsOwned';
import { SharesTimeLock } from '../typechain/SharesTimeLock';
import { SharesTimeLock__factory } from '../typechain/factories/SharesTimeLock__factory';
import { toBigNumber } from './shared/utils';
import { advanceBlock, duration, latest, setNextTimestamp } from './shared/time';
import { constants, BigNumber } from 'ethers';

const receiver = '0x0000000000000000000000000000000000000001';
const RATIO = {
  d30: '333333333333333333',
  d60: '666666666666666666',
  d90: '1000000000000000000'
}

const curveRatio = [
  1,
  2,
  3,
  4,
  5,
  6,
  83333333333300000, // 6 
  105586554548800000, // 7 
  128950935744800000, // 8
  153286798191400000, // 9
  178485723463700000, // 10
  204461099502300000, // 11
  231142134539100000, // 12
  258469880674300000, // 13
  286394488282000000, // 14
  314873248847800000, // 15
  343869161986300000, // 16
  373349862059400000, // 17
  403286798191400000, // 18
  433654597035900000, // 19
  464430560048100000, // 20
  495594261536300000, // 21
  527127223437300000, // 22
  559012649336100000, // 23
  591235204823000000, // 24
  623780834516600000, // 25
  656636608405400000, // 26
  689790591861100000, // 27
  723231734933100000, // 28
  756949777475800000, // 29
  790935167376600000, // 30
  825178989697100000, // 31
  859672904965600000, // 32
  894409095191000000, // 33
  929380216424000000, // 34
  964579356905500000, // 35
  1000000000000000000 // 36
];

const MINTIME = duration.months(6);
const MAXTIME = duration.months(36);

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
      MINTIME,
      MAXTIME,
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
        expect(await timeLock.minLockDuration()).to.eq(MINTIME)
      })
  
      it('maxLockDuration', async () => {
        expect(await timeLock.maxLockDuration()).to.eq(MAXTIME)
      })
  
    })
  })

  describe('getDividendsMultiplier()', () => {

    it('Should revert if duration less than minimum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.months(3))).to.be.revertedWith('getDividendsMultiplier: Duration not correct')
    })

    it('Should revert if duration higher than maximum', async () => {
      await expect(timeLock.getDividendsMultiplier(duration.months(37))).to.be.revertedWith('getDividendsMultiplier: Duration not correct')
    })

    it('Should return 0.0833333333333 for min duration in this case', async () => {
      expect(await timeLock.getDividendsMultiplier(duration.months(6))).to.eq(curveRatio[6].toString())
    })

    for (let index = 6; index < curveRatio.length; index++) {
      it('Should return correct ratio for month ' + index, async () => {
        expect(await timeLock.getDividendsMultiplier(duration.months(index))).to.eq(curveRatio[index].toString())
      })
      
    }
    
  })

  describe('depositByMonths()', () => {
    it('Should revert if transfer fails', async () => {
      await expect(
        timeLock.depositByMonths(toBigNumber(11), MINTIME, receiver)
      ).to.be.revertedWith('STF')
    })

    it('Should revert if duration < minLockDuration', async () => {
      await expect(
        timeLock.depositByMonths(toBigNumber(10), 5, receiver)
      ).to.be.revertedWith('getDividendsMultiplier: Duration not correct')
    })

    it('Should revert if duration > maxLockDuration', async () => {
      await expect(
        timeLock.depositByMonths(toBigNumber(10), 37, receiver)
      ).to.be.revertedWith('getDividendsMultiplier: Duration not correct')
    })

    it('Should deposit amount to sharesTimeLock contract', async () => {
      await timeLock.depositByMonths(toBigNumber(5), 6, receiver)
      expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(5))
      await timeLock.depositByMonths(toBigNumber(5), 6, receiver)
      expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(10))
    })

    it('Should deposit dividend token to the receiver address', async () => {
      await timeLock.depositByMonths(toBigNumber(5), 6, receiver)
      expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(5))
      expect(await dividendsToken.balanceOf(receiver)).to.gt(toBigNumber(0));
    })

    it('Should push to locks', async () => {
      await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
      const timestamp = await latest()
      expect(await timeLock.locks(0)).to.deep.eq([
        toBigNumber(5),
        timestamp,
        MINTIME,
        wallet.address
      ])
      expect(await timeLock.getLocksLength()).to.eq(1)
    })

    it('Should mint amount times multiplier', async () => {

      const expected = BigNumber.from(5).mul(BigNumber.from(curveRatio[6].toString()));
      
      await expect(timeLock.depositByMonths(toBigNumber(5), 6, wallet.address))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, expected.toString())

      // To receiver now
      await expect(timeLock.depositByMonths(toBigNumber(5), 6, receiver))
        .to.emit(dividendsToken, 'Transfer')
        .withArgs(constants.AddressZero, receiver, expected.toString())
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
      await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
      await expect(
        timeLock.connect(wallet1).withdraw(0)
      ).to.be.revertedWith('!owner')
    })

    describe('When timelock has passed', () => {
      it('Should burn dividends token from caller', async () => {
        const expected = BigNumber.from(5).mul(BigNumber.from(curveRatio[6].toString()));
        const timestamp = await latest()
        await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
        //Note: since we are using an AVG for second in months, it could be of of a few seconds
        await setNextTimestamp(timestamp + duration.months(6) + duration.seconds(5) )
        await expect(timeLock.withdraw(0))
          .to.emit(dividendsToken, 'Transfer')
          .withArgs(wallet.address, constants.AddressZero, expected.toString() )
      })
  
      it('Should withdraw full deposit from SharesTimeLock to the caller', async () => {
        const timestamp = await latest()
        await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
        await setNextTimestamp(timestamp + duration.months(6) + duration.seconds(5) )
        await expect(timeLock.withdraw(0))
          .to.emit(depositToken, 'Transfer')
          .withArgs(timeLock.address, wallet.address, toBigNumber(5))
      })
  
      it('Should delete lock', async () => {
        const timestamp = await latest()
        await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
        await setNextTimestamp(timestamp + duration.months(6) + duration.seconds(5) )
        await timeLock.withdraw(0)
        expect(await timeLock.locks(0)).to.deep.eq([
          constants.Zero, 0, 0, constants.AddressZero
        ])
        expect(await timeLock.getLocksLength()).to.eq(1)
      })
    })

    describe('When timelock has not passed', () => {
      it('Should revert on early withdraw', async () => {
        await timeLock.depositByMonths(toBigNumber(5), 6, wallet.address)
        const timestamp = await latest()
        await setNextTimestamp(timestamp + duration.days(1))
        await expect(timeLock.withdraw(0)).to.be.revertedWith("lock not expired")
      })
    })
  })

  describe('eject()', () => {
    //TODO
  })

  describe('setMinLockAmount()', () => {
    //TODO
  })

  describe('boostToMax()', () => {
    //TODO
  })
  
})