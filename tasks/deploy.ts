import { task } from "hardhat/config";
import { ERC20NonTransferableRewardsOwned } from "../typechain/ERC20NonTransferableRewardsOwned";
import { ERC20NonTransferableRewardsOwned__factory } from "../typechain/factories/ERC20NonTransferableRewardsOwned__factory";
import { TestERC20__factory } from "../typechain/factories/TestERC20__factory";
import { SharesTimeLock__factory } from "../typechain/factories/SharesTimeLock__factory";
import { TestSharesTimeLock__factory } from "../typechain/factories/TestSharesTimeLock__factory";
import { PProxy__factory } from "../typechain/factories/PProxy__factory";
import { ContractFunctionVisibility } from "hardhat/internal/hardhat-network/stack-traces/model";
import { parseEther } from "ethers/lib/utils";

task("deploy-staking")
    .addParam("depositToken")
    .addParam("rewardToken")
    .addParam("name")
    .addParam("symbol")
    .addParam("minLockDuration")
    .addParam("maxLockDuration")
    .addParam("minLockAmount")
    .setAction(async(taskArgs, {ethers, network}) => {
        const signer = (await ethers.getSigners())[0];

        const dToken = await (new ERC20NonTransferableRewardsOwned__factory(signer)).deploy();
        await dToken["initialize(address)"](taskArgs.rewardToken);
        await dToken["initialize(string,string)"](taskArgs.name, taskArgs.symbol);

        console.log(`dToken deployed at: ${dToken.address}`);

        const sharesTimeLock = await (new SharesTimeLock__factory(signer)).deploy();
        await sharesTimeLock.initialize(taskArgs.depositToken, dToken.address, taskArgs.minLockDuration, taskArgs.maxLockDuration, taskArgs.minLockAmount);

        console.log(`sharesTimeLock deployed at: ${sharesTimeLock.address}`);

        const tx = await dToken.transferOwnership(sharesTimeLock.address);
        console.log(`dToken ownership transfered at ${tx.hash}`);
        
        console.log(`To verify dToken run: npx hardhat verify ${dToken.address} ${taskArgs.rewardToken} ${taskArgs.name} ${taskArgs.symbol} --network ${network.name}`);
        console.log(`To verify sharesTimeLock run: npx hardhat verify ${sharesTimeLock.address} ${taskArgs.depositToken} ${dToken.address} ${taskArgs.minLockDuration} ${taskArgs.maxLockDuration} ${taskArgs.minLockAmount} --network ${network.name}`);
});


task("deploy-staking-proxied")
    .addParam("depositToken", "token being staked")
    .addParam("rewardToken", "token being paid as reward")
    .addParam("name", "name of the rewards shares")
    .addParam("symbol", "symbol of the rewards shares")
    .addParam("minLockDuration")
    .addParam("maxLockDuration")
    .addParam("minLockAmount")
    .setAction(async(taskArgs, {ethers, network}) => {
        const signer = (await ethers.getSigners())[0];

        const contracts = [];

        // deploy implementations
        const dTokenImp = await (new ERC20NonTransferableRewardsOwned__factory(signer)).deploy();
        contracts.push({name: "dTokenImp", address: dTokenImp.address});
        const timeLockImp = await (new SharesTimeLock__factory(signer)).deploy();
        contracts.push({name: "timeLockImp", address: timeLockImp.address});

        // deploy proxies
        const proxyFactory = new PProxy__factory(signer);
        const dTokenProxy = await proxyFactory.deploy();
        contracts.push({name: "dTokenProxy", address: dTokenProxy.address});
        const timeLockProxy = await proxyFactory.deploy();
        contracts.push({name: "timeLockProxy", address: timeLockProxy.address});

        await dTokenProxy.setImplementation(dTokenImp.address);
        await timeLockProxy.setImplementation(timeLockImp.address);

        const dToken = ERC20NonTransferableRewardsOwned__factory.connect(dTokenProxy.address, signer);
        const timeLock = SharesTimeLock__factory.connect(timeLockProxy.address, signer);

        // initialize contracts
        await dToken["initialize(string,string,address,address)"](taskArgs.name, taskArgs.symbol, taskArgs.rewardToken, signer.address);
        await timeLock["initialize(address,address,uint32,uint32,uint256)"](
            taskArgs.depositToken,
            dToken.address,
            taskArgs.minLockDuration,
            taskArgs.maxLockDuration,
            taskArgs.minLockAmount
        );

        console.table(contracts);
        console.log("done");
});


task("deploy-staking-proxied-testing")
    .addParam("depositToken", "token being staked")
    .addParam("rewardToken", "token being paid as reward", undefined, undefined, true)
    .addParam("name", "name of the rewards shares")
    .addParam("symbol", "symbol of the rewards shares")
    .addParam("minLockDuration")
    .addParam("maxLockDuration")
    .addParam("minLockAmount")
    .addParam("secondsPerMonth")
    .setAction(async(taskArgs, {ethers, network}) => {
        const signer = (await ethers.getSigners())[0];

        const contracts = [];

        //If reward token is not defined deploy a testing tokken
        if(!taskArgs.rewardToken) {
            const token = await (new TestERC20__factory(signer)).deploy("RWRD", "RWRD");
            await token.mint(signer.address, parseEther("1000000"));
            contracts.push({name: "rewardToken", address: token.address});
            taskArgs.rewardToken = token.address;
            console.log("rewardToken deployed");
        }

        // deploy implementations
        const dTokenImp = await (new ERC20NonTransferableRewardsOwned__factory(signer)).deploy();
        contracts.push({name: "dTokenImp", address: dTokenImp.address});
        console.log("dTokenImp deployed");
        const timeLockImp = await (new TestSharesTimeLock__factory(signer)).deploy();
        contracts.push({name: "timeLockImp", address: timeLockImp.address});
        console.log("timeLockImp deployed");

        // deploy proxies
        const proxyFactory = new PProxy__factory(signer);
        const dTokenProxy = await proxyFactory.deploy();
        contracts.push({name: "dTokenProxy", address: dTokenProxy.address});
        const timeLockProxy = await proxyFactory.deploy();
        contracts.push({name: "timeLockProxy", address: timeLockProxy.address});

        await dTokenProxy.setImplementation(dTokenImp.address);
        await timeLockProxy.setImplementation(timeLockImp.address);

        const dToken = ERC20NonTransferableRewardsOwned__factory.connect(dTokenProxy.address, signer);
        const timeLock = TestSharesTimeLock__factory.connect(timeLockProxy.address, signer);

        // initialize contracts
        await dToken["initialize(string,string,address,address)"](taskArgs.name, taskArgs.symbol, taskArgs.rewardToken, signer.address, {gasLimit: 1000000});
        await timeLock["initialize(address,address,uint32,uint32,uint256)"](
            taskArgs.depositToken,
            dToken.address,
            taskArgs.minLockDuration,
            taskArgs.maxLockDuration,
            taskArgs.minLockAmount,
            {gasLimit: 1000000}
        );

        console.log("Set seconds per month");
        // await timeLock.setSecondsPerMonth(taskArgs.secondsPerMonth);
        await timeLock.setSecondsPerMonth(taskArgs.secondsPerMonth, {gasLimit: 1000000});
        
        // console.log("fetching depositToken");
        // const depositToken = await timeLock.depositToken();
        // console.log(depositToken);
        
        console.log("transfering ownership of dToken");
        await dToken.transferOwnership(timeLock.address, {gasLimit: 1000000});


        // console.log("getting staking data");
        // const data = await timeLock.getStakingData(signer.address);
        // console.log(data);
        

        console.table(contracts);
        console.log("done");
});

task("deploy-timelock-implementation", async(taskArgs, {ethers}) => {
    const signer = (await ethers.getSigners())[0];

    console.log(`Deploying from: ${signer.address}`);

    const contracts: any[] = [];

    const timeLockImp = await (new TestSharesTimeLock__factory(signer)).deploy();
    contracts.push({name: "timeLockImp", address: timeLockImp.address});
    console.log("timeLockImp deployed");

    console.table(contracts);
});