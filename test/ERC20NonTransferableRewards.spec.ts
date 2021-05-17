import { ethers, waffle } from 'hardhat';
import { expect } from "chai";
import { ERC20NonTransferableRewardsOwned } from '../typechain/ERC20NonTransferableRewardsOwned';
import { POINTS_MULTIPLIER, toBigNumber } from './shared/utils';
import { BigNumber, constants } from 'ethers';
import { createParticipationTree, ParticipationEntry, ParticipationEntryWithLeaf } from '../utils';
import { MerkleTree } from '../utils/MerkleTree';
import { parseEther } from 'ethers/lib/utils';

describe('ERC20NonTransferableRewardBearing', () => {
  let [wallet, wallet1, wallet2] = waffle.provider.getWallets()
  let erc20: ERC20NonTransferableRewardsOwned;

  beforeEach('Deploy ERC20Rewards', async () => {
    const factory = await ethers.getContractFactory('ERC20NonTransferableRewardsOwned')
    erc20 = (await factory.deploy()) as ERC20NonTransferableRewardsOwned;
    await erc20['initialize(string,string,address,address)']("vDOUGH", "vDOUGH", constants.AddressZero, wallet.address);
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
      await erc20.distributeRewards(toBigNumber(5))
      await erc20.mint(wallet.address, amount)
      const pointsPerShare = getPointsPerShare(toBigNumber(5), amount);
      expect(await erc20.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare).mul(-1))
    })
  })

  describe('burn', () => {
    it('Should revert if amount exceeds balance', async () => {
      await expect(erc20.burn(wallet.address, 1)).to.be.revertedWith('ERC20: burn amount exceeds balance')
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
          await erc20.distributeRewards(amount)
          await erc20.burn(wallet.address, amount)
          const pointsPerShare = getPointsPerShare(amount, amount);
          expect(await erc20.getPointsCorrection(wallet.address)).to.eq(amount.mul(pointsPerShare))
        })

        it('Should allow caller to withdraw rewards earned before burn', async () => {
          const amount = toBigNumber(10)
          await erc20.mint(wallet.address, amount)
          await erc20.distributeRewards(toBigNumber(5).add(1))
          await erc20.burn(wallet.address, amount)
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5))
        })
      })

      describe('When caller received tokens after disbursal', () => {
        it('Should not allow caller to withdraw rewards disbursed before receipt of tokens', async () => {
          const amount = toBigNumber(10)
          await erc20.mint(wallet.address, amount)
          await erc20.distributeRewards(toBigNumber(5))
          await erc20.mint(wallet1.address, amount)
          await erc20.burn(wallet1.address, amount)
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(0)
        })
      })
    })
  })

  describe('transfer', () => {
    it("Should revert", async() => {
      const amount = toBigNumber(10);
      await erc20.mint(wallet.address, amount);
      await expect(erc20.transfer(wallet1.address, amount)).to.be.revertedWith("ERC20NonTransferable: Transfer not supported");
    });
  })

  describe('distributeRewards', () => {
    it('Should revert if total supply is 0', async () => {
      await expect(erc20.distributeRewards(1)).to.be.revertedWith('SHARES')
    })

    it('Should increase pointsPerShare', async () => {
      await erc20.mint(wallet.address, toBigNumber(100))
      await erc20.distributeRewards(toBigNumber(10))
      expect(await erc20.pointsPerShare()).to.eq(POINTS_MULTIPLIER.div(10))
    })

    it('Should do nothing if amount is 0', async () => {
      await erc20.mint(wallet.address, toBigNumber(100))
      await erc20.distributeRewards(0)
      expect(await erc20.pointsPerShare()).to.eq(0)
    })
  })

  describe('prepareCollect', () => {
    it('Does nothing if user balance or rewards are 0', async () => {
      await erc20.collect();
      expect(await erc20.withdrawnRewardsOf(wallet.address)).to.eq(0);
    })

    it('Updates withdrawnRewards', async () => {
      await erc20.mint(wallet.address, toBigNumber(5));
      await erc20.distributeRewards(toBigNumber(10));
      await erc20.collect();
      expect(await erc20.withdrawnRewardsOf(wallet.address)).to.eq(toBigNumber(10))
      expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(0)
    })
  });

  describe("collect", async() => {
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

    describe("Without participation root set", async() => {
      it("Calling collect() should work", async() => {
        await erc20.mint(wallet1.address, toBigNumber(5));
        await erc20.mint(wallet.address, toBigNumber(5));
        await erc20.distributeRewards(toBigNumber(10));
        
        expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5));
        
        await erc20.collect()

        expect(await erc20.withdrawnRewardsOf(wallet.address)).to.eq(toBigNumber(5));
      });

      it("Calling collectFor() should work", async() => {
        await erc20.mint(wallet1.address, toBigNumber(5));
        await erc20.mint(wallet.address, toBigNumber(5));
        await erc20.distributeRewards(toBigNumber(10));
        
        expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(5));
        
        await erc20.collectFor(wallet1.address)

        expect(await erc20.withdrawnRewardsOf(wallet1.address)).to.eq(toBigNumber(5));
      });

    });

    describe("With participation root set", async() => {
      let root:string;
      beforeEach(async() => {
        root = merkleTree.getRoot();
        await erc20.setParticipationMerkleRoot(root);
      });

      it("Root should be set", async() => {
        const rootValue = await erc20.participationMerkleRoot();
        expect(rootValue).to.eq(root);
      });

      it("Setting the participationMerkleRoot from a non maintainer should fail", async() => {
        await expect(erc20.connect(wallet2).setParticipationMerkleRoot(root)).to.be.revertedWith("onlyMaintainer: sender is not maintainer");
      });

      it("Claiming rewards when you have been actively participating should work", async() => {
        await erc20.mint(wallet.address, toBigNumber(5));
        await erc20.distributeRewards(toBigNumber(10));
        
        await erc20.collectWithParticipation(merkleTree.getProof(leafs[0].leaf));

        expect(await erc20.withdrawnRewardsOf(wallet.address)).to.eq(toBigNumber(10))
        expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(0)
      });

      it("Claiming rewards when you have not been actively participating should fail", async() => {
        await erc20.mint(wallet1.address, toBigNumber(5));
        await erc20.distributeRewards(toBigNumber(10));
        
        await expect(erc20.connect(wallet1).collectWithParticipation(merkleTree.getProof(leafs[1].leaf)))
          .to.be.revertedWith("collectForWithParticipation: Invalid merkle proof");
      });

      it("Redistributing rewards should work", async() => {
        await erc20.mint(wallet1.address, toBigNumber(5));
        await erc20.mint(wallet.address, toBigNumber(5));
        await erc20.distributeRewards(toBigNumber(10));

        await erc20.redistribute([wallet1.address], [merkleTree.getProof(leafs[1].leaf)]);
        
        expect(await erc20.withdrawnRewardsOf(wallet1.address)).to.eq(toBigNumber(5));
        // small rounding inacuracy
        expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(parseEther("2.5").sub(1));
        expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(parseEther("7.5").sub(1));
      });
    });
  });

  describe('redistribute', async () => {
    const ParticipationTypes = {
      INACTIVE: 0,
      YES: 1
    }

    const entriesOneInactive: ParticipationEntry[] = [
      {
        address: wallet1.address,
        participation: ParticipationTypes.YES
      },
      {
        address: wallet2.address,
        participation: ParticipationTypes.INACTIVE
      }
    ];

    const entriesAllInactive: ParticipationEntry[] = [
      {
        address: wallet1.address,
        participation: ParticipationTypes.INACTIVE
      },
      {
        address: wallet2.address,
        participation: ParticipationTypes.INACTIVE
      }
    ];

    const merkleTreeOneInactive = createParticipationTree(entriesOneInactive);
    const rootOneInactive = merkleTreeOneInactive.merkleTree.getRoot();

    const merkleTreeAllInactive = createParticipationTree(entriesAllInactive);
    const rootAllInactive = merkleTreeAllInactive.merkleTree.getRoot();

    it('Should revert if length(accounts) != length(proofs)', async () => {
      const {merkleTree, leafs} = merkleTreeOneInactive

      await erc20.setParticipationMerkleRoot(rootOneInactive);

      let proofs = [merkleTree.getProof(leafs[0].leaf), merkleTree.getProof(leafs[1].leaf)]

      await expect(erc20.redistribute([wallet1.address], proofs))
        .to.be.revertedWith("redistribute: Array length mismatch");
    })

    it('Should revert if participationMerkleRoot is not set', async () => {
      await expect(erc20.redistribute([], []))
        .to.be.revertedWith("participationNeeded: merkle root not set")
    })

    it('Should skip invalid proofs', async () => {
      const {merkleTree, leafs} = merkleTreeOneInactive;
      await erc20.setParticipationMerkleRoot(rootOneInactive);

      await erc20.mint(wallet1.address, toBigNumber(5));
      await erc20.mint(wallet2.address, toBigNumber(5));
      await erc20.distributeRewards(toBigNumber(10));

      let invalidProofs = [
        merkleTreeAllInactive.merkleTree
          .getProof(merkleTreeAllInactive.leafs[0].leaf), // this one is invalid
        merkleTree.getProof(leafs[1].leaf), // this one is valid
      ]

      await erc20.redistribute([wallet1.address, wallet2.address], invalidProofs);

      expect(await erc20.withdrawnRewardsOf(wallet2.address)).to.eq(toBigNumber(5));
      // small rounding inacuracy
      expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(parseEther("2.5").sub(1));
      expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(parseEther("7.5").sub(1));
    })

    it("Should redistribute rewards successfully", async() => {
      const {merkleTree, leafs} = merkleTreeOneInactive

      await erc20.setParticipationMerkleRoot(rootOneInactive);

      await erc20.mint(wallet1.address, toBigNumber(5));
      await erc20.mint(wallet2.address, toBigNumber(5));
      await erc20.distributeRewards(toBigNumber(10));

      await erc20.redistribute([wallet2.address], [merkleTree.getProof(leafs[1].leaf)]);
      
      expect(await erc20.withdrawnRewardsOf(wallet2.address)).to.eq(toBigNumber(5));
      // small rounding inacuracy
      expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(parseEther("2.5").sub(1));
      expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(parseEther("7.5").sub(1));
    });

  })

  describe('cumulativeRewardsOf', () => {
    it('Should store total rewards for one user', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeRewards(toBigNumber(10))
      expect(await erc20.cumulativeRewardsOf(wallet.address)).to.eq(toBigNumber(10))
      await erc20.distributeRewards(toBigNumber(5))
      expect(await erc20.cumulativeRewardsOf(wallet.address)).to.eq(toBigNumber(15))
    })

    it('Should leave (amount*multiplier)%supply as dust', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeRewards(toBigNumber(10).add(1))
      expect(await erc20.cumulativeRewardsOf(wallet.address)).to.eq(toBigNumber(10))
    })

    it('Should not add rewards if no new points since caller received tokens', async () => {
      await erc20.mint(wallet.address, toBigNumber(5))
      await erc20.distributeRewards(toBigNumber(10).add(1))
      expect(await erc20.cumulativeRewardsOf(wallet.address)).to.eq(toBigNumber(10))
      await erc20.mint(wallet.address, toBigNumber(5))
      expect(await erc20.cumulativeRewardsOf(wallet.address)).to.eq(toBigNumber(10))
    })
  })

  describe('Behavior', () => {
    describe('When rewards are disbursed', () => {
      it('Holders receive pro-rata shares of rewards', async () => {
        await erc20.mint(wallet.address, toBigNumber(5))
        await erc20.mint(wallet1.address, toBigNumber(10))
        await erc20.mint(wallet2.address, toBigNumber(85))
        await erc20.distributeRewards(toBigNumber(10).add(1))
        expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5, 17))
        expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(1))
        expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
      })

      // describe('When a holder transfers all shares after', () => {
      //   it('Rewards earned previously do not change', async () => {
      //     await erc20.mint(wallet.address, toBigNumber(5))
      //     await erc20.mint(wallet1.address, toBigNumber(10))
      //     await erc20.mint(wallet2.address, toBigNumber(85))
      //     await erc20.distributeRewards(toBigNumber(10).add(1))
      //     await erc20.transfer(wallet.address, toBigNumber(5))
      //     expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5, 17))
      //     expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(1))
      //     expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
      //   })
      // })

      describe('When a holder burns all shares after', () => {
        it('Rewards earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeRewards(toBigNumber(10).add(1))
          await erc20.burn(wallet.address, toBigNumber(5))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder does not earn rewards distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeRewards(toBigNumber(6).add(1))
          await erc20.burn(wallet.address, amount)
          await erc20.distributeRewards(toBigNumber(6).add(1))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(2))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(5))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(5))
        })
      })

      describe('When a holder burns some shares after', () => {
        it('Rewards earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeRewards(toBigNumber(10).add(1))
          await erc20.burn(wallet.address, toBigNumber(3))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder earns pro-rata share of rewards distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeRewards(toBigNumber(6).add(1))
          await erc20.burn(wallet.address, toBigNumber(3))
          await erc20.distributeRewards(toBigNumber(6).add(1))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(3))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(45, 17))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(45, 17))
        })
      })

      describe('When a holder receives some shares after', () => {
        it('Rewards earned previously do not change', async () => {
          await erc20.mint(wallet.address, toBigNumber(5))
          await erc20.mint(wallet1.address, toBigNumber(10))
          await erc20.mint(wallet2.address, toBigNumber(85))
          await erc20.distributeRewards(toBigNumber(10).add(1))
          await erc20.mint(wallet.address, toBigNumber(3))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(5, 17))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(1))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(85, 17))
        })

        it('Holder earns pro-rata share of rewards distributed after', async () => {
          const amount = toBigNumber(5)
          await erc20.mint(wallet.address, amount)
          await erc20.mint(wallet1.address, amount)
          await erc20.mint(wallet2.address, amount)
          await erc20.distributeRewards(toBigNumber(6).add(1))
          await erc20.mint(wallet.address, amount)
          await erc20.distributeRewards(toBigNumber(20).add(1))
          expect(await erc20.withdrawableRewardsOf(wallet.address)).to.eq(toBigNumber(12))
          expect(await erc20.withdrawableRewardsOf(wallet1.address)).to.eq(toBigNumber(7))
          expect(await erc20.withdrawableRewardsOf(wallet2.address)).to.eq(toBigNumber(7))
        })
      })
    })
  })
})