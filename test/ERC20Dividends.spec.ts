import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20Dividends } from '../typechain/TestERC20Dividends';
import { POINTS_MULTIPLIER, toBigNumber } from './shared/utils';
import { BigNumber } from 'ethers';

describe('ERC20Dividends', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let erc20: TestERC20Dividends;

  beforeEach('Deploy TestERC20Dividends', async () => {
    const factory = await ethers.getContractFactory('TestERC20Dividends')
    erc20 = (await factory.deploy()) as TestERC20Dividends;
  })

  const getPointsPerShare = (amount: BigNumber, totalSupply: BigNumber) => amount.mul(POINTS_MULTIPLIER).div(totalSupply);

  describe('mint', () => {
    it('Should increase balance and supply', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      expect(await erc20.totalSupply()).to.eq(amount)
      expect(await erc20.balanceOf(wallet.address)).to.eq(amount)
    })

    it('Should not change pointsCorrection if points distributed is 0', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      expect(await erc20.getPointsCorrection(wallet.address)).to.eq(0)
    })

    it('Should decrease pointsCorrection if points distributed is >0', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      await erc20.distributeDividends(toBigNumber(5))
      await erc20.mint(wallet.address, amount)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await erc20.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare).mul(-1))
    })
  })

  describe('burn', () => {
    it('Should revert if amount exceeds balance', async () => {
      await expect(erc20.burn(wallet.address, 1)).to.be.revertedWith('burn amount exceeds balance')
    })

    describe('When no disbursals have occurred', () => {
      it('Should not change pointsCorrection', async () => {
        const amount = toBigNumber(10)
        await erc20.mint(wallet.address, amount)
        await erc20.burn(wallet.address, amount)
        expect(await erc20.getPointsCorrection(wallet.address)).to.eq(0)
      })
    })

    describe('When a disbursal has occurred', () => {
      describe('When caller received tokens before disbursal', () => {
        it('Should increase pointsCorrection', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.distributeDividends(amount)
          await erc20.burn(wallet.address, amount)
          const pointsPerShare = getPointsPerShare(amount, amount);
          expect(await erc20.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare))
        })

        it('Should allow caller to withdraw dividends earned before burn', async () => {
          const amount = toBigNumber(10)
          await erc20.mint(wallet.address, amount)
          await erc20.distributeDividends(toBigNumber(5).add(1))
          await erc20.burn(wallet.address, amount)
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5))
        })
      })

      describe('When caller received tokens after disbursal', () => {
        it('Should not allow caller to withdraw dividends disbursed before receipt of tokens', async () => {
          const amount = toBigNumber(10)
          await erc20.mint(wallet.address, amount)
          await erc20.distributeDividends(toBigNumber(5))
          await erc20.mint(wallet1.address, amount)
          await erc20.burn(wallet1.address, amount)
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(0)
        })
      })
    })
  })

  describe('transfer', () => {
    it('Should not affect pointsCorrection if points distributed is 0', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      await erc20.transfer(wallet1.address, amount)
      expect(await erc20.totalSupply()).to.eq(amount)
      expect(await erc20.balanceOf(wallet.address)).to.eq(0)
      expect(await erc20.balanceOf(wallet1.address)).to.eq(amount)
      expect(await erc20.getPointsCorrection(wallet.address)).to.eq(0)
      expect(await erc20.getPointsCorrection(wallet1.address)).to.eq(0)
    })

    it('Should increase pointsCorrection for sender and decrease for recipient', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      await erc20.distributeDividends(toBigNumber(5))
      await erc20.transfer(wallet1.address, amount)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await erc20.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare))
      expect(await erc20.getPointsCorrection(wallet1.address)).to.eq(amount.mul(pointsPerShare).mul(-1))
    })

    it('Sender should be able to claim dividends, but not recipient', async () => {
      const amount = toBigNumber(10)
      await erc20.mint(wallet.address, amount)
      await erc20.distributeDividends(toBigNumber(5))
      await erc20.transfer(wallet1.address, amount)
      expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5).sub(1))
      expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(0)
    })
  })

  describe('distributeDividends', () => {
    it('Should revert if total supply is 0', async () => {
      await expect(erc20.distributeDividends(1)).to.be.revertedWith('SHARES')
    })

    it('Should increase pointsPerShare', async () => {
      await erc20.mint(wallet.address, toBigNumber(100))
      await erc20.distributeDividends(toBigNumber(10))
      expect(await erc20.pointsPerShare()).to.eq(POINTS_MULTIPLIER.div(10))
    })

    it('Should do nothing if amount is 0', async () => {
      await erc20.mint(wallet.address, toBigNumber(100))
      await erc20.distributeDividends(0)
      expect(await erc20.pointsPerShare()).to.eq(0)
    })
  })

  describe('prepareCollect', () => {
    it('Does nothing if user balance or dividends are 0', async () => {
      await erc20.prepareCollect(wallet.address)
      expect(await erc20.withdrawnDividendsOf(wallet.address)).to.eq(0)
    })

    it('Updates withdrawnDividends', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeDividends(toBigNumber(10))
      await erc20.prepareCollect(wallet.address)
      expect(await erc20.withdrawnDividendsOf(wallet.address)).to.eq(toBigNumber(10))
      expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(0)
    })
  })

  describe('cumulativeDividendsOf', () => {
    it('Should store total dividends for one user', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeDividends(toBigNumber(10))
      expect(await erc20.cumulativeDividendsOf(wallet.address)).to.eq(toBigNumber(10))
      await erc20.distributeDividends(toBigNumber(5))
      expect(await erc20.cumulativeDividendsOf(wallet.address)).to.eq(toBigNumber(15))
    })

    it('Should leave (amount*multiplier)%supply as dust', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeDividends(toBigNumber(10).add(1))
      expect(await erc20.cumulativeDividendsOf(wallet.address)).to.eq(toBigNumber(10))
    })

    it('Should not add dividends if no new points since caller received tokens', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeDividends(toBigNumber(10).add(1))
      expect(await erc20.cumulativeDividendsOf(wallet.address)).to.eq(toBigNumber(10))
      await erc20.mint(wallet.address, toBigNumber(5))
      expect(await erc20.cumulativeDividendsOf(wallet.address)).to.eq(toBigNumber(10))
    })
  })

  describe('Behavior', () => {
    describe('When dividends are disbursed', () => {
      it('Holders receive pro-rata shares of dividends', async () => {
        await erc20.mint(wallet.address, toBigNumber(5))
        await erc20.mint(wallet1.address, toBigNumber(10))
        await erc20.mint(wallet2.address, toBigNumber(85))
        await erc20.distributeDividends(toBigNumber(10).add(1))
        expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5, 17))
        expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(1))
        expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
      })

      describe('When a holder transfers all shares after', () => {
        it('Dividends earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeDividends(toBigNumber(10).add(1))
          await erc20.transfer(wallet.address, toBigNumber(5))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })
      })

      describe('When a holder burns all shares after', () => {
        it('Dividends earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeDividends(toBigNumber(10).add(1))
          await erc20.burn(wallet.address, toBigNumber(5))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder does not earn dividends distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeDividends(toBigNumber(6).add(1))
          await erc20.burn(wallet.address, amount)
          await erc20.distributeDividends(toBigNumber(6).add(1))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(2))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(5))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(5))
        })
      })

      describe('When a holder burns some shares after', () => {
        it('Dividends earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeDividends(toBigNumber(10).add(1))
          await erc20.burn(wallet.address, toBigNumber(3))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder earns pro-rata share of dividends distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeDividends(toBigNumber(6).add(1))
          await erc20.burn(wallet.address, toBigNumber(3))
          await erc20.distributeDividends(toBigNumber(6).add(1))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(3))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(45, 17))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(45, 17))
        })
      })

      describe('When a holder receives some shares after', () => {
        it('Dividends earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeDividends(toBigNumber(10).add(1))
          await erc20.mint(wallet.address, toBigNumber(3))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder earns pro-rata share of dividends distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeDividends(toBigNumber(6).add(1))
          await erc20.mint(wallet.address, amount)
          await erc20.distributeDividends(toBigNumber(20).add(1))
          expect(await erc20.withdrawableDividendsOf(wallet.address)).to.eq(toBigNumber(12))
          expect(await erc20.withdrawableDividendsOf(wallet1.address)).to.eq(toBigNumber(7))
          expect(await erc20.withdrawableDividendsOf(wallet2.address)).to.eq(toBigNumber(7))
        })
      })
    })
  })
})