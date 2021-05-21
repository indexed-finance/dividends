const { expect } = require('chai');
const { constants, BigNumber } = require("ethers");
const ZERO_ADDRESS = constants.AddressZero;

const expectRevert = (tx, message) => expect(tx).to.be.revertedWith(message);

function shouldBehaveLikeERC20 (errorPrefix, initialSupply, initialHolder, recipient, anotherAccount) {
  describe('total supply', function () {
    it('returns the total amount of tokens', async function () {
      expect(await this.token.totalSupply()).to.eq(initialSupply);
    });
  });

  describe('balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await this.token.balanceOf(anotherAccount.address)).to.eq(0);
      });
    });

    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        expect(await this.token.balanceOf(initialHolder.address)).to.eq(initialSupply);
      });
    });
  });

  describe('transfer', function () {
    shouldBehaveLikeERC20Transfer(errorPrefix, initialHolder, recipient, initialSupply,
      function (from, to, value) {
        return this.token.transfer(to, value);
      },
    );
  });

  describe('transfer from', function () {
    const spender = recipient;

    describe('when the token owner is not the zero address', function () {
      const tokenOwner = initialHolder;

      describe('when the recipient is not the zero address', function () {
        const to = anotherAccount;

        describe('when the spender has enough approved balance', function () {
          beforeEach(async function () {
            await this.token.connect(initialHolder).approve(spender.address, initialSupply);
          });

          describe('when the token owner has enough balance', function () {
            const amount = initialSupply;

            it('transfers the requested amount', async function () {
              await this.token.connect(spender).transferFrom(tokenOwner.address, to.address, amount);

              expect(await this.token.balanceOf(tokenOwner.address)).to.eq(0);

              expect(await this.token.balanceOf(to.address)).to.eq(amount);
            });

            it('decreases the spender allowance', async function () {
              await this.token.connect(spender).transferFrom(tokenOwner.address, to.address, amount);

              expect(await this.token.allowance(tokenOwner.address, spender.address)).to.eq(0);
            });

            it('emits a transfer event', async function () {
              await expect(
                this.token.connect(spender).transferFrom(tokenOwner.address, to.address, amount)
              ).to.emit(this.token, 'Transfer').withArgs(tokenOwner.address, to.address, amount)
            });

            it('emits an approval event', async function () {
              const allowance = await this.token.allowance(tokenOwner.address, spender.address)
              await expect(
                this.token.connect(spender).transferFrom(tokenOwner.address, to.address, amount)
              ).to.emit(this.token, 'Approval').withArgs(tokenOwner.address, spender.address, allowance.sub(amount))
            });
          });

          describe('when the token owner does not have enough balance', function () {
            const amount = initialSupply.add(1);

            it('reverts', async function () {
              await expectRevert(this.token.connect(spender).transferFrom(
                tokenOwner.address, to.address, amount), `${errorPrefix}: transfer amount exceeds balance`,
              );
            });
          });
        });

        describe('when the spender does not have enough approved balance', function () {
          beforeEach(async function () {
            await this.token.connect(tokenOwner).approve(spender.address, initialSupply.sub(1));
          });

          describe('when the token owner has enough balance', function () {
            const amount = initialSupply;

            it('reverts', async function () {
              await expectRevert(this.token.connect(spender).transferFrom(
                tokenOwner.address, to.address, amount), `${errorPrefix}: transfer amount exceeds allowance`,
              );
            });
          });

          describe('when the token owner does not have enough balance', function () {
            const amount = initialSupply.add(1);

            it('reverts', async function () {
              await expectRevert(this.token.connect(spender).transferFrom(
                tokenOwner.address, to.address, amount), `${errorPrefix}: transfer amount exceeds balance`,
              );
            });
          });
        });
      });

      describe('when the recipient is the zero address', function () {
        const amount = initialSupply;
        const to = ZERO_ADDRESS;

        beforeEach(async function () {
          await this.token.connect(tokenOwner).approve(spender.address, amount);
        });

        it('reverts', async function () {
          await expectRevert(this.token.connect(spender).transferFrom(
            tokenOwner.address, to, amount), `${errorPrefix}: transfer to the zero address`,
          );
        });
      });
    });

    describe('when the token owner is the zero address', function () {
      const amount = 0;
      const tokenOwner = ZERO_ADDRESS;
      const to = recipient;

      it('reverts', async function () {
        await expectRevert(this.token.connect(spender).transferFrom(
          tokenOwner, to.address, amount), `${errorPrefix}: transfer from the zero address`,
        );
      });
    });
  });

  describe('approve', function () {
    shouldBehaveLikeERC20Approve(errorPrefix, initialHolder, recipient, initialSupply,
      function (owner, spender, amount) {
        return this.token.connect(owner).approve(spender, amount);
      },
    );
  });
}

function shouldBehaveLikeERC20Transfer (errorPrefix, from, to, balance, transfer) {
  describe('when the recipient is not the zero address', function () {
    describe('when the sender does not have enough balance', function () {
      const amount = balance.add(1);

      it('reverts', async function () {
        await expectRevert(transfer.call(this, from.address, to.address, amount),
          `${errorPrefix}: transfer amount exceeds balance`,
        );
      });
    });

    describe('when the sender transfers all balance', function () {
      const amount = balance;

      it('transfers the requested amount', async function () {
        await transfer.call(this, from.address, to.address, amount);

        expect(await this.token.balanceOf(from.address)).to.eq(0);

        expect(await this.token.balanceOf(to.address)).to.eq(amount);
      });

      it('emits a transfer event', async function () {
        await expect(
          transfer.call(this, from.address, to.address, amount)
        ).to.emit(this.token, 'Transfer').withArgs(from.address, to.address, amount)
      });
    });

    describe('when the sender transfers zero tokens', function () {
      const amount = BigNumber.from('0');

      it('transfers the requested amount', async function () {
        await transfer.call(this, from.address, to.address, amount);

        expect(await this.token.balanceOf(from.address)).to.eq(balance);

        expect(await this.token.balanceOf(to.address)).to.eq(0);
      });

      it('emits a transfer event', async function () {
        await expect(
          transfer.call(this, from.address, to.address, amount)
        ).to.emit(this.token, 'Transfer').withArgs(from.address, to.address, amount)
      });
    });
  });

  describe('when the recipient is the zero address', function () {
    it('reverts', async function () {
      await expectRevert(transfer.call(this, from.address, ZERO_ADDRESS, balance),
        `${errorPrefix}: transfer to the zero address`,
      );
    });
  });
}

function shouldBehaveLikeERC20Approve (errorPrefix, owner, spender, supply, approve) {
  describe('when the spender is not the zero address', function () {
    describe('when the sender has enough balance', function () {
      const amount = supply;

      it('emits an approval event', async function () {
        await expect(
          approve.call(this, owner, spender.address, amount)
        ).to.emit(this.token, 'Approval').withArgs(owner.address, spender.address, amount)
      });

      describe('when there was no approved amount before', function () {
        it('approves the requested amount', async function () {
          await approve.call(this, owner, spender.address, amount);

          expect(await this.token.allowance(owner.address, spender.address)).to.eq(amount);
        });
      });

      describe('when the spender had an approved amount', function () {
        beforeEach(async function () {
          await approve.call(this, owner, spender.address, BigNumber.from(1));
        });

        it('approves the requested amount and replaces the previous one', async function () {
          await approve.call(this, owner, spender.address, amount);

          expect(await this.token.allowance(owner.address, spender.address)).to.eq(amount);
        });
      });
    });

    describe('when the sender does not have enough balance', function () {
      const amount = supply.add(1);

      it('emits an approval event', async function () {
        await expect(
          approve.call(this, owner, spender.address, amount)
        ).to.emit(this.token, 'Approval').withArgs(owner.address, spender.address, amount)
      });

      describe('when there was no approved amount before', function () {
        it('approves the requested amount', async function () {
          await approve.call(this, owner, spender.address, amount);

          expect(await this.token.allowance(owner.address, spender.address)).to.eq(amount);
        });
      });

      describe('when the spender had an approved amount', function () {
        beforeEach(async function () {
          await approve.call(this, owner, spender.address, BigNumber.from(1));
        });

        it('approves the requested amount and replaces the previous one', async function () {
          await approve.call(this, owner, spender.address, amount);

          expect(await this.token.allowance(owner.address, spender.address)).to.eq(amount);
        });
      });
    });
  });

  describe('when the spender is the zero address', function () {
    it('reverts', async function () {
      await expectRevert(approve.call(this, owner, ZERO_ADDRESS, supply),
        `${errorPrefix}: approve to the zero address`,
      );
    });
  });
}

module.exports = {
  shouldBehaveLikeERC20,
  shouldBehaveLikeERC20Transfer,
  shouldBehaveLikeERC20Approve,
};