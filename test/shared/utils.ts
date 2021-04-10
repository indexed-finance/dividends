import { BigNumber } from "ethers";

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