// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./IERC20Metadata.sol";


interface IERC20Rewards is IERC20Metadata {
	/**
	 * @dev Returns the total amount of rewards a given address is able to withdraw currently.
	 * @param owner Address of FundsDistributionToken holder
	 * @return A uint256 representing the available funds for a given account
	 */
	function withdrawableRewardsOf(address owner) external view returns (uint256);

	/**
	 * @dev This event emits when new funds are distributed
	 * @param by the address of the sender who distributed funds
	 * @param rewardsDistributed the amount of funds received for distribution
	 */
	event RewardsDistributed(address indexed by, uint256 rewardsDistributed);

	/**
	 * @dev This event emits when distributed funds are withdrawn by a token holder.
	 * @param by the address of the receiver of funds
	 * @param fundsWithdrawn the amount of funds that were withdrawn
	 */
	event RewardsWithdrawn(address indexed by, uint256 fundsWithdrawn);
}