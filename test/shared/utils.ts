import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import { IERC20 } from "../../typechain";

export function toBigNumber(amount: number, decimals: number = 18) {
  return BigNumber.from(10).pow(decimals).mul(amount);
}

export const POINTS_MULTIPLIER = BigNumber.from(2).pow(128).sub(1);

export const encodeTokenId = (nonce: number, deposit: BigNumber, unlockAt: number) => {
  const nonce96 = nonce.toString(16).padStart(24, '0')
  const deposit128 = deposit.toHexString().slice(2).padStart(16, '0')
  const unlock32 = unlockAt.toString(16).padStart(8, '0')
  return ['0x', nonce96, deposit128, unlock32].join('')
}

export async function getTransactionCost(tx: ContractTransaction | Promise<ContractTransaction>) {
  const { wait, gasPrice } = await Promise.resolve(tx);
  const { gasUsed } = await wait()
  return gasUsed.mul(gasPrice);
}

export async function createBalanceCheckpoint(token: IERC20 | null, account: string) {
  const bal = () => token ? token.balanceOf(account) : ethers.provider.getBalance(account)
  const balanceBefore = await bal()
  return async () => {
    const balanceAfter = await bal()
    return balanceAfter.sub(balanceBefore)
  }
}