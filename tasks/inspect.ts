import { task } from "hardhat/config";
import { ERC20NonTransferableRewardsOwned } from "../typechain/ERC20NonTransferableRewardsOwned";
import { ERC20NonTransferableRewardsOwned__factory } from "../typechain/factories/ERC20NonTransferableRewardsOwned__factory";
import { TestERC20__factory } from "../typechain/factories/TestERC20__factory";
import { SharesTimeLock__factory } from "../typechain/factories/SharesTimeLock__factory";
import { TestSharesTimeLock__factory } from "../typechain/factories/TestSharesTimeLock__factory";
import { PProxy__factory } from "../typechain/factories/PProxy__factory";
import { ContractFunctionVisibility } from "hardhat/internal/hardhat-network/stack-traces/model";
import { parseEther } from "ethers/lib/utils";

task("get-locks")
    .addParam("contract")
    .addParam("account")
    .setAction(async(taskArgs, {ethers}) => {
        const signer = (await ethers.getSigners())[0];
        const { contract, account } = taskArgs;
        const timeLock = SharesTimeLock__factory.connect(contract, signer);
        const stakingData = await timeLock.getStakingData(account);

        console.log(stakingData);
});
