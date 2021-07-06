import { task } from "hardhat/config";
import { writeFileSync } from "fs";
import fetch from "node-fetch";


import { createParticipationTree } from  "../utils";
import {IERC20Upgradeable__factory as IERC20__factory} from "../typechain/factories/IERC20Upgradeable__factory";
import { Signer } from "ethers/lib/ethers";
import { createDecipher } from "node:crypto";
import { fstat } from "node:fs";

task("generate-merkle-root")
    .addParam("input", "Path to json file") 
    .setAction(async(taskArgs) => {
        const elements = require(process.cwd() + "/" + taskArgs.input);
        const merkleTree = createParticipationTree(elements);

        console.log(`root: ${merkleTree.merkleTree.getRoot()}`);
});

task("generate-leafs")
    .addParam("input", "Path to json file")
    .addParam("output", "Path to output file")
    .setAction(async(taskArgs) => {
        const elements = require(process.cwd() + "/" + taskArgs.input);
        const merkleTree = createParticipationTree(elements);
        writeFileSync(process.cwd() + "/" + taskArgs.output, JSON.stringify(merkleTree.leafs, null, 2));
});

task("generate-proof")
    .addParam("input")
    .addParam("output")
    .addParam("address")
    .setAction(async(taskArgs) => {
        const elements = require(process.cwd() + "/" + taskArgs.input);
        const merkleTree = createParticipationTree(elements);

        const leaf = merkleTree.leafs.find((item) => item.address.toLowerCase() == taskArgs.address.toLowerCase());

        if(!leaf) {
            throw new Error("Address not in the tree");
        }

        const proof = merkleTree.merkleTree.getProof(leaf.leaf);
        writeFileSync(process.cwd() + "/" + taskArgs.output, JSON.stringify(proof, null, 2));
});

task("generate-participation")
    .addParam("output", "JSON file to output to")
    .addParam("inactiveTime", "Older than this timestamp will be considered inactive")
    .setAction(async(taskArgs, {ethers}) => {
        const signer = (await ethers.getSigners())[0];

        // get token holders
        // hardcoded at DOUGH deploy block
        const tokenHolders = await getAccounts("0xad32A8e6220741182940c5aBF610bDE99E737b2D", signer, 10840239);

        // TODO consider paginating if there is a large number of votes
        const query = `{
            votes (
              first: 1000
              where: {
                space: "piedao"
              }
            ) {
              id
              voter
              created
              proposal {
                id
              }
              choice
              space {
                id
              }
            }
          }`

        const result = (await (await fetch('https://hub.snapshot.page/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({query: query})
        })).json()).data.votes;

        for (const vote of result) {
            if(vote.created > taskArgs.inactiveTime) {
                // @ts-ignore
                tokenHolders[vote.voter] = {
                    participation: 1
                }
            }
        }

        const participationElements = [];

        for (const address in tokenHolders) {
            if (Object.prototype.hasOwnProperty.call(tokenHolders, address)) {
                participationElements.push({
                    address: address,
                    participation: tokenHolders[address].participation
                })
                
            }
        }

        writeFileSync(process.cwd() + "/" + taskArgs.output, JSON.stringify(participationElements, null, 2));
});

async function getAccounts(tokenAddress: string, signer:Signer, fromBlock: number) {
    const token = IERC20__factory.connect(tokenAddress, signer)
    const accounts: any = {};
    const filter = token.filters.Transfer(null, null, null);

    const BATCH_SIZE = 1000;


    let currentFromBlock = fromBlock;
    const currentBlock = await signer.provider?.getBlockNumber();

    while(true) {
        // TODO fix hitting limits of alchemy/infura
        console.log(`fetching ${currentFromBlock} to ${currentFromBlock + BATCH_SIZE}`)
        const events = await token.queryFilter(filter, currentFromBlock, currentFromBlock + BATCH_SIZE);
        for (const event of events) {
            if(event.args) {
                console.log("hmm");
                accounts[event.args.from] = {participation: 0};
                accounts[event.args.to] = {participation: 0};
            }
        }

        currentFromBlock += BATCH_SIZE;
        if(!currentBlock || currentFromBlock > currentBlock) {
            break;
        }
    }

    return accounts;
  }