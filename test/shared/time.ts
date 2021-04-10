const { waffle } = require("hardhat")

export async function advanceBlock() {
  return waffle.provider.send("evm_mine", [])
}

export async function advanceBlockTo(blockNumber: number) {
  for (let i = await waffle.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock()
  }
}

export async function latest() {
  const block = await waffle.provider.getBlock("latest")
  return block.timestamp
}

export async function advanceTimeAndBlock(time: number) {
  await advanceTime(time)
  await advanceBlock()
}

export async function setNextTimestamp(time: number) {
  await waffle.provider.send('evm_setNextBlockTimestamp', [time])
}

export async function advanceTime(time: number) {
  await waffle.provider.send("evm_increaseTime", [time])
}

export const duration = {
  seconds: function (val: number) {
    return val
  },
  minutes: function (val: number) {
    return val * this.seconds(60)
  },
  hours: function (val: number) {
    return val * this.minutes(60)
  },
  days: function (val: number) {
    return val * this.hours(24)
  },
  weeks: function (val: number) {
    return val * this.days(7)
  },
  years: function (val: number) {
    return val * this.days(365)
  },
}
