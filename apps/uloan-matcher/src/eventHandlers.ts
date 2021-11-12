import { ethers } from 'ethers';

import { uloan } from './contracts';
import {
    LoanCapitalProvider,
    NewLoan,
    MatchedLoan,
    NewCapitalProvider,
} from './entities';
import {
    recordLoanRequested,
    recordLoanMatchedWithCapital,
    recordLoanPaidBack,
    recordNewCapitalProvided,
    recordCapitalProviderRecouped,
    recordLenderCapitalRecouped,
} from './logic';


// Nice thing with smart contract events from a controller/view perspective is that
// no validation is needed as the contract will always emit the same data shape.
// So only jobs of the controllers are to 1) log the call and 2) when needed, parse
// the data for the handler.
export default async function eventHandlers() {
    uloan.on('LoanRequested', async (
        loanId: ethers.BigNumber,
        amount: ethers.BigNumber,
        borrowerCreditScore: number,
        durationInDays: number
    ): Promise<void> => {
        const parsedLoanId = loanId.toString();
        console.log(`LoanRequested event for loanId: ${parsedLoanId}`);

        const newLoan: NewLoan = {
            id: parsedLoanId,
            amountRequested: amount.toString(),
            creditScore: borrowerCreditScore,
            durationInDays,
        };

        await recordLoanRequested(newLoan);
    });

    uloan.on('LoanMatchedWithCapital', async (
        loanId: ethers.BigNumber,
        matchMaker: string,
        loanCapitalProviders: LoanCapitalProvider[]
    ): Promise<void> => {
        const parsedLoanId = loanId.toString();
        console.log(`LoanRequested event for loanId: ${parsedLoanId}`);

        const matchedLoan: MatchedLoan = {
            loanId: parsedLoanId,
            matchMakerAddress: matchMaker,
            loanCapitalProviders,
        };

        await recordLoanMatchedWithCapital(matchedLoan);
    });

    uloan.on('LoanPaidBack', async (loanId: ethers.BigNumber): Promise<void> => {
        const parsedLoanId = loanId.toString();
        console.log(`LoanPaidBack event for loanId: ${parsedLoanId}`);

        await recordLoanPaidBack(parsedLoanId);
    });

    uloan.on('NewCapitalProvided', async (
        capitalProviderId: ethers.BigNumber,
        amount: ethers.BigNumber,
        minRiskLevel: number,  // passed as number because uint8 in contract
        maxRiskLevel: number,  // passed as number because uint8 in contract
        lockUpPeriodInDays: number,  // passed as number because uint16 in contract
    ): Promise<void> => {
        const parsedCapitalProviderId = capitalProviderId.toString();
        console.log(`NewCapitalProvided event for capitalProviderId: ${parsedCapitalProviderId}`);

        const newCapitalProvider: NewCapitalProvider = {
            id: parsedCapitalProviderId,
            amountAvailable: amount.toString(),
            minRisk: minRiskLevel,
            maxRisk: maxRiskLevel,
            lockUpPeriodInDays,
        };

        await recordNewCapitalProvided(newCapitalProvider);
    });

    uloan.on('CapitalProviderRecouped', async (capitalProviderId: ethers.BigNumber): Promise<void> => {
        const parsedCapitalProviderId = capitalProviderId.toString();
        console.log(`CapitalProviderRecouped event for capitalProviderId: ${parsedCapitalProviderId}`);

        await recordCapitalProviderRecouped(parsedCapitalProviderId);
    });

    uloan.on('LenderCapitalRecouped', async (capitalProviderIds: ethers.BigNumber[]): Promise<void> => {
        const parsedCapitalProviderIds = capitalProviderIds.map(
            capitalProviderId => capitalProviderId.toString()
        );
        console.log(`LenderCapitalRecouped event for capitalProviderIds: ${parsedCapitalProviderIds}`);

        await recordLenderCapitalRecouped(parsedCapitalProviderIds);
    });
}
