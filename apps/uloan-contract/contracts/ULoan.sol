//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract ULoan {

    // STATE

    // Protocol wide parameters

    IERC20 public stablecoin;  // TODO: allow admin to change this, in case of emergency with said stablecoin

    uint16 public ULOAN_EPOCH_IN_DAYS = 7;  // arbitrary value to be debated

    uint256 public MIN_DEPOSIT_AMOUNT = 10e18;  // arbitrary value to be debated
    uint256 public MIN_LOCKUP_PERIOD_IN_DAYS = ULOAN_EPOCH_IN_DAYS;  // arbitrary value to be debated
    uint256 public MIN_RISK_LEVEL = 1;
    uint256 public MAX_RISK_LEVEL = 100;

    uint256 public MIN_LOAN_AMOUNT = MIN_DEPOSIT_AMOUNT;  // arbitrary value to be debated
    uint256 public MIN_LOAN_DURATION_IN_DAYS = ULOAN_EPOCH_IN_DAYS;  // arbitrary value to be debated
    uint256 public MAX_LOAN_DURATION_IN_DAYS = ULOAN_EPOCH_IN_DAYS * 52;  // arbitrary value to be debated

    // Note: *_IN_CENTILE refers to an internal representation of fixed-point numbers, with a precision to a hundredth.
    // For example, 100 means 1, 40 means 0.40
    uint16 public RISK_FREE_RATE_IN_CENTILE = 100;
    uint16 public RISK_COEFFICIENT_IN_CENTILE = 30;  // arbitrary value to be debated
    uint16 public DURATION_COEFFICIENT_IN_CENTILE = 30;  // arbitrary value to be debated
    uint16 public PROTOCOL_FEE_IN_CENTILE = 300;  // arbitrary value to be debated


    // Lending and loan specific state

    struct FundedLoan {
        uint256 loanId;  // the key to find the loan struct in `loans`
        uint256 amountContributed;  // constant value, won't change over time
        uint256 amountToReceiveBack;  // constant value (amountContributed + expected interests), computed when capital is matched to the loan
        uint256 amountPaidBack;  // variable, grows as the borrower pays back the loans+interests
    }
    struct CapitalProvider {
        address lender;
        uint8 minRiskLevel;  // the least risky value is MIN_RISK_LEVEL
        uint8 maxRiskLevel;  // the most risky value is MAX_RISK_LEVEL
        uint16 lockUpPeriodInDays;  // constant used for loan matching, giving the max number of days that the funds can be locked in a loan
        uint256 amountProvided;  // constant value, this value won't ever change. New deposits by existing lenders leads to the creation of new CapitalProvider structs
        uint256 amountAvailable;  // at the beginning, amountAvailable == amountProvided, but it will change over time because 1) funds will be lent, 2) interests will be earnt, 3) lender will recoup some or all of this amount
        FundedLoan[] fundedLoans;
    }
    uint256 lastCapitalProviderId;
    mapping(uint256 => CapitalProvider) capitalProviders;

    struct Lender {
        uint256 lenderId;  // the key to find the `CapitalProvider` struct in `capitalProviders`
        uint256 amountContributed;  // constant, won't change over time
        uint256 amountToReceiveBack;  // constant (amountContributed + expected interests), computed when capital is matched to the loan
        uint256 amountPaidBack;  // variable, grows as the borrower pays back the loans+interests
    }
    enum LoanState { Requested, Funded, BeingPaidBack, PayedBack, Closed }
    struct Loan {
        address borrower;
        uint8 creditScore;
        uint256 lastActionTimestamp;  // versatile variable storing the timestamp of the block at which the last action took place. An action occurs everytime the loan changes its state, when it is Requested, Funded, BeingPaidBack (in this state, refer to `numberOfEpochsPaid` to get a sense of the progress in repayment of the loan - and of potential delay) and PayedBack.
        uint16 durationInDays;
        uint256 amountRequested;
        uint256 amountToRepay;  // sums amountRequested + all the interest payments (i.e. amountRequested * (APY * durationInDays / 365))
        uint16 totalNumberOfEpochsToPay;  // fixed value
        uint16 numberOfEpochsPaid;  // increased by one every payment
        uint256 amountToRepayEveryEpoch;
        Lender[] lenders;
        LoanState state;
        string closeReason;  // reason why the loan is Closed (to be sourced from an enum)
    }
    uint256 lastLoanId;
    mapping(uint256 => Loan) public loans;

    mapping(address => uint8) creditScores;
    mapping(address => uint256) feesEntitled;  // loan fee go to the creator of the match between a loan and the lender (or set of lenders)


    // EVENTS
    event NewCapitalProvided(uint256 capitalProviderId, uint256 amount, uint8 minRiskLevel, uint8 maxRiskLevel, uint16 lockUpPeriodInDays);
    event CapitalRecouped(uint256 capitalProviderId, uint256 amountToRecoup);
    event LoanRequested(uint256 loanId, uint256 amount, uint8 borrowerCreditScore, uint16 durationInDays);
    event LoanWithdrawn(uint256 loanId);
    event LoanPaidBack(uint256 loanId);
    event LoanMatchedWithCapital(uint256 loanId);  // listeners should query the protocol to get the detail of the capital providers attached to the loan


    // CONSTRUCTOR
    constructor(address _stablecoin) {
        stablecoin = IERC20(_stablecoin);
    }


    // PUBLIC FUNCTIONS

    /*
     * Runs the interest rate formula for lender with the incoming parameters, once with the min risk level
     * and one with the max risk level the lender is willing to take. This gives the lender a range of what he/she
     * can expect from the loan.
     *
     * ULoan renumerates lenders not for the risk level of the borrowers they lend to but also for the duration
     * during which they lend. As such, the estimated interests vary based on the duration.
     * The return percentages assume that the funds are lent to a loan (or multiple loans) matching exactly
     * the lock-up period specified by the lender. We should let the user know that the return will be lower if his capital
     * is matched with a shorter loan. Yet, we should add that, if that's the case, he can leave his capital on the protocol
     * to have his funds roll to another loan.
     */
    function getReturnEstimate(
        uint256 _amount,
        uint8 _minRiskLevel,
        uint8 _maxRiskLevel,
        uint16 _lockUpPeriodInDays
    ) public view returns (uint256, uint256) {
        require(_maxRiskLevel >= _minRiskLevel, "The max risk level can't be smaller than the min risk level");
        require(_minRiskLevel >= MIN_RISK_LEVEL, "The min risk level can't be smaller than MIN_RISK_LEVEL");
        require(_maxRiskLevel <= MAX_RISK_LEVEL, "The max risk level can't be above MAX_RISK_LEVEL");
        require(_lockUpPeriodInDays >= MIN_LOCKUP_PERIOD_IN_DAYS, "The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
        require(_amount >= MIN_DEPOSIT_AMOUNT, "The amount can't be lower than MIN_DEPOSIT_AMOUNT");

        uint16 minInterestRateInCentile = _computeLenderInterestRateInCentile(_minRiskLevel, _lockUpPeriodInDays);
        uint16 maxInterestRateInCentile = _computeLenderInterestRateInCentile(_maxRiskLevel, _lockUpPeriodInDays);

        uint256 minReturnEstimate = _amount * minInterestRateInCentile;
        uint256 maxReturnEstimate = _amount * maxInterestRateInCentile;

        return (minReturnEstimate, maxReturnEstimate);
    }

    /*
     * Transfer ERC20 stablecoins from lender to contract's address/balance, create an entry for the lender accordingly.
     * Function assumes that the amount has been previously approved by the lender on the ERC20 contract.
     * Emit event that any service looking to perform matching for the protocol can listen to.
     */
    function depositCapital(
        uint256 _amount,
        uint8 _minRiskLevel,
        uint8 _maxRiskLevel,
        uint16 _lockUpPeriodInDays
    ) public {
        require(_maxRiskLevel >= _minRiskLevel, "The max risk level can't be smaller than the min risk level");
        require(_minRiskLevel >= MIN_RISK_LEVEL, "The min risk level can't be smaller than MIN_RISK_LEVEL");
        require(_maxRiskLevel <= MAX_RISK_LEVEL, "The max risk level can't be above MAX_RISK_LEVEL");
        require(_lockUpPeriodInDays >= MIN_LOCKUP_PERIOD_IN_DAYS, "The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
        require(_amount >= MIN_DEPOSIT_AMOUNT, "The amount can't be lower than MIN_DEPOSIT_AMOUNT");

        bool success = stablecoin.transferFrom(msg.sender, address(this), _amount);
        require(success, "The transfer of funds failed, do you have enough funds?");

        lastCapitalProviderId++;
        CapitalProvider storage newCapitalProvider = capitalProviders[lastCapitalProviderId];
        newCapitalProvider.lender = msg.sender;
        newCapitalProvider.minRiskLevel = _minRiskLevel;
        newCapitalProvider.maxRiskLevel = _maxRiskLevel;
        newCapitalProvider.lockUpPeriodInDays = _lockUpPeriodInDays;
        newCapitalProvider.amountProvided = _amount;
        newCapitalProvider.amountAvailable = _amount;

        emit NewCapitalProvided(lastCapitalProviderId, _amount, _minRiskLevel, _maxRiskLevel, _lockUpPeriodInDays);
    }

    /*
     * Lender gets back his money + interest (CapitalProvider.amountAvailable).
     */
    function recoupCapital(uint256 _capitalProviderId) public {
        require(_capitalProviderId <= lastCapitalProviderId, "This capital provider doesn't exist");

        CapitalProvider storage capitalProvider = capitalProviders[_capitalProviderId];
        uint256 amountToRecoup = capitalProvider.amountAvailable;

        require(capitalProvider.lender == msg.sender, "You can't withdraw funds you didn't provide in the first place");
        require(amountToRecoup >= 0, "You currently have nothing to withdraw");

        bool success = stablecoin.transfer(capitalProvider.lender, amountToRecoup);
        require(success, "The transfer of funds from ULoan to your account failed");

        capitalProvider.amountAvailable = 0;

        emit CapitalRecouped(_capitalProviderId, amountToRecoup);
    }

    /*
     * Returns an interest on a declarative basis. In other words, the prospective borrower is free to pass
     * a credit score which doesn't correspond to the one he/she would receive when calling the dedicated function.
     *
     * Important note: the amount is return in centile.
     */
    function getInterestEstimate(uint256 _amount, uint8 _creditScore, uint16 _durationInDays) public view returns (uint16) {
        require(_durationInDays >= MIN_LOAN_DURATION_IN_DAYS, "The lock-up period can't be shorter than MIN_LOAN_DURATION_IN_DAYS");
        require(_durationInDays <= MAX_LOAN_DURATION_IN_DAYS, "The lock-up period can't be longer than MAX_LOAN_DURATION_IN_DAYS");
        require(_durationInDays % ULOAN_EPOCH_IN_DAYS == 0, "The loan duration (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
        require(_amount >= MIN_LOAN_AMOUNT, "The amount can't be lower than MIN_LOAN_AMOUNT");

        return _computeBorrowerInterestRateInCentile(_creditScore, _durationInDays);
    }

    /*
     * Initiate a loan request, which then needs to be matched with provided capital.
     * Emit an event that any service looking to perform matching for the protocol can listen to.
     */
    function requestLoan(uint256 _amount, uint16 _durationInDays) public {
        uint8 borrowerCreditScore = creditScores[msg.sender];
        require(borrowerCreditScore > 0, "You must have a credit score to request a loan. Get one first!");
        require(_durationInDays >= MIN_LOAN_DURATION_IN_DAYS, "The lock-up period can't be shorter than MIN_LOAN_DURATION_IN_DAYS");
        require(_durationInDays <= MAX_LOAN_DURATION_IN_DAYS, "The lock-up period can't be longer than MAX_LOAN_DURATION_IN_DAYS");
        require(_durationInDays % ULOAN_EPOCH_IN_DAYS == 0, "The loan duration (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
        require(_amount >= MIN_LOAN_AMOUNT, "The amount can't be lower than MIN_LOAN_AMOUNT");

        uint256 amountToRepay = _amount * (1 + _computeBorrowerInterestRateInCentile(borrowerCreditScore, _durationInDays));
        uint16 totalNumberOfEpochsToPay = _durationInDays / ULOAN_EPOCH_IN_DAYS;

        lastLoanId++;
        Loan storage newLoan = loans[lastLoanId];
        newLoan.borrower = msg.sender;
        newLoan.creditScore = borrowerCreditScore;
        newLoan.lastActionTimestamp = block.timestamp;
        newLoan.durationInDays = _durationInDays;
        newLoan.amountRequested = _amount;
        newLoan.amountToRepay = amountToRepay;
        newLoan.numberOfEpochsPaid = uint8(0);
        newLoan.totalNumberOfEpochsToPay = totalNumberOfEpochsToPay;
        newLoan.amountToRepayEveryEpoch = _amount / totalNumberOfEpochsToPay;
        newLoan.state = LoanState.Requested;

        emit LoanRequested(lastLoanId, _amount, borrowerCreditScore, _durationInDays);
    }

    function withdrawLoanFunds(uint256 _loanId) public {
        Loan storage loan = loans[_loanId];

        require(loan.borrower == msg.sender, "You cannot withdraw funds from a funds you didn't initiate");
        require(loan.state == LoanState.Funded, "The loan must be funded to be withdrawn");

        bool success = stablecoin.transfer(loan.borrower, loan.amountRequested);
        require(success, "The transfer of funds failed");

        loan.state = LoanState.BeingPaidBack;

        emit LoanWithdrawn(_loanId);
    }

    /*
     * Public function called by borrower, or programmatically by the crypto app user uses, to payback
     * the loan according to the repayment schedule.
     *
     * Elements related to loan payment are the following:
     * - ULOAN_EPOCH_IN_DAYS gives the frequency of payment in days
     * - loan.lastActionTimestamp gives the last payment date/timestamp
     * - loan.numberOfEpochsPaid gives the number of payments made since the emission of the loan
     * - loan.totalNumberOfEpochsToPay gives the total amount of payments to be made to repay the loan in full
     * - loan.amountToRepayEveryEpoch gives the amount to repay every epoch/period (in the stablecoin decimal)
     */
    function payLoan(uint _loanId) public {
        Loan storage loan = loans[_loanId];

        require(loan.borrower == msg.sender, "Loans should be paid back by those who initiate them");
        require(loan.state == LoanState.BeingPaidBack, "The loan is ready for repayment yet");

        bool success = stablecoin.transferFrom(msg.sender, address(this), loan.amountToRepayEveryEpoch);
        require(success, "The transfer of funds failed, do you have enough funds?");

        loan.lastActionTimestamp = block.timestamp;
        loan.numberOfEpochsPaid = loan.numberOfEpochsPaid + 1;

        if (loan.numberOfEpochsPaid == loan.totalNumberOfEpochsToPay) {
            emit LoanPaidBack(_loanId);
        }
    }

    function matchLoanWithCapital(
        uint[] calldata _capitalProviderIds,
        uint[] calldata _capitalProviderAmounts,
        uint _loanId
    ) external {
        Loan storage loan = loans[_loanId];

        // Initial verications
        require(_capitalProviderIds.length == _capitalProviderAmounts.length, "The length of the provided arguments doesn't match");

        uint256 sumOfAmounts;
        for (uint256 i = 0; i < _capitalProviderAmounts.length; i++) {
            sumOfAmounts += _capitalProviderAmounts[i];
        }
        require(loan.amountRequested == sumOfAmounts, "The sum of the amounts provided doesn't match the amount requested for this loan.");

        for (uint256 i = 0; i <= _capitalProviderIds.length; i++) {
            require(_capitalProviderIds[i] <= lastCapitalProviderId, "This capital provider doesn't exist");
            CapitalProvider storage loanCapitalProvider = capitalProviders[_capitalProviderIds[i]];

            // Check lender has enough capital, risk tolerance and duration
            require(loanCapitalProvider.amountAvailable >= _capitalProviderAmounts[i], "One or more of the capital providers doesn't have enough capital to fund the loan in the proportion proposed");
            require(loanCapitalProvider.minRiskLevel >= _creditScoreToRiskLevel(loan.creditScore), "The credit score of the loan's borrower is too high for the lender (loan not aggressive enough)");
            require(loanCapitalProvider.maxRiskLevel <= _creditScoreToRiskLevel(loan.creditScore), "The credit score of the loan's borrower is too low for the lender (loan too risk)");
            require(loanCapitalProvider.lockUpPeriodInDays >= loan.durationInDays, "One or more of the capital providers lock up period isn't high enough to match that of the loan");

            // If the checks pass, reflect the matching of the capital with the loan in the capitalProvider and the loan
            uint256 amountToReceiveBack = _capitalProviderAmounts[i] * (1 + _computeLenderInterestRateInCentile(_creditScoreToRiskLevel(loan.creditScore), loan.durationInDays));

            // Adjust the capital provider side of the matching
            loanCapitalProvider.fundedLoans.push(FundedLoan({
                loanId: _loanId,
                amountContributed: _capitalProviderAmounts[i],
                amountToReceiveBack: amountToReceiveBack,
                amountPaidBack: 0
            }));

            loanCapitalProvider.amountAvailable -= _capitalProviderAmounts[i];

            // Adjust the loan side of the matching
            loan.lenders.push(Lender({
                lenderId: _capitalProviderIds[i],
                amountContributed: _capitalProviderAmounts[i],
                amountToReceiveBack: amountToReceiveBack,
                amountPaidBack: 0
            }));
        }

        loan.state = LoanState.Funded;
        loan.lastActionTimestamp = block.timestamp;

        emit LoanMatchedWithCapital(_loanId);
    }


    // PRIVATE FUNCTIONS

    function _computeBorrowerInterestRateInCentile(uint8 _creditScore, uint16 _durationInDays) private view returns (uint16) {
        // TODO: this formula returns values way too high! Keep the same inputs, but tweak it to return more reasonable rates.
        return RISK_FREE_RATE_IN_CENTILE + ((RISK_COEFFICIENT_IN_CENTILE * _creditScoreToRiskLevel(_creditScore)) * (DURATION_COEFFICIENT_IN_CENTILE * _durationInDays));
    }

    function _computeLenderInterestRateInCentile(uint8 _riskLevel, uint16 _durationInDays) private view returns (uint16) {
        uint16 borrowerRateInCentile = _computeBorrowerInterestRateInCentile(_riskLevelToCreditScore(_riskLevel), _durationInDays);

        return borrowerRateInCentile * (1 - PROTOCOL_FEE_IN_CENTILE);
    }

    function _creditScoreToRiskLevel(uint8 _creditScore) private pure returns (uint8) {
        return (100 - _creditScore);
    }

    function _riskLevelToCreditScore(uint8 _riskLevel) private pure returns (uint8) {
        return (100 - _riskLevel);
    }
}
