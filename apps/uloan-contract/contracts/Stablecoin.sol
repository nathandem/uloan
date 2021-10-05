//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/*
 * For tests only!
 */
contract Stablecoin is ERC20 {
    /*
     * Stablecoin has a fixed supply of 1 million token, with the default 18 digits of ERC20 tokens,
     * hence 1 million * 1e18 = 1e24 base units
     *
     * References:
     * https://docs.appery.io/docs/eth-app-example-part1)
     * https://docs.openzeppelin.com/contracts/4.x/erc20-supply#fixed-supply
     * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L47-L48
     */
    constructor(
        string memory shortName,
        string memory longName
    ) ERC20(shortName, longName) {
        _mint(msg.sender, 1000000000000000000000000);
    }
}
