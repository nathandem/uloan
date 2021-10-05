/*
 * Create a copy of ULoan hardhat generated ABI in `/abis`.
 * `/abis` is the directory in which uloan-web and uloan-backend read ULoan ABI.
 *
 * IMPORTANT:
 * This script should be called from the root of the project, else the paths won't
 * resolve properly. Best way to run this script is: `yarn run contract:compile`
 * from the root of the project.
 */

// const fs = require('fs');


// // constants

// const HARDHAT_ARTIFACT_DEFAULT_PATH_FOR_FLOAN_CONTRACT = './apps/uloan-contract/artifacts/contracts/ULoan.sol/ULoan.json';
// const FLOAN_BACKEND_ABIS_PATH = './apps/uloan-backend/abis/ULoan.json';
// // note: by default create-react-app doesn't allow import outside of `src`, let's stick with that
// const FLOAN_WEB_ABIS_PATH = './apps/uloan-web/src/abis/ULoan.json';


// // logic

// function getStringifiedULoanHardhatArtifact(uloanHardhatArtifactPath) {
//     try {
//         const uloanContractBuffer = fs.readFileSync(uloanHardhatArtifactPath);
//         return uloanContractBuffer.toString();
//     } catch (e) {
//         console.error('Issue getting the compile contract from hardhat default artifact location', error);
//     }
// }

// function writeULoanAbiToDestination(path, prettifiedULoanAbiString) {
//     try {
//         fs.writeFileSync(path, prettifiedULoanAbiString);
//     } catch (error) {
//         console.error(`Issue writting abi to ${path}`, error);
//     }
// }

// function main() {
//     const stringifiedULoanHardhatArtifact = getStringifiedULoanHardhatArtifact(HARDHAT_ARTIFACT_DEFAULT_PATH_FOR_FLOAN_CONTRACT);
//     const parsedULoanHardhatArtifact = JSON.parse(stringifiedULoanHardhatArtifact);
//     const prettifiedULoanAbiString = JSON.stringify(parsedULoanHardhatArtifact.abi, null, 4);

//     writeULoanAbiToDestination(FLOAN_BACKEND_ABIS_PATH, prettifiedULoanAbiString);
//     writeULoanAbiToDestination(FLOAN_WEB_ABIS_PATH, prettifiedULoanAbiString);
// }

// main()
