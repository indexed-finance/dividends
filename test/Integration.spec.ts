import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { TestERC20 } from '../typechain/TestERC20';
import { ERC20NonTransferableRewardsOwned } from '../typechain/ERC20NonTransferableRewardsOwned';
import { SharesTimeLock } from '../typechain/SharesTimeLock';
import { SharesTimeLock__factory } from '../typechain/factories/SharesTimeLock__factory';
import { toBigNumber } from './shared/utils';
import { duration, latest, setNextTimestamp } from './shared/time';
import { constants } from 'ethers';
import { createParticipationTree, ParticipationEntry, ParticipationEntryWithLeaf } from '../utils';
import { MerkleTree } from '../utils/MerkleTree';

const MINTIME = duration.months(6);
const MAXTIME = duration.months(36);


describe('One account operations', () => {
    let [wallet, wallet1] = waffle.provider.getWallets()
    let timeLock: SharesTimeLock;
    let depositToken: TestERC20
    let rewardsToken: ERC20NonTransferableRewardsOwned

            
    const ParticipationTypes = {
        INACTIVE: 0,
        YES: 1
      }
      
    const entries: ParticipationEntry[] = [
        {
            address: wallet.address,
            participation: ParticipationTypes.YES
        },
        {
            address: wallet1.address,
            participation: ParticipationTypes.INACTIVE
        }
    ];

    const {merkleTree, leafs} = createParticipationTree(entries);

    beforeEach('Deploy stuff', async () => {
        const erc20Factory = await ethers.getContractFactory('TestERC20')
        depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20

        const rewardsFactory = await ethers.getContractFactory('ERC20NonTransferableRewardsOwned')
        rewardsToken = (await rewardsFactory.deploy() as ERC20NonTransferableRewardsOwned);
        rewardsToken['initialize(string,string,address,address)']('rTest', 'rTest', depositToken.address, wallet.address);

        const factory = await ethers.getContractFactory('SharesTimeLock') as SharesTimeLock__factory;
        timeLock = (await factory.deploy()) as SharesTimeLock
        await timeLock.initialize(
          depositToken.address,
          rewardsToken.address,
          MINTIME,
          MAXTIME,
          toBigNumber(1)
        );

        await rewardsToken.transferOwnership(timeLock.address);

        await depositToken.mint(wallet1.address, toBigNumber(10));
        await depositToken.connect(wallet1).approve(timeLock.address, toBigNumber(10));

        await depositToken.mint(wallet.address, toBigNumber(20));
        await depositToken.approve(timeLock.address, toBigNumber(10));
        await depositToken.approve(rewardsToken.address, toBigNumber(10));
    });

    it('User who did not partecipate is not able to claim', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(20));

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(10));

        await rewardsToken.redistribute([wallet1.address], [merkleTree.getProof(leafs[1].leaf)]);

        await expect(rewardsToken.connect(wallet1).claim(merkleTree.getProof(leafs[1].leaf)))
            .to.be.revertedWith("claimFor: Invalid merkle proof");
    });

    it('User who did partecipate is able to claim', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(20));

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(10));

        await rewardsToken.redistribute([wallet1.address], [merkleTree.getProof(leafs[1].leaf)]);

        const withdrawable = await rewardsToken.withdrawableRewardsOf(wallet.address);

        expect(await rewardsToken.claim(merkleTree.getProof(leafs[0].leaf)))
            .to.emit(rewardsToken, "ClaimedFor")
            .withArgs(withdrawable, wallet.address, wallet.address, merkleTree.getProof(leafs[0].leaf))
    });

    it('User who was ejected cannot claim rewards', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(20));

        const timestamp = await latest();
        await setNextTimestamp(timestamp + duration.months(6) + duration.hours(1));

        expect(await timeLock.eject([1]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet1.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(10));
        expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(10));

        expect(await timeLock.locks(1)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(10));

        await rewardsToken.redistribute([wallet1.address], [merkleTree.getProof(leafs[1].leaf)]);

        expect(await rewardsToken.withdrawableRewardsOf(wallet1.address)).to.eq(0);
    });

    it('User that have have his lock expired can be ejected', async () => {
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(10));

        const timestamp = await latest();

        await setNextTimestamp(timestamp + duration.months(6) + duration.hours(1));

        expect(await timeLock.eject([0]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet1.address)
        
        expect(await depositToken.balanceOf(timeLock.address)).to.eq(0);
        expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(10));

        expect(await timeLock.locks(0)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);
    });
});

describe('Multiple accounts operations', () => {
    let [wallet, wallet1, wallet2, wallet3, wallet4] = waffle.provider.getWallets()
    let timeLock: SharesTimeLock;
    let depositToken: TestERC20
    let rewardsToken: ERC20NonTransferableRewardsOwned
            
    const ParticipationTypes = {
        INACTIVE: 0,
        YES: 1
      }
      
    const entries: ParticipationEntry[] = [
        {
            address: wallet.address,
            participation: ParticipationTypes.YES
        },
        {
            address: wallet1.address,
            participation: ParticipationTypes.INACTIVE
        },
        {
            address: wallet2.address,
            participation: ParticipationTypes.YES
        },
        {
            address: wallet3.address,
            participation: ParticipationTypes.YES
        },
        {
            address: wallet4.address,
            participation: ParticipationTypes.INACTIVE
        },
    ];

    const {merkleTree, leafs} = createParticipationTree(entries);

    beforeEach('Deploy stuff', async () => {
        const erc20Factory = await ethers.getContractFactory('TestERC20')
        depositToken = (await erc20Factory.deploy('Test', 'Test')) as TestERC20

        const rewardsFactory = await ethers.getContractFactory('ERC20NonTransferableRewardsOwned')
        rewardsToken = (await rewardsFactory.deploy() as ERC20NonTransferableRewardsOwned);
        rewardsToken['initialize(string,string,address,address)']('rTest', 'rTest', depositToken.address, wallet.address);

        const factory = await ethers.getContractFactory('SharesTimeLock') as SharesTimeLock__factory;
        timeLock = (await factory.deploy()) as SharesTimeLock
        await timeLock.initialize(
          depositToken.address,
          rewardsToken.address,
          MINTIME,
          MAXTIME,
          toBigNumber(1)
        );

        await rewardsToken.transferOwnership(timeLock.address);

        await depositToken.mint(wallet1.address, toBigNumber(10));
        await depositToken.connect(wallet1).approve(timeLock.address, toBigNumber(10));
        
        await depositToken.mint(wallet2.address, toBigNumber(10));
        await depositToken.connect(wallet2).approve(timeLock.address, toBigNumber(10));

        await depositToken.mint(wallet3.address, toBigNumber(10));
        await depositToken.connect(wallet3).approve(timeLock.address, toBigNumber(10));

        await depositToken.mint(wallet4.address, toBigNumber(10));
        await depositToken.connect(wallet4).approve(timeLock.address, toBigNumber(10));

        await depositToken.mint(wallet.address, toBigNumber(20));
        await depositToken.approve(timeLock.address, toBigNumber(10));
        await depositToken.approve(rewardsToken.address, toBigNumber(10));
    });

    it('User who did not partecipate is not able to claim', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 6, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)
        await timeLock.connect(wallet2).depositByMonths(toBigNumber(10), 6, wallet2.address)
        await timeLock.connect(wallet3).depositByMonths(toBigNumber(10), 6, wallet3.address)
        await timeLock.connect(wallet4).depositByMonths(toBigNumber(10), 6, wallet4.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(50));

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(10));

        await rewardsToken.redistribute([wallet1.address, wallet4.address], [merkleTree.getProof(leafs[1].leaf), merkleTree.getProof(leafs[4].leaf)]);

        await expect(rewardsToken.connect(wallet1).claim(merkleTree.getProof(leafs[1].leaf)))
            .to.be.revertedWith("claimFor: Invalid merkle proof");
        
        await expect(rewardsToken.connect(wallet4).claim(merkleTree.getProof(leafs[1].leaf)))
            .to.be.revertedWith("claimFor: Invalid merkle proof");
    });

    it('User who did partecipate is able to claim', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)
        await timeLock.connect(wallet2).depositByMonths(toBigNumber(10), 6, wallet2.address)
        await timeLock.connect(wallet3).depositByMonths(toBigNumber(10), 6, wallet3.address)
        await timeLock.connect(wallet4).depositByMonths(toBigNumber(10), 6, wallet4.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(50));

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(3));

        await rewardsToken.redistribute([wallet1.address, wallet4.address], [merkleTree.getProof(leafs[1].leaf), merkleTree.getProof(leafs[4].leaf)]);

        await expect(rewardsToken.connect(wallet1).claim(merkleTree.getProof(leafs[1].leaf)))
            .to.be.revertedWith("claimFor: Invalid merkle proof");
        
        await expect(rewardsToken.connect(wallet4).claim(merkleTree.getProof(leafs[1].leaf)))
            .to.be.revertedWith("claimFor: Invalid merkle proof");

        const withdrawable = await rewardsToken.withdrawableRewardsOf(wallet.address);
        const withdrawable2 = await rewardsToken.withdrawableRewardsOf(wallet2.address);
        const withdrawable3 = await rewardsToken.withdrawableRewardsOf(wallet3.address);

        expect(withdrawable.gt(withdrawable2));
        expect(withdrawable.gt(withdrawable3));

        await expect(rewardsToken.claim(merkleTree.getProof(leafs[0].leaf)))
            .to.emit(rewardsToken, "ClaimedFor")
            .withArgs(withdrawable, wallet.address, wallet.address, merkleTree.getProof(leafs[0].leaf))
        
        await expect(rewardsToken.connect(wallet2).claim(merkleTree.getProof(leafs[2].leaf)))
            .to.emit(rewardsToken, "ClaimedFor")
            .withArgs(withdrawable2, wallet2.address, wallet2.address, merkleTree.getProof(leafs[2].leaf))

        await expect(rewardsToken.connect(wallet3).claim(merkleTree.getProof(leafs[3].leaf)))
            .to.emit(rewardsToken, "ClaimedFor")
            .withArgs(withdrawable3, wallet3.address, wallet3.address, merkleTree.getProof(leafs[3].leaf))
    });

    it('User who was ejected cannot claim rewards', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)
        await timeLock.connect(wallet2).depositByMonths(toBigNumber(10), 6, wallet2.address)
        await timeLock.connect(wallet3).depositByMonths(toBigNumber(10), 6, wallet3.address)
        await timeLock.connect(wallet4).depositByMonths(toBigNumber(10), 6, wallet4.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(50));

        const timestamp = await latest();
        await setNextTimestamp(timestamp + duration.months(6) + duration.hours(1));

        expect(await timeLock.eject([1]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet1.address)
        
        expect(await timeLock.eject([4]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet4.address)


        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(30));
        expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(10));
        expect(await depositToken.balanceOf(wallet4.address)).to.eq(toBigNumber(10));

        expect(await timeLock.locks(1)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);

        expect(await timeLock.locks(4)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);

        await rewardsToken.setParticipationMerkleRoot(merkleTree.getRoot());
        await rewardsToken.distributeRewards(toBigNumber(10));

        await rewardsToken.redistribute([wallet1.address, wallet4.address], [merkleTree.getProof(leafs[1].leaf), merkleTree.getProof(leafs[4].leaf)]);

        expect(await rewardsToken.withdrawableRewardsOf(wallet1.address)).to.eq(0);
        expect(await rewardsToken.withdrawableRewardsOf(wallet4.address)).to.eq(0);
    });

    it('User that have have his lock expired can be ejected', async () => {
        await timeLock.depositByMonths(toBigNumber(10), 12, wallet.address)
        await timeLock.connect(wallet1).depositByMonths(toBigNumber(10), 6, wallet1.address)
        await timeLock.connect(wallet2).depositByMonths(toBigNumber(10), 6, wallet2.address)
        await timeLock.connect(wallet3).depositByMonths(toBigNumber(10), 6, wallet3.address)
        await timeLock.connect(wallet4).depositByMonths(toBigNumber(10), 6, wallet4.address)

        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(50));

        const timestamp = await latest();

        await setNextTimestamp(timestamp + duration.months(6) + duration.hours(1));

        expect(await timeLock.eject([1]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet1.address)
        
        expect(await timeLock.eject([4]))
            .to.emit(timeLock, "Ejected")
            .withArgs(toBigNumber(10), wallet4.address)

        
        expect(await depositToken.balanceOf(timeLock.address)).to.eq(toBigNumber(30));
        expect(await depositToken.balanceOf(wallet1.address)).to.eq(toBigNumber(10));
        expect(await depositToken.balanceOf(wallet4.address)).to.eq(toBigNumber(10));

        expect(await timeLock.locks(1)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);

        expect(await timeLock.locks(4)).to.deep.eq([
            constants.Zero, 0, 0, constants.AddressZero
        ]);
    });
});