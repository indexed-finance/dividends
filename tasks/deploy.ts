import { task } from "hardhat/config";
import { ERC20NonTransferableRewardsOwned } from "../typechain/ERC20NonTransferableRewardsOwned";
import { ERC20NonTransferableRewardsOwned__factory } from "../typechain/factories/ERC20NonTransferableRewardsOwned__factory"
import { SharesTimeLock__factory } from "../typechain/factories/SharesTimeLock__factory";
import { PProxy__factory } from "../typechain/factories/PProxy__factory";
import { ContractFunctionVisibility } from "hardhat/internal/hardhat-network/stack-traces/model";

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

        dTokenProxy.setImplementation(dTokenImp.address);
        timeLockProxy.setImplementation(timeLockImp.address);

        const dToken = ERC20NonTransferableRewardsOwned__factory.connect(dTokenProxy.address, signer);
        const timeLock = SharesTimeLock__factory.connect(timeLockProxy.address, signer);

        // initialize contracts
        await dToken["initialize(string,string,address)"](taskArgs.name, taskArgs.symbol, taskArgs.rewardToken);
        await timeLock["initialize(address,address,uint32,uint32,uint256)"](
            taskArgs.depositToken,
            taskArgs.rewardToken,
            taskArgs.minLockDuration,
            taskArgs.maxLockDuration,
            taskArgs.minLockAmount
        );

        console.table(contracts);
        console.log("done");
});