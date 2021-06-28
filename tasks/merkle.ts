import { task } from "hardhat/config";
import { writeFileSync } from "fs";


import { createParticipationTree } from  "../utils";
import {IERC20__factory} from "../typechain/factories/IERC20__factory";
import { Signer } from "ethers/lib/ethers";

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
    .setAction(async(taskArgs, {ethers}) => {
        const signer = (await ethers.getSigners())[0];

        // get token holders
        const tokenHolders = await getAccounts("0x250B5CC49658Dd9f9369a71d654e5DB3fc87e69C", signer);

        // get all votes

        // label all token holders who did vote active

        // return generated leafs

        console.log(tokenHolders);
});

async function getAccounts(tokenAddress: string, signer:Signer) {
    const token = IERC20__factory.connect(tokenAddress, signer)
    const accounts: any = {};
    const filter = token.filters.Transfer(null, null, null);

    // TODO fix hitting limits of alchemy/infura
    const events = await token.queryFilter(filter, 0, "latest");

    for (const event of events) {
        if(event.args) {
            accounts[event.args.from] = 1;
            accounts[event.args.to] = 1;
        }

    }
    return Object.keys(accounts);
  }