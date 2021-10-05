const hre = require("hardhat");


// deploy script for local hardhat chain
async function main() {
    const [owner] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", owner.address);

    const Stablecoin = await hre.ethers.getContractFactory("Stablecoin");
    const stablecoin = await Stablecoin.deploy("UDAI", "UDAI stablecoin");

    await stablecoin.deployed();
    console.log("Stablecoin deployed to:", stablecoin.address);

    const ULoan = await hre.ethers.getContractFactory("ULoan");
    const uloan = await ULoan.deploy(stablecoin.address);

    await uloan.deployed();
    console.log("ULoan deployed to:", uloan.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
