import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { ERC20DividendsOwned } from '../typechain/ERC20DividendsOwned';
import { createBalanceCheckpoint, getTransactionCost, POINTS_MULTIPLIER, toBigNumber } from './shared/utils';
import { BigNumber, constants } from 'ethers';
import { TestERC20 } from '../typechain';

describe('ERC20DividendsOwned', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let erc20: ERC20DividendsOwned;
  let weth: TestERC20

  const getPointsPerShare = (amount: BigNumber, totalSupply: BigNumber) => amount.mul(POINTS_MULTIPLIER).div(totalSupply);

  beforeEach('Deploy contracts', async () => {
    weth = await (await ethers.getContractFactory('TestERC20')).deploy('NDX', 'NDX') as TestERC20
    const factory = await ethers.getContractFactory('ERC20DividendsOwned')
    erc20 = (await factory.deploy(weth.address, 'DNDX', 'DNDX')) as ERC20DividendsOwned;
  })

  describe('mint', () => {
    it('Should increase balance and supply', async () => {
      await erc20.mint(wallet.address, toBigNumber(10))
      expect(await erc20.balanceOf(wallet.address)).to.eq(toBigNumber(10))
      expect(await erc20.totalSupply()).to.eq(toBigNumber(10))
    })

    it('Should revert if caller is not owner', async () => {
      await expect(erc20.connect(wallet1).mint(wallet.address, 1)).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('burn', () => {
    it('Should reduce balance and supply', async () => {
      await erc20.mint(wallet.address, toBigNumber(10))
      await erc20.burn(wallet.address, toBigNumber(10))
      expect(await erc20.balanceOf(wallet.address)).to.eq(0)
      expect(await erc20.totalSupply()).to.eq(0)
    })

    it('Should revert if caller is not owner', async () => {
      await expect(erc20.connect(wallet1).burn(wallet.address, 1)).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  const prepareDividends = async () => {
    await erc20.mint(wallet.address, toBigNumber(1))
    await weth.deposit({ value: toBigNumber(1) })
    await weth.approve(erc20.address, toBigNumber(1))
    await erc20['distribute(uint256)'](toBigNumber(1))
  }

  describe('distribute(uint256)', () => {
    it('Should transfer tokens from caller and increase points per share', async () => {
      await prepareDividends()
      expect(await erc20.pointsPerShare()).to.eq(getPointsPerShare(toBigNumber(1), toBigNumber(1)))
    })
  })

  describe('distribute()', () => {
    it('Should distribute eth sent in call and wrap as WETH', async () => {
      await erc20.mint(wallet.address, toBigNumber(1))
      await expect(erc20['distribute()']({ value: toBigNumber(1) }))
        .to.emit(weth, 'Transfer')
        .withArgs(constants.AddressZero, erc20.address, toBigNumber(1))
        .to.emit(erc20, 'DividendsDistributed')
        .withArgs(wallet.address, toBigNumber(1))
      expect(await erc20.pointsPerShare()).to.eq(getPointsPerShare(toBigNumber(1), toBigNumber(1)))
    })
  })

  describe('collect', () => {
    it('Should claim owed dividends as WETH', async () => {
      await prepareDividends()
      await expect(erc20.collect())
        .to.emit(weth, 'Transfer')
        .withArgs(erc20.address, wallet.address, toBigNumber(1))
        .to.emit(erc20, 'DividendsWithdrawn')
        .withArgs(wallet.address, toBigNumber(1))
    })
  })

  describe('collectETH', () => {
    it('Should claim owed dividends as ETH', async () => {
      await prepareDividends()
      const getBalDiff = await createBalanceCheckpoint(null, wallet.address)
      const tx = await erc20.collectETH()
      const gasCost = await getTransactionCost(tx)
      expect(await getBalDiff()).to.eq(toBigNumber(1).sub(gasCost))
    })
  })
})