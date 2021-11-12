import { ethers } from 'ethers';

import prisma from './db';
import conf from './conf';


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
//          Note: query the smart contract before proposing a match because the funds of the CapitalProvider might have been withdrawn (or, later, the loan request might have been retracted)
//      - Get fees:
//          - keep track of the loan: wait for LoanPaidBack then get the fees
// Store:
//      - LoanMatchedWithCapital => store all the matches, else not possible to know which lenders to update afterwards
//      - LoanPaidBack => get fees THEN feesTaken:true

// TODO: make sure event LoanMatchedWithCapital returns `ProposedLoanCapitalProvider[]` as 2nd arg

interface LoanCapitalProvider {
    id: ethers.BigNumber;
    amount: ethers.BigNumber;
};

export default async function eventHandlers(uloan: ethers.Contract) {
    const ZERO = '0';

    uloan.on('LoanRequested', async (
        loanId: ethers.BigNumber,
        amount: ethers.BigNumber,
        borrowerCreditScore: number,
        durationInDays: number
    ) => {
        const newloanId = loanId.toString();
        console.log(`LoanRequested event for loanId: ${newloanId}`);

        // ethers.js event listener sometimes take past events when initiated,
        // use `upsert` to avoid conflicts
        const newLoanData = {
            id: newloanId,
            amountRequested: amount.toString(),
            creditScore: borrowerCreditScore,
            durationInDays,
            filled: false,
        };

        try {
            await prisma.loan.upsert({
                where: { id: newloanId },
                update: newLoanData,
                create: newLoanData,
            });
        } catch (e) {
            console.error(e);
        }
    });

    uloan.on('LoanMatchedWithCapital', async (
        loanId: ethers.BigNumber,
        matchMaker: string,
        loanCapitalProviders: LoanCapitalProvider[],
        event: ethers.Event,
    ) => {
        const parsedLoanId = loanId.toString();
        console.log(`LoanRequested event for loanId: ${parsedLoanId}`);

        const updateMatchedLoan = prisma.loan.update({
            where: { id: parsedLoanId },
            data: { filled: true },
        });

        const updateCapitalProvidersAmountAvailable = [];
        const createLoanCapitalProviderMatchs = [];

        for (const loanCapitalProvider of loanCapitalProviders) {
            const parsedCapitalProviderId = loanCapitalProvider.id.toString();

            const loanCapitalProviderToReduce = await prisma.capitalProvider.findUnique({
                where: { id: parsedCapitalProviderId }
            });
            // unfortunately atomic number operations are not available on strings and decimals, so I need to pull the values first
            // https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#atomic-number-operations
            const newAmountAvailable = ethers.BigNumber.from(loanCapitalProviderToReduce?.amountAvailable).sub(loanCapitalProvider.amount);

            updateCapitalProvidersAmountAvailable.push(
                prisma.capitalProvider.update({
                    where: { id: parsedCapitalProviderId },
                    data: { amountAvailable: newAmountAvailable.toString() },
                })
            );

            const newMatchData = {
                loanId: parsedLoanId,
                capitalProviderId: parsedCapitalProviderId,
                amountContributed: loanCapitalProvider.amount.toString(),
                isInitiatedByUs: (matchMaker === conf.MATCHER_ADDRESS) ? true : false,
                feesTaken: false,
            };
            createLoanCapitalProviderMatchs.push(
                prisma.match.upsert({
                    where: {
                        // this syntax is really weird...
                        loanId_capitalProviderId: {
                            loanId: parsedLoanId,
                            capitalProviderId: parsedCapitalProviderId,
                        }
                    },
                    update: newMatchData,
                    create: newMatchData,
                })
            );
        }

        // Wrap operations in a big transaction
        try {
            await prisma.$transaction([
                updateMatchedLoan,
                ...updateCapitalProvidersAmountAvailable,
                ...createLoanCapitalProviderMatchs
            ]);
        } catch (e) {
            console.error(e);
        }
    });

    uloan.on('LoanPaidBack', async (loanId: ethers.BigNumber) => {
        const completedLoanId = loanId.toString();
        console.log(`LoanPaidBack event for loanId: ${completedLoanId}`);

        try {
            const completedLoan = await prisma.loan.findUnique({
                where: { id: completedLoanId },
                include: { lendersMatchedByMatcher: true },
            });

            const capitalProviderIdsToUpdate = completedLoan.lendersMatchedByMatcher.map(match => match.capitalProviderId);
            const updateQueries = [];
            for (const capitalProviderIdToUpdate of capitalProviderIdsToUpdate) {
                const latestAmountAvailable = (await uloan.capitalProviders(capitalProviderIdToUpdate)).amountAvailable;

                updateQueries.push(
                    prisma.capitalProvider.update({
                        where: { id: capitalProviderIdToUpdate },
                        data: { amountAvailable: latestAmountAvailable },
                    })
                );
            }

            try {
                // just a way to group the queries together in one call
                await prisma.$transaction([ ...updateQueries ]);
            } catch (e) {
                console.error(e);
            }
        } catch (e) {
            console.error(e);
        }
    });

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
