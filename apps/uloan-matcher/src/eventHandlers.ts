require('dotenv').config();

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client'
import uloanAbi from '../abis/Uloan.json';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
    errorFormat: 'pretty',
});


const provider = new ethers.providers.JsonRpcProvider(process.env.NODE_URL);
const uloan = new ethers.Contract(process.env.ULOAN_ADDRESS, uloanAbi, provider);

// event NewCapitalProvided(uint256 capitalProviderId, uint256 amount, uint8 minRiskLevel, uint8 maxRiskLevel, uint16 lockUpPeriodInDays);
// event LenderCapitalRecouped(uint256[] capitalProviderIds);
// event CapitalProviderRecouped(uint256 capitalProviderId);
// event LoanRequested(uint256 loanId, uint256 amount, uint8 borrowerCreditScore, uint16 durationInDays);
// event LoanWithdrawn(uint256 loanId);
// event LoanRepaymentMade(uint256 loanId, uint16 numberOfEpochsPaid, uint16 totalNumberOfEpochsToPay);
// event LoanPaidBack(uint256 loanId);
// event LoanMatchedWithCapital(uint256 loanId, address matchMaker, ProposedLoanCapitalProvider[] proposedLoanCapitalProviders);


// Required info to perform match & events/time to track:

// loan: loanId + amountRequested, creditScore, durationInDays/durationInEpochs + filled (internal)
//      - LoanRequested => add loan to table, filled:false
//      - LoanMatchedWithCapital => reduce CapitalProvider:amountAvailable by amountRequested & loan:filled:true
//      - LoanPaidBack => query capitalProviders to get new `amountAvailable` (it's bigger either than the amountAvailable we had before or it has been withdrawn)

// capitalProvider: capitalProviderId + amountAvailable, minRisk, maxRisk, lockUpPeriodInDays/lockUpPeriodInEpochs
//      - NewCapitalProvided => add CapitalProvider to table (id, amountAvailable, minRisk, maxRisk, lockUpPeriodInDays)
//      - LenderCapitalRecouped => update all the lender's CapitalProvider:amountAvailable to 0
//      - CapitalProviderRecouped => update amount to 0 for CapitalProvider

// match (M:M table): loanId, lenderId, amountContributed, feesTaken
// Actions:
//      - Match:
//          - only consider loans with state `Requested`/`filled:false`
//          - only consider capitalProviders with `amountAvailable` > 0
//      - Get fees:
//          - keep track of the loan: wait for LoanPaidBack then get the fees
// Store:
//      - LoanMatchedWithCapital => only store the matches if msg.sender == matchMaker (loanId, lenderId[], amountContributed[], feesTaken:false)
//      - LoanPaidBack => get fees THEN feesTaken:true

// TODO: make sure event LoanMatchedWithCapital returns `ProposedLoanCapitalProvider[]` as 2nd arg


export default async function eventHandlers() {
    const ZERO = '0';

    uloan.on('NewCapitalProvided', async (
        capitalProviderId: ethers.BigNumber,
        amount: ethers.BigNumber,
        minRiskLevel: number,  // passed as number because uint8 in contract
        maxRiskLevel: number,  // passed as number because uint8 in contract
        lockUpPeriodInDays: number,  // passed as number because uint16 in contract
        event: ethers.Event,
    ) => {
        const newCapitalProviderId = capitalProviderId.toString();

        console.log(`NewCapitalProvided event for capitalProviderId: ${newCapitalProviderId}`);

        // ethers.js event listener sometimes take past events when initiated,
        // use `upsert` to avoid conflicts
        const newCapitalProviderData = {
            id: newCapitalProviderId,
            amountAvailable: amount.toString(),
            minRisk: minRiskLevel,
            maxRisk: maxRiskLevel,
            lockUpPeriodInDays,
        };

        try {
            await prisma.capitalProvider.upsert({
                where: { id: newCapitalProviderId },
                update: newCapitalProviderData,
                create: newCapitalProviderData,
            });
        } catch (e) {
            console.error(e);
        }
    });

    uloan.on('CapitalProviderRecouped', async (capitalProviderId: ethers.BigNumber) => {
        const capitalProviderIdToSetToZero = capitalProviderId.toString();

        console.log(`CapitalProviderRecouped event for capitalProviderId: ${capitalProviderIdToSetToZero}`);

        try {
            await prisma.capitalProvider.update({
                where: { id: capitalProviderIdToSetToZero },
                data: { amountAvailable: ZERO },
            });
        } catch (e) {
            console.error(e);
        }
    });

    uloan.on('LenderCapitalRecouped', async (capitalProviderIds: ethers.BigNumber[]) => {
        const capitalProviderIdsToSetToZero = capitalProviderIds.map(
            capitalProviderId => capitalProviderId.toString()
        );

        console.log(`LenderCapitalRecouped event for capitalProviderIds: ${capitalProviderIdsToSetToZero}`);

        try {
            await prisma.capitalProvider.updateMany({
                where: {
                    id: { in: capitalProviderIdsToSetToZero },
                },
                data: { amountAvailable: ZERO },
            });
        } catch (e) {
            console.error(e);
        }
    });
}

eventHandlers()
    .catch((e) => {
        throw e
    })
    .finally(async () => {
        await prisma.$disconnect()
    });
