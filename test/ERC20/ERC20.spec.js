const { expect } = require('chai');
const { BigNumber, constants } = require("ethers");
const ZERO_ADDRESS = constants.AddressZero;

const {
  shouldBehaveLikeERC20,
  shouldBehaveLikeERC20Transfer,
  shouldBehaveLikeERC20Approve,
} = require('./ERC20.behavior');

describe('ERC20', function () {
  const [initialHolder, recipient, anotherAccount] = waffle.provider.getWallets()

  const name = 'My Token';
  const symbol = 'MTKN';

  const initialSupply = BigNumber.from(100);

  let TestERC20;

  before(async () => {
    TestERC20 = await ethers.getContractFactory('TestOZERC20')
  })

  const expectRevert = (tx, message) => expect(tx).to.be.revertedWith(message);

  beforeEach(async function () {
    this.token = await TestERC20.deploy(name, symbol);
    await this.token.mint(initialHolder.address, initialSupply)
  });

  describe('Settings', function () {
    it('has a name', async function () {
      expect(await this.token.name()).to.eq(name);
    });
  
    it('has a symbol', async function () {
      expect(await this.token.symbol()).to.eq(symbol);
    });
  
    it('has 18 decimals', async function () {
      expect(await this.token.decimals()).to.eq(18);
    });
  })

  shouldBehaveLikeERC20(initialSupply, initialHolder, recipient, anotherAccount);

  describe('decrease allowance', function () {
    describe('when the spender is not the zero address', function () {
      const spender = recipient.address;

      function shouldDecreaseApproval (amount) {
        describe('when there was no approved amount before', function () {
          it('reverts', async function () {
            await expectRevert(this.token.connect(initialHolder).decreaseAllowance(
              spender, amount), 'decreased allowance below zero',
            );
          });
        });

        describe('when the spender had an approved amount', function () {
          const approvedAmount = amount;

          beforeEach(async function () {
            ({ logs: this.logs } = await this.token.connect(initialHolder).approve(spender, approvedAmount));
          });

          it('emits an approval event', async function () {
            await expect(
              this.token.connect(initialHolder).decreaseAllowance(spender, approvedAmount)
            ).to.emit(this.token, 'Approval').withArgs(initialHolder.address, spender, BigNumber.from(0))
          });

          it('decreases the spender allowance subtracting the requested amount', async function () {
            await this.token.connect(initialHolder).decreaseAllowance(spender, approvedAmount.sub(1));

            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(1);
          });

          it('sets the allowance to zero when all allowance is removed', async function () {
            await this.token.connect(initialHolder).decreaseAllowance(spender, approvedAmount);
            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(0);
          });

          it('reverts when more than the full allowance is removed', async function () {
            await expectRevert(
              this.token.connect(initialHolder).decreaseAllowance(spender, approvedAmount.add(1)),
              'decreased allowance below zero',
            );
          });
        });
      }

      describe('when the sender has enough balance', function () {
        const amount = initialSupply;

        shouldDecreaseApproval(amount);
      });

      describe('when the sender does not have enough balance', function () {
        const amount = initialSupply.add(1);

        shouldDecreaseApproval(amount);
      });
    });

    describe('when the spender is the zero address', function () {
      const amount = initialSupply;
      const spender = ZERO_ADDRESS;

      it('reverts', async function () {
        await expectRevert(this.token.connect(initialHolder).decreaseAllowance(
          spender, amount), 'decreased allowance below zero',
        );
      });
    });
  });

  describe('increase allowance', function () {
    const amount = initialSupply;

    describe('when the spender is not the zero address', function () {
      const spender = recipient.address;

      describe('when the sender has enough balance', function () {
        it('emits an approval event', async function () {
          await expect(
            this.token.connect(initialHolder).increaseAllowance(spender, amount)
          ).to.emit(this.token, 'Approval').withArgs(initialHolder.address, spender, amount)
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await this.token.connect(initialHolder).increaseAllowance(spender, amount);

            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await this.token.connect(initialHolder).approve(spender, BigNumber.from(1));
          });

          it('increases the spender allowance adding the requested amount', async function () {
            await this.token.connect(initialHolder).increaseAllowance(spender, amount);

            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(amount.add(1));
          });
        });
      });

      describe('when the sender does not have enough balance', function () {
        const amount = initialSupply.add(1);

        it('emits an approval event', async function () {
          await expect(
            this.token.increaseAllowance(recipient.address, amount)
          ).to.emit(this.token, 'Approval').withArgs(initialHolder.address, spender, amount)
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await this.token.connect(initialHolder).increaseAllowance(spender, amount);

            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await this.token.connect(initialHolder).approve(spender, BigNumber.from(1));
          });

          it('increases the spender allowance adding the requested amount', async function () {
            await this.token.connect(initialHolder).increaseAllowance(spender, amount);

            expect(await this.token.allowance(initialHolder.address, spender)).to.eq(amount.add(1));
          });
        });
      });
    });

    describe('when the spender is the zero address', function () {
      const spender = ZERO_ADDRESS;

      it('reverts', async function () {
        await expectRevert(
          this.token.connect(initialHolder).increaseAllowance(spender, amount),
          'approve to the zero address',
        );
      });
    });
  });

  describe('_mint', function () {
    const amount = BigNumber.from(50);
    it('rejects a null account', async function () {
      await expectRevert(
        this.token.mint(ZERO_ADDRESS, amount), 'mint to the zero address',
      );
    });

    describe('for a non zero account', function () {
      beforeEach('minting', async function () {
        await this.token.mint(recipient.address, amount);
      });

      it('increments totalSupply', async function () {
        const expectedSupply = initialSupply.add(amount);
        expect(await this.token.totalSupply()).to.eq(expectedSupply);
      });

      it('increments recipient.address balance', async function () {
        expect(await this.token.balanceOf(recipient.address)).to.eq(amount);
      });

      it('emits Transfer event', async function () {
        await expect(
          this.token.mint(recipient.address, amount)
        ).to.emit(this.token, 'Transfer').withArgs(ZERO_ADDRESS, recipient.address, amount)
      });
    });
  });

  describe('_burn', function () {
    it('rejects a null account', async function () {
      await expectRevert(this.token.burn(ZERO_ADDRESS, BigNumber.from(1)),
        'burn from the zero address');
    });

    describe('for a non zero account', function () {
      it('rejects burning more than balance', async function () {
        await expectRevert(this.token.burn(
          initialHolder.address, initialSupply.add(1)), 'burn amount exceeds balance',
        );
      });

      const describeBurn = function (description, amount) {
        describe(description, function () {
          beforeEach('burning', async function () {
            this.tx = this.token.burn(initialHolder.address, amount);
          });

          it('emits Transfer event', async function () {
            await expect(
              this.tx
            ).to.emit(this.token, 'Transfer').withArgs(initialHolder.address, ZERO_ADDRESS, amount)
          });

          it('decrements totalSupply', async function () {
            await this.tx;
            const expectedSupply = initialSupply.sub(amount);
            expect(await this.token.totalSupply()).to.eq(expectedSupply);
          });

          it('decrements initialHolder.address balance', async function () {
            await this.tx;
            const expectedBalance = initialSupply.sub(amount);
            expect(await this.token.balanceOf(initialHolder.address)).to.eq(expectedBalance);
          });
        });
      };

      describeBurn('for entire balance', initialSupply);
      describeBurn('for less amount than balance', initialSupply.sub(1));
    });
  });

  describe('_transfer', function () {
    shouldBehaveLikeERC20Transfer(initialHolder, recipient, initialSupply, function (from, to, amount) {
      return this.token.transferInternal(from, to, amount);
    });

    describe('when the sender is the zero address', function () {
      it('reverts', async function () {
        await expectRevert(this.token.transferInternal(ZERO_ADDRESS, recipient.address, initialSupply),
          'transfer from the zero address',
        );
      });
    });
  });
});