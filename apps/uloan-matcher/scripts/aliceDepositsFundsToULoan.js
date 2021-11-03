const { ethers } = require("ethers");
const ULoanAbi = require('../abis/Uloan.json');
const StablecoinAbi = require('../abis/Stablecoin.json');


const OWNER_ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const ALICE_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const NODE_URL = 'http://localhost:8545';
const provider = new ethers.providers.JsonRpcProvider(NODE_URL);

// must be an account managed by the node (otherwise we don't get access to the account's private key)
const ownerSigner = provider.getSigner(OWNER_ADDRESS);
const aliceSigner = provider.getSigner(ALICE_ADDRESS);

const ULOAN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const aliceUloan = new ethers.Contract(ULOAN_ADDRESS, ULoanAbi, aliceSigner);

// call `Token.transfer` to given 40 tokens to address 2
const STABLECOIN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ownerStablecoin = new ethers.Contract(STABLECOIN_ADDRESS, StablecoinAbi, ownerSigner);
const aliceStablecoin = new ethers.Contract(STABLECOIN_ADDRESS, StablecoinAbi, aliceSigner);

const amount = ethers.utils.parseEther('100');
const minRiskLevel = 20;
const maxRiskLevel = 100;
const lockupPeriodInDays = 21;

async function introspectAliceFunds() {
    const aliceBalance = await ownerStablecoin.balanceOf(ALICE_ADDRESS);
    console.log(`balanceOf Alice: ${aliceBalance}`);
    const allowanceAliceToULoan = await ownerStablecoin.allowance(ALICE_ADDRESS, ULOAN_ADDRESS);
    console.log(`Allowance from Alice to uloan: ${allowanceAliceToULoan}`);
}

async function ownerTransferStablecoinsToAlice() {
    await ownerStablecoin.transfer(ALICE_ADDRESS, ethers.utils.parseEther('200'));
}

async function aliceApproveTransferFromULoan() {
    await aliceStablecoin.approve(ULOAN_ADDRESS, amount);
}

async function aliceDepositsFundsToULoan() {
    await aliceUloan.depositCapital(amount, minRiskLevel, maxRiskLevel, lockupPeriodInDays);
}

async function main() {
    await ownerTransferStablecoinsToAlice();
    await introspectAliceFunds();

    await aliceApproveTransferFromULoan();
    await introspectAliceFunds();

    await aliceDepositsFundsToULoan();
    await introspectAliceFunds();
}

main();
