import { ethers } from 'ethers';

import prisma from './db';
import { uloan } from './contracts';
import conf from './conf';
import { NewLoan, MatchedLoan, NewCapitalProvider } from './entities';


const ZERO = '0';

/*
 * Add new loan to table with `filled` set to false.
 */
export const recordLoanRequested = async (newLoan: NewLoan): Promise<void> => {
    const newLoanData = { ...newLoan, filled: false };

    try {
        // ethers.js event listener sometimes take past events when initiated,
        // use `upsert` to avoid conflicts
        await prisma.loan.upsert({
            where: { id: newLoanData.id },
            update: newLoanData,
            create: newLoanData,
        });
    } catch (e) {
        console.error(e);
    }
};

/*
 * Reduce CapitalProvider:amountAvailable by amountRequested & set loan:filled to true.
 */
export const recordLoanMatchedWithCapital = async (matchedLoan: MatchedLoan): Promise<void> => {
    const updateMatchedLoan = prisma.loan.update({
        where: { id: matchedLoan.loanId },
        data: { filled: true },
    });

    const updateCapitalProvidersAmountAvailable = [];
    const createLoanCapitalProviderMatchs = [];

    for (const loanCapitalProvider of matchedLoan.loanCapitalProviders) {
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
            loanId: matchedLoan.loanId,
            capitalProviderId: parsedCapitalProviderId,
            amountContributed: loanCapitalProvider.amount.toString(),
            isInitiatedByUs: (matchedLoan.matchMakerAddress === conf.MATCHER_ADDRESS) ? true : false,
            feesTaken: false,
        };
        createLoanCapitalProviderMatchs.push(
            prisma.match.upsert({
                where: {
                    // this syntax is really weird...
                    loanId_capitalProviderId: {
                        loanId: matchedLoan.loanId,
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
};

/*
 * Query capitalProviders to get new `amountAvailable`, i.e. it's either bigger than the amountAvailable
 * we had before or it has been withdrawn.
 */
export const recordLoanPaidBack = async (loanId: string): Promise<void> => {
    try {
        const completedLoan = await prisma.loan.findUnique({
            where: { id: loanId },
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
};

/*
 * Add CapitalProvider to table.
 */
export const recordNewCapitalProvided = async (newCapitalProvider: NewCapitalProvider): Promise<void> => {
    try {
        // ethers.js event listener sometimes take past events when initiated,
        // use `upsert` to avoid conflicts
        await prisma.capitalProvider.upsert({
            where: { id: newCapitalProvider.id },
            update: newCapitalProvider,
            create: newCapitalProvider,
        });
    } catch (e) {
        console.error(e);
    }
};

/*
 * Update amount to 0 for CapitalProvider.
 */
export const recordCapitalProviderRecouped = async (capitalProviderId: string): Promise<void> => {
    try {
        await prisma.capitalProvider.update({
            where: { id: capitalProviderId },
            data: { amountAvailable: ZERO },
        });
    } catch (e) {
        console.error(e);
    }
};

/*
 * Update all the lender's CapitalProvider:amountAvailable to 0.
 */
export const recordLenderCapitalRecouped = async (capitalProviderIds: string[]): Promise<void> => {
    try {
        await prisma.capitalProvider.updateMany({
            where: {
                id: { in: capitalProviderIds },
            },
            data: { amountAvailable: ZERO },
        });
    } catch (e) {
        console.error(e);
    }
};

// TODO: MATCHER ACTIONS
//      - Match (to call every at every new loan and capital provider, or every X seconds):
//          - only consider loans with state `Requested`/`filled:false`
//          - only consider capitalProviders with `amountAvailable` > 0
//          Note: query the smart contract before proposing a match because the funds of the CapitalProvider might have been withdrawn (or, later, the loan request might have been retracted)
//      - Get fees (to call from recordLoanPaidBack):
//          - keep track of the loan: get the fees, then set match:feesTaken:true
