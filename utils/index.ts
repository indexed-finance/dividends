import { ethers } from "ethers"
import { MerkleTree } from "./MerkleTree";

export enum ParticipationType {
    INACTIVE = 0,
    YES = 1
  }

export interface ParticipationEntry {
  address: string,
  participation: ParticipationType
}

export interface ParticipationEntryWithLeaf extends ParticipationEntry {
  leaf: string
}

const hashEntry = (entry: ParticipationEntry) => {
  return ethers.utils.solidityKeccak256(
    ["address", "uint256"],
    [
     entry.address,
     entry.participation
    ]
  );
}

export const createParticipationTree = (entries: ParticipationEntry[]) => {
  const entriesWithLeafs = entries.map((item) => {
    const entryWithLeaf: ParticipationEntryWithLeaf = {
      ...item,
      leaf: hashEntry(item)
    }

    return entryWithLeaf;
  })

  return {
    merkleTree: new MerkleTree(entriesWithLeafs.map((item) => item.leaf)),
    leafs: entriesWithLeafs
  }
}