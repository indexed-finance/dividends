import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestDelegationModule } from '../typechain/TestDelegationModule';
import { TestERC20 } from '../typechain/TestERC20';
import { toBigNumber } from './shared/utils';

describe('DelegationModule', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let module: TestDelegationModule;
  let depositToken: TestERC20

  beforeEach('Deploy fixtures', async () => {
    const erc20Factory = await ethers.getContractFactory('TestERC20')
    depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20
    const factory = await ethers.getContractFactory('TestDelegationModule')
    module = (await factory.deploy(depositToken.address)) as TestDelegationModule
    await depositToken.mint(wallet.address, toBigNumber(10))
    await depositToken.approve(module.address, toBigNumber(10))
  })

  describe('_depositToModule', () => {
    it('Should revert if transfer fails', async () => {
      await expect(module.depositToModule(wallet.address, toBigNumber(11))).to.be.revertedWith('STF')
    })

    it('Should deposit to sub-delegation module', async () => {
      await module.depositToModule(wallet.address, toBigNumber(5))
      const moduleAddress = await module.computeSubDelegationAddress(wallet.address)
      expect(await depositToken.balanceOf(moduleAddress)).to.eq(toBigNumber(5))
    })
  })

  describe('_withdrawFromModule', () => {
    it('Should revert if module does not have enough tokens', async () => {
      await expect(module.withdrawFromModule(wallet.address, wallet.address, toBigNumber(5)))
        .to.be.revertedWith('Create2: Failed on deploy')
    })

    it('Should withdraw amount from module', async () => {
      await module.depositToModule(wallet.address, toBigNumber(5))
      const moduleAddress = await module.computeSubDelegationAddress(wallet.address)
      expect(await depositToken.balanceOf(moduleAddress)).to.eq(toBigNumber(5))
      await module.withdrawFromModule(wallet.address, wallet1.address, toBigNumber(3))
      expect(await depositToken.balanceOf(moduleAddress)).to.eq(toBigNumber(2))
      expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(3))
    })

    it('Should revert if deployment runs out of gas', async () => {
      await module.depositToModule(wallet.address, toBigNumber(5))
      const gas = await module.estimateGas.withdrawFromModule(wallet.address, wallet1.address, toBigNumber(5))
      await expect(
        module.withdrawFromModule(wallet.address, wallet1.address, toBigNumber(5), { gasLimit: gas.sub(5000) })
      ).to.be.revertedWith('Create2: Failed on deploy')
    })
  })

  describe('_delegateFromModule', () => {
    it('Should set delegate for account', async () => {
      const moduleAddress = await module.computeSubDelegationAddress(wallet.address)
      await expect(module.delegateFromModule(wallet.address, wallet1.address))
        .to.emit(depositToken, 'Delegate')
        .withArgs(moduleAddress, wallet1.address)
      expect(await depositToken.delegates(moduleAddress)).to.eq(wallet1.address)
    })

    it('Should revert if deployment runs out of gas', async () => {
      const gas = await module.estimateGas.delegateFromModule(wallet.address, wallet1.address)
      await expect(module.delegateFromModule(wallet.address, wallet1.address, { gasLimit: gas.sub(5000) })).to.be.revertedWith('Create2: Failed on deploy')
    })
  })
})