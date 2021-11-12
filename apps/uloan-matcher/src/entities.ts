import { ethers } from 'ethers';


export interface NewLoan {
    id: string;
    amountRequested: string;
    creditScore: number;
    durationInDays: number;
};

export interface LoanCapitalProvider {
    id: ethers.BigNumber;
    amount: ethers.BigNumber;
};

export interface MatchedLoan {
    loanId: string,
    matchMakerAddress: string,
    loanCapitalProviders: LoanCapitalProvider[],
};

export interface NewCapitalProvider {
    id: string,
    amountAvailable: string,
    minRisk: number,
    maxRisk: number,
    lockUpPeriodInDays: number
}
