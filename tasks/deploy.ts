import { task } from "hardhat/config";
import { ERC20NonTransferableDividendsOwned } from "../typechain/ERC20NonTransferableDividendsOwned";
import { ERC20NonTransferableDividendsOwned__factory } from "../typechain/factories/ERC20NonTransferableDividendsOwned__factory"
import { SharesTimeLock__factory } from "../typechain/factories/SharesTimeLock__factory";

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

        const dToken = await (new ERC20NonTransferableDividendsOwned__factory(signer)).deploy(
            taskArgs.rewardToken,
            taskArgs.name,
            taskArgs.symbol
        );   
        console.log(`dToken deployed at: ${dToken.address}`);

        const sharesTimeLock = await (new SharesTimeLock__factory(signer)).deploy(
            taskArgs.depositToken,
            dToken.address,
            taskArgs.minLockDuration,
            taskArgs.maxLockDuration,
            taskArgs.minLockAmount
        );
        console.log(`sharesTimeLock deployed at: ${sharesTimeLock.address}`);

        const tx = await dToken.transferOwnership(sharesTimeLock.address);
        console.log(`dToken ownership transfered at ${tx.hash}`);
        
        console.log(`To verify dToken run: npx hardhat verify ${dToken.address} ${taskArgs.rewardToken} ${taskArgs.name} ${taskArgs.symbol} --network ${network.name}`);
        console.log(`To verify sharesTimeLock run: npx hardhat verify ${sharesTimeLock.address} ${taskArgs.depositToken} ${dToken.address} ${taskArgs.minLockDuration} ${taskArgs.maxLockDuration} ${taskArgs.minLockAmount} --network ${network.name}`);
});