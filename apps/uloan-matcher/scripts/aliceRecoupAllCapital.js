const { ethers } = require("ethers");
const ULoanAbi = require('../abis/Uloan.json');
const StablecoinAbi = require('../abis/Stablecoin.json');


const ALICE_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const NODE_URL = 'http://localhost:8545';
const provider = new ethers.providers.JsonRpcProvider(NODE_URL);
const aliceSigner = provider.getSigner(ALICE_ADDRESS);

const ULOAN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const aliceUloan = new ethers.Contract(ULOAN_ADDRESS, ULoanAbi, aliceSigner);
const STABLECOIN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const aliceStablecoin = new ethers.Contract(STABLECOIN_ADDRESS, StablecoinAbi, aliceSigner);


async function introspectAliceFunds() {
    const aliceBalance = await aliceStablecoin.balanceOf(ALICE_ADDRESS);
    console.log(`balanceOf Alice: ${aliceBalance}`);
}

async function recoupAllCapital() {
    await aliceUloan.recoupAllCapital();
}

async function main() {
    await introspectAliceFunds();
    await recoupAllCapital();
    await introspectAliceFunds();
}

main();
