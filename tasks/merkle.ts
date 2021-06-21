import { task } from "hardhat/config";
import { writeFileSync } from "fs";


import { createParticipationTree } from  "../utils";

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