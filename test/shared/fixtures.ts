import { ethers, waffle } from 'hardhat'
import { Fixture } from 'ethereum-waffle'
import { TestERC20 } from '../../typechain/TestERC20'
import { TestDividendBearingLockedShares } from '../../typechain/TestDividendBearingLockedShares'

interface TokensFixture {
  dividendsToken: TestERC20
  sharesToken: TestERC20
}

export const tokensFixture = async (): Promise<TokensFixture> => {
  const erc20Factory = await ethers.getContractFactory('TestERC20')
  const dividendsToken = await erc20Factory.deploy('Dividends', 'DIV') as TestERC20
  const sharesToken = await erc20Factory.deploy('Shares', 'SHR') as TestERC20
  return {
    dividendsToken,
    sharesToken
  }
}

interface ERC721Fixture /* extends TokensFixture  */{
  deployERC721: (lockPeriod: number, earlyWithdrawalFee: number) => Promise<TestDividendBearingLockedShares>
}

export const erc721Fixture: Fixture<ERC721Fixture> = async (): Promise<ERC721Fixture> => {
  // const { dividendsToken, sharesToken } = await tokensFixture()
  const erc721Factory = await ethers.getContractFactory('TestDividendBearingLockedShares')
  const deployERC721 = async (lockPeriod: number, earlyWithdrawalFee: number) =>
    (await erc721Factory.deploy(
      // sharesToken.address,
      // dividendsToken.address,
      lockPeriod,
      earlyWithdrawalFee
    )) as TestDividendBearingLockedShares;
  
  return {
    // dividendsToken,
    // sharesToken,
    deployERC721
  }
}