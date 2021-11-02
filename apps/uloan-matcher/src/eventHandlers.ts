import { ethers } from 'ethers';
// import { sql } from './postgres';
import uloanAbi from '../abis/Uloan.json';

require('dotenv').config();


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


export default function eventHandlers() {
    const LOAN_STATES = {
        REQUESTED: 'REQUESTED',
        FUNDED: 'FUNDED',
        WITHDRAWN: 'WITHDRAWN',
        PAYED_BACK: 'PAYED_BACK',
        CLOSED: 'CLOSED',
    };

    uloan.on('NewCapitalProvided', async (capitalProviderId, amount, minRiskLevel, maxRiskLevel, lockUpPeriodInDays, event) => {
        console.log(`NewCapitalProvided event`);

        console.log(event);
    });
}

eventHandlers();
