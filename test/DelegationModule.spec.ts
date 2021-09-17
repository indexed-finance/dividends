import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { ISubDelegationModule, SubDelegationModuleImplementation, TestDelegationModule, TestERC20 } from '../typechain';
import { toBigNumber } from './shared/utils';
import { constants } from 'ethers';
import { getContractAddress } from '@ethersproject/address';

describe('DelegationModule', () => {
  let [wallet, wallet1] = waffle.provider.getWallets()
  let module: TestDelegationModule
  let depositToken: TestERC20
  let moduleImplementation: SubDelegationModuleImplementation
  let subModule: ISubDelegationModule

  beforeEach('Deploy fixtures', async () => {
    const erc20Factory = await ethers.getContractFactory('TestERC20')
    depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20
    const factory = await ethers.getContractFactory('TestDelegationModule')
    module = (await factory.deploy(depositToken.address)) as TestDelegationModule
    await depositToken.mint(wallet.address, toBigNumber(10))
    await depositToken.approve(module.address, toBigNumber(10))
    moduleImplementation = (await ethers.getContractAt(
      'SubDelegationModuleImplementation',
      await module.moduleImplementation()
    )) as SubDelegationModuleImplementation
    subModule = (await ethers.getContractAt(
      'ISubDelegationModule',
      getContractAddress({ from: module.address, nonce: 2 })
    )) as ISubDelegationModule
  })

  describe('moduleImplementation', () => {
    it('Should have correct token address', async () => {
      expect(await moduleImplementation.token()).to.eq(depositToken.address);
    })

    it('Should have correct module address', async () => {
      expect(await moduleImplementation.module()).to.eq(module.address);
    })
  })

  describe('getOrCreateModule', () => {
    it('Should set a sub-module address for the account', async () => {
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(constants.AddressZero)
      await expect(module.getOrCreateModuleInternal(wallet.address))
        .to.emit(module, 'SubDelegationModuleCreated')
        .withArgs(wallet.address, subModule.address)
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(subModule.address)
    })

    it('Should delegate to the user', async () => {
      expect(await depositToken.delegates(subModule.address)).to.eq(constants.AddressZero)
      await module.getOrCreateModuleInternal(wallet.address)
      expect(await depositToken.delegates(subModule.address)).to.eq(wallet.address)
    })

    it('Should not redeploy on second call', async () => {
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(constants.AddressZero)
      await module.getOrCreateModuleInternal(wallet.address)
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(subModule.address)
      await module.getOrCreateModuleInternal(wallet.address)
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(subModule.address)
    })

    describe('Deployed Module', () => {
      it('Should be an EIP-1167 clone', async () => {
        await module.getOrCreateModuleInternal(wallet.address)
        const expectBytecode = ['0x363d3d373d3d3d363d73', moduleImplementation.address.slice(2).toLowerCase(), '5af43d82803e903d91602b57fd5bf3'].join('')
        expect(await ethers.provider.getCode(subModule.address)).to.eq(expectBytecode)
      })

      it('Delegate should revert if not called by deployer', async () => {
        await module.getOrCreateModuleInternal(wallet.address)
        await expect(subModule.delegate(wallet.address)).to.be.revertedWith('!module')
      })

      it('Transfer should revert if not called by deployer', async () => {
        await module.getOrCreateModuleInternal(wallet.address)
        await expect(subModule.transfer(wallet.address, 0)).to.be.revertedWith('!module')
      })
    })
  })

  describe('_depositToModule', () => {
    it('Should revert if transfer fails', async () => {
      await expect(module.depositToModule(wallet.address, toBigNumber(11))).to.be.revertedWith('STF')
    })

    it('Should deploy sub-delegation module', async () => {
      await expect(module.depositToModule(wallet.address, toBigNumber(5)))
        .to.emit(depositToken, 'Transfer')
        .withArgs(wallet.address, subModule.address, toBigNumber(5))
      expect(await module.subDelegationModuleForUser(wallet.address)).to.eq(subModule.address)
    })

    it('Should deposit to sub-delegation module', async () => {
      await expect(module.depositToModule(wallet.address, toBigNumber(5)))
        .to.emit(depositToken, 'Transfer')
        .withArgs(wallet.address, subModule.address, toBigNumber(5))
      expect(await depositToken.balanceOf(subModule.address)).to.eq(toBigNumber(5))
    })
  })

  describe('_withdrawFromModule', () => {
    it('Should revert if module does not exist', async () => {
      await expect(module.withdrawFromModule(wallet.address, wallet.address, toBigNumber(5)))
        .to.be.reverted;
    })

    it('Should revert if module does not have enough tokens', async () => {
      await module.getOrCreateModuleInternal(wallet.address)
      await expect(module.withdrawFromModule(wallet.address, wallet.address, toBigNumber(5)))
        .to.be.revertedWith('transfer amount exceeds balance')
    })

    it('Should withdraw amount from module', async () => {
      await module.depositToModule(wallet.address, toBigNumber(5))
      expect(await depositToken.balanceOf(subModule.address)).to.eq(toBigNumber(5))
      await expect(module.withdrawFromModule(wallet.address, wallet1.address, toBigNumber(3)))
        .to.emit(depositToken, 'Transfer')
        .withArgs(subModule.address, wallet1.address, toBigNumber(3))
      expect(await depositToken.balanceOf(subModule.address)).to.eq(toBigNumber(2))
      expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(3))
    })
  })

  describe('_delegateFromModule', () => {
    it('Should revert if module does not exist', async () => {
      await expect(module.delegateFromModule(wallet.address, wallet.address))
        .to.be.reverted;
    })

    it('Should set delegate for account', async () => {
      await module.depositToModule(wallet.address, toBigNumber(5))
      await expect(module.delegateFromModule(wallet.address, wallet1.address))
        .to.emit(depositToken, 'DelegateChanged')
        .withArgs(subModule.address, wallet.address, wallet1.address)
      expect(await depositToken.delegates(subModule.address)).to.eq(wallet1.address)
    })
  })
})