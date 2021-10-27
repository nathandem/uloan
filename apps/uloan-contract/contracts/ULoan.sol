//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract ULoan is Ownable {

    using SafeMath for uint256;

    // STATE

    // Protocol wide parameters

    IERC20 public stablecoin;

    uint16 public ULOAN_EPOCH_IN_DAYS = 7;  // arbitrary value to be debated
    uint16 public ULOAN_EPOCH_IN_YEAR = 52;

    uint256 public MIN_DEPOSIT_AMOUNT = 10e18;  // arbitrary value to be debated
    uint256 public MIN_LOCKUP_PERIOD_IN_DAYS = ULOAN_EPOCH_IN_DAYS;  // arbitrary value to be debated
    uint256 public MIN_RISK_LEVEL = 1;
    uint256 public MAX_RISK_LEVEL = 100;

    uint256 public MIN_LOAN_AMOUNT = MIN_DEPOSIT_AMOUNT;  // arbitrary value to be debated
    uint256 public MAX_LOAN_AMOUNT = MIN_DEPOSIT_AMOUNT * 10e6;  // arbitrary value to be debated
    uint256 public MIN_LOAN_DURATION_IN_DAYS = ULOAN_EPOCH_IN_DAYS;  // arbitrary value to be debated
    uint256 public MAX_LOAN_DURATION_IN_DAYS = ULOAN_EPOCH_IN_DAYS * 52;  // arbitrary value to be debated

    // Following values are in basis points. For example, 100 equals 1, 40 equals 0.40
    uint16 public RISK_FREE_RATE_BP = 100;  // value to be fetch from a "risk-free" protocol like Uniswap
    uint16 public RISK_COEFFICIENT_BP = 10;  // arbitrary value to be debated
    uint16 public EPOCH_DURATION_COEFFICIENT_BP = 2;  // arbitrary value to be debated
    uint16 public FEE_TO_MATCH_INITIATOR_BP = 100;  // arbitrary value to be debated
    uint16 public FEE_TO_PROTOCOL_OWNER_BP = 100;  // arbitrary value to be debated
    uint16 public FEE_BP = FEE_TO_MATCH_INITIATOR_BP + FEE_TO_PROTOCOL_OWNER_BP;


    // Lending and loan specific state

    struct CapitalProvider {
        address lender;
        uint8 minRiskLevel;  // the least risky value is MIN_RISK_LEVEL
        uint8 maxRiskLevel;  // the most risky value is MAX_RISK_LEVEL
        uint16 lockUpPeriodInDays;  // constant used for loan matching, giving the max number of days that the funds can be locked in a loan
        uint256 amountProvided;  // constant value, this value won't ever change. New deposits by existing lenders leads to the creation of new CapitalProvider structs
        uint256 amountAvailable;  // at the beginning, amountAvailable == amountProvided, but it will change over time because 1) funds will be lent, 2) interests will be earnt, 3) lender will recoup some or all of this amount
        uint256[] fundedLoanIds;
    }
    uint256 public lastCapitalProviderId;
    mapping(uint256 => CapitalProvider) public capitalProviders;
    // dynamic storage arrays can't be returned as-is, need to cast them into memory arrays in function then return them (see `_getLendersToCapitalProviders`)
    mapping(address => uint256[]) public lendersToCapitalProviders;  // quick relation between lenders and the capital they lend

    struct Lender {
        uint256 lenderId;  // the key to find the `CapitalProvider` struct in `capitalProviders`
        uint256 amountContributed;  // constant, won't change over time
        uint256 totalAmountToGetBack;  // constant = (amountContributed + interests) - (matcher fee + protocol fee)
        uint256 amountPaidBack;  // variable, grows as the borrower pays back the loans+interests
    }
    enum LoanState { Requested, Funded, Withdrawn, BeingPaidBack, PayedBack, Closed }
    struct Loan {
        address borrower;
        uint8 creditScore;
        uint256 lastActionTimestamp;  // versatile variable storing the timestamp of the block at which the last action took place. An action occurs everytime the loan changes its state, when it is Requested, Funded, BeingPaidBack (in this state, also refer to `numberOfEpochsPaid` to get a sense of the progress in repayment of the loan - and of potential delay) and PayedBack.
        uint16 durationInDays;
        uint256 amountRequested;
        uint256 amountToRepay;  // amountRequested + interests. Include the match maker and protocol fees
        uint16 totalNumberOfEpochsToPay;  // fixed value
        uint16 numberOfEpochsPaid;  // increased by one every payment
        uint256 amountToRepayEveryEpoch;
        address matchMaker;  // address of initiator of the match between the loan and one/many capitalProviders
        Lender[] lenders;
        LoanState state;
        string closeReason;  // reason why the loan is Closed (to be sourced from an enum)
    }
    uint256 public lastLoanId;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint8) creditScores;

    mapping(address => uint256) matchMakerFees;
    uint256 ownerFees;


    // EVENTS
    event NewCapitalProvided(uint256 capitalProviderId, uint256 amount, uint8 minRiskLevel, uint8 maxRiskLevel, uint16 lockUpPeriodInDays);
    event LenderCapitalRecouped(uint256 amountRecouped, uint256[] capitalProviderIds);
    event CapitalProviderRecouped(uint256 capitalProviderId, uint256 amountRecouped);
    event LoanRequested(uint256 loanId, uint256 amount, uint8 borrowerCreditScore, uint16 durationInDays);
    event LoanWithdrawn(uint256 loanId);
    event LoanPaidBack(uint256 loanId);
    event LoanMatchedWithCapital(uint256 loanId);  // listeners should query the protocol to get the detail of the capital providers attached to the loan


    // CONSTRUCTOR
    constructor(address _stablecoin) {
        stablecoin = IERC20(_stablecoin);
    }


    // PUBLIC FUNCTIONS

    /* DEPOSITOR FUNCTIONS */

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
    function getReturnEstimateForPeriodInBasisPoint(
        uint256 _amount,
        uint8 _minRiskLevel,
        uint8 _maxRiskLevel,
        uint16 _lockUpPeriodInDays
    )
        public
        view
        investmentChecks(_amount, _minRiskLevel, _maxRiskLevel, _lockUpPeriodInDays)
        returns (uint16, uint16)
    {
        uint16 durationInEpochs = _lockUpPeriodInDays / ULOAN_EPOCH_IN_DAYS;
        uint16 minInterestRateInBasisPoint = _computeLenderInterestRateForPeriodInBasisPoint(_minRiskLevel, durationInEpochs);
        uint16 maxInterestRateInBasisPoint = _computeLenderInterestRateForPeriodInBasisPoint(_maxRiskLevel, durationInEpochs);

        return (minInterestRateInBasisPoint, maxInterestRateInBasisPoint);
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
    )
        public
        investmentChecks(_amount, _minRiskLevel, _maxRiskLevel, _lockUpPeriodInDays)
    {
        bool success = stablecoin.transferFrom(msg.sender, address(this), _amount);
        require(success, "The transfer of funds failed, do you have enough funds approved for transfer to the protocol?");

        lastCapitalProviderId++;
        CapitalProvider storage newCapitalProvider = capitalProviders[lastCapitalProviderId];
        newCapitalProvider.lender = msg.sender;
        newCapitalProvider.minRiskLevel = _minRiskLevel;
        newCapitalProvider.maxRiskLevel = _maxRiskLevel;
        newCapitalProvider.lockUpPeriodInDays = _lockUpPeriodInDays;
        newCapitalProvider.amountProvided = _amount;
        newCapitalProvider.amountAvailable = _amount;

        lendersToCapitalProviders[msg.sender].push(lastCapitalProviderId);

        emit NewCapitalProvided(lastCapitalProviderId, _amount, _minRiskLevel, _maxRiskLevel, _lockUpPeriodInDays);
    }

    /*
     * Lender gets back his/her deposited money (and interests) on all the capital provided.
     * This withdraws all the available capital of the lender off the protocol.
     */
    function recoupAllCapital() public {
        uint256[] memory lenderCapitalProviders = lendersToCapitalProviders[msg.sender];
        require(lenderCapitalProviders.length > 0, "No provided capital is attached to this address");

        uint256 amountToRecoup;
        for (uint256 i = 0; i < lenderCapitalProviders.length; i++) {
            CapitalProvider storage lenderCapitalProvider = capitalProviders[lenderCapitalProviders[i]];

            amountToRecoup += lenderCapitalProvider.amountAvailable;
            lenderCapitalProvider.amountAvailable = 0;
        }

        require(amountToRecoup > 0, "You currently have no capital to withdraw");

        bool success = stablecoin.transfer(msg.sender, amountToRecoup);
        require(success, "The transfer of funds from ULoan to your account failed");

        emit LenderCapitalRecouped(amountToRecoup, lenderCapitalProviders);
    }

    /*
     * Lender gets back his/her deposited money (and interests) on one capital provided.
     * Allows for partial withdraws.
     */
    function recoupCapitalPerCapitalProvided(uint256 _capitalProviderId) public {
        require(_capitalProviderId <= lastCapitalProviderId, "This capital provider doesn't exist");

        CapitalProvider storage capitalProvider = capitalProviders[_capitalProviderId];
        uint256 amountToRecoup = capitalProvider.amountAvailable;

        require(capitalProvider.lender == msg.sender, "You can't withdraw funds you didn't provide in the first place");
        require(amountToRecoup >= 0, "You currently have nothing to withdraw");

        bool success = stablecoin.transfer(capitalProvider.lender, amountToRecoup);
        require(success, "The transfer of funds from ULoan to your account failed");

        capitalProvider.amountAvailable = 0;

        emit CapitalProviderRecouped(_capitalProviderId, amountToRecoup);
    }

    /* BORROWER FUNCTIONS */

    /*
     * Returns an interest on a declarative basis. In other words, the prospective borrower is free to pass
     * a credit score which doesn't correspond to the one he/she would receive when calling the dedicated function.
     *
     * Important note: the amount is returned in centile.
     */
    function getInterestEstimateForPeriodInBasisPoint(
        uint256 _amount,
        uint8 _creditScore,
        uint16 _durationInDays
    )
        public
        view
        lendingChecks(_amount, _durationInDays)
        returns (uint16)
    {
        uint16 durationInEpochs = _durationInDays / ULOAN_EPOCH_IN_DAYS;
        return _computeBorrowerInterestRateForPeriodInBasisPoint(_creditScore, durationInEpochs);
    }

    /*
     * Initiate a loan request, which then needs to be matched with provided capital.
     * Emit an event that any service looking to perform matching for the protocol can listen to.
     */
    function requestLoan(
        uint256 _amount,
        uint16 _durationInDays
    )
        public
        lendingChecks(_amount, _durationInDays)
    {
        uint8 borrowerCreditScore = creditScores[msg.sender];
        require(borrowerCreditScore > 0, "You must have a credit score to request a loan. Get one first!");

        uint16 durationInEpochs = _durationInDays / ULOAN_EPOCH_IN_DAYS;
        uint256 amountToRepay = _amount + _percentageOf(_amount, _computeBorrowerInterestRateForPeriodInBasisPoint(borrowerCreditScore, durationInEpochs));

        lastLoanId++;
        Loan storage newLoan = loans[lastLoanId];
        newLoan.borrower = msg.sender;
        newLoan.creditScore = borrowerCreditScore;
        newLoan.lastActionTimestamp = block.timestamp;
        newLoan.durationInDays = _durationInDays;
        newLoan.amountRequested = _amount;
        newLoan.amountToRepay = amountToRepay;
        newLoan.numberOfEpochsPaid = uint8(0);
        newLoan.totalNumberOfEpochsToPay = durationInEpochs;
        newLoan.amountToRepayEveryEpoch = _amount / durationInEpochs;
        newLoan.state = LoanState.Requested;

        emit LoanRequested(lastLoanId, _amount, borrowerCreditScore, _durationInDays);
    }

    function withdrawLoanFunds(uint256 _loanId) public {
        Loan storage loan = loans[_loanId];

        require(loan.borrower == msg.sender, "You cannot withdraw funds from a loan you didn't initiate");
        require(loan.state == LoanState.Funded, "The loan must be funded to be withdrawn");

        bool success = stablecoin.transfer(loan.borrower, loan.amountRequested);
        require(success, "The transfer of funds failed");

        loan.state = LoanState.Withdrawn;

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
        require((loan.state == LoanState.Withdrawn || loan.state == LoanState.BeingPaidBack), "The loan is not ready for repayment yet");

        bool success = stablecoin.transferFrom(msg.sender, address(this), loan.amountToRepayEveryEpoch);
        require(success, "The transfer of funds failed, do you have enough funds approved for transfer to the protocol?");

        if (loan.state == LoanState.Withdrawn) {
            loan.state = LoanState.BeingPaidBack;
        }

        loan.lastActionTimestamp = block.timestamp;
        loan.numberOfEpochsPaid = loan.numberOfEpochsPaid + 1;

        for (uint256 i = 0; i < loan.lenders.length; i++) {
            Lender storage loanLender = loan.lenders[i];
            uint256 amountToAddToLender = loanLender.totalAmountToGetBack / loan.totalNumberOfEpochsToPay;
            loanLender.amountPaidBack += amountToAddToLender;

            CapitalProvider storage loanCapitalProvider = capitalProviders[loanLender.lenderId];
            loanCapitalProvider.amountAvailable += amountToAddToLender;
        }

        if (loan.numberOfEpochsPaid == loan.totalNumberOfEpochsToPay) {
            loan.state = LoanState.PayedBack;

            // now that the loan succeeded, allow match maker and owner to take their fees
            matchMakerFees[loan.matchMaker] += _percentageOf(loan.amountRequested, FEE_TO_MATCH_INITIATOR_BP);
            ownerFees += _percentageOf(loan.amountRequested, FEE_TO_PROTOCOL_OWNER_BP);

            emit LoanPaidBack(_loanId);
        }
    }

    /* PROTOCOL OPERATORS FUNCTIONS */

    /*
     * Function to associate loans with capital providers.
     *
     * 3 relevant criteria to match capital provider with loan are: amount, risk tolerance and lock-up period.
     *
     * The matching isn't perfomed on chain to avoid expensive computation.
     * However, in order to leave the protocol open and decentralized, anyone can call this function with
     * a valid match and get a fee/percentage of the interest of the loan.
     */
    function matchLoanWithCapital(
        uint256[] calldata _capitalProviderIds,
        uint256[] calldata _capitalProviderAmounts,
        uint256 _loanId
    ) external {
        Loan storage loan = loans[_loanId];

        // Initial checks
        require(loan.state == LoanState.Requested, "Only requested loans can be matched");
        require(_capitalProviderIds.length == _capitalProviderAmounts.length, "The length of the provided arguments doesn't match");
        require(_capitalProviderIds.length > 0, "More than capital provider must be sent");

        uint256 sumOfAmounts;
        for (uint256 i = 0; i < _capitalProviderAmounts.length; i++) {
            sumOfAmounts += _capitalProviderAmounts[i];
        }
        require(loan.amountRequested == sumOfAmounts, "The sum of the amounts provided doesn't match the amount requested for this loan.");

        for (uint256 i = 0; i < _capitalProviderIds.length; i++) {
            require(_capitalProviderIds[i] <= lastCapitalProviderId, "This capital provider doesn't exist");
            CapitalProvider storage loanCapitalProvider = capitalProviders[_capitalProviderIds[i]];

            // Check lender has enough capital, risk tolerance and duration
            require(loanCapitalProvider.amountAvailable >= _capitalProviderAmounts[i], "One or more of the capital providers doesn't have enough capital to fund the loan in the proportion proposed");
            require(loanCapitalProvider.minRiskLevel >= _creditScoreToRiskLevel(loan.creditScore), "The credit score of the loan's borrower is too high for the lender (loan not aggressive enough)");
            require(loanCapitalProvider.maxRiskLevel <= _creditScoreToRiskLevel(loan.creditScore), "The credit score of the loan's borrower is too low for the lender (loan too risk)");
            require(loanCapitalProvider.lockUpPeriodInDays >= loan.durationInDays, "One or more of the capital providers lock up period isn't high enough to match that of the loan");

            // If the checks pass, reflect the matching of the capital with the loan in the capitalProvider and the loan
            uint16 durationInEpochs = loan.durationInDays / ULOAN_EPOCH_IN_DAYS;
            uint16 lenderInterestRateInBasisPoint = _computeLenderInterestRateForPeriodInBasisPoint(_creditScoreToRiskLevel(loan.creditScore), durationInEpochs);
            uint256 totalAmountToGetBack = (
                _capitalProviderAmounts[i]
                + _percentageOf(_capitalProviderAmounts[i], lenderInterestRateInBasisPoint)
            );

            // Adjust the capital provider side of the matching
            loanCapitalProvider.fundedLoanIds.push(_loanId);
            loanCapitalProvider.amountAvailable -= _capitalProviderAmounts[i];

            // Adjust the loan side of the matching
            loan.lenders.push(Lender({
                lenderId: _capitalProviderIds[i],
                amountContributed: _capitalProviderAmounts[i],
                totalAmountToGetBack: totalAmountToGetBack,
                amountPaidBack: 0
            }));
        }

        loan.state = LoanState.Funded;
        loan.lastActionTimestamp = block.timestamp;
        loan.matchMaker = msg.sender;

        emit LoanMatchedWithCapital(_loanId);
    }

    /*
     * Function to be called by loan match makers/initiators to get their share of the loan fees.
     */
    function getLoansMatchingFees() public {
        require(matchMakerFees[msg.sender] != 0, "Are you sure you matched loans which are now paid back?");

        bool success = stablecoin.transfer(msg.sender, matchMakerFees[msg.sender]);
        require(success, "The transfer of funds from ULoan to your account failed");
    }

    /*
     * Function to be called by protocol owner to get his/her share of the loan fees.
     */
    function getProtocolOwnerFees() public onlyOwner {
        bool success = stablecoin.transfer(msg.sender, ownerFees);
        require(success, "The transfer of funds from ULoan to your account failed");
    }


    // MODIFIERS

    modifier investmentChecks(
        uint256 _amount,
        uint8 _minRiskLevel,
        uint8 _maxRiskLevel,
        uint16 _lockUpPeriodInDays
    ) {
        require(_amount >= MIN_DEPOSIT_AMOUNT, "The amount can't be lower than MIN_DEPOSIT_AMOUNT");
        require(_minRiskLevel >= MIN_RISK_LEVEL, "The min risk level can't be smaller than MIN_RISK_LEVEL");
        require(_maxRiskLevel >= _minRiskLevel, "The max risk level can't be smaller than the min risk level");
        require(_maxRiskLevel <= MAX_RISK_LEVEL, "The max risk level can't be above MAX_RISK_LEVEL");
        require(_lockUpPeriodInDays >= MIN_LOCKUP_PERIOD_IN_DAYS, "The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
        require(_lockUpPeriodInDays % ULOAN_EPOCH_IN_DAYS == 0, "The lock-up period (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
        _;
    }

    modifier lendingChecks(
        uint256 _amount,
        uint16 _durationInDays
    ) {
        require(_durationInDays >= MIN_LOAN_DURATION_IN_DAYS, "The loan period can't be shorter than MIN_LOAN_DURATION_IN_DAYS");
        require(_durationInDays <= MAX_LOAN_DURATION_IN_DAYS, "The loan period can't be longer than MAX_LOAN_DURATION_IN_DAYS");
        require(_durationInDays % ULOAN_EPOCH_IN_DAYS == 0, "The loan duration (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
        require(_amount >= MIN_LOAN_AMOUNT, "The amount can't be lower than MIN_LOAN_AMOUNT");
        require(_amount <= MAX_LOAN_AMOUNT, "The amount can't be above than MAX_LOAN_AMOUNT");
        _;
    }


    // PRIVATE FUNCTIONS (made public for testing purposes)

    // TODO: find a non-linear solution for the risk coefficient
    // Power/exponent work with '**' but values are too high because no float is possible
    // So stick with linear option for now.
    function _computeBorrowerInterestRateForPeriodInBasisPoint(uint8 _creditScore, uint16 _durationInEpochs) public view returns (uint16) {
        return (
            RISK_FREE_RATE_BP
            + RISK_COEFFICIENT_BP * _creditScoreToRiskLevel(_creditScore)
            + EPOCH_DURATION_COEFFICIENT_BP * _durationInEpochs
            + FEE_BP
        );
    }

    function _computeLenderInterestRateForPeriodInBasisPoint(uint8 _riskLevel, uint16 _durationInEpochs) public view returns (uint16) {
        uint16 borrowerRateInBasisPoint = _computeBorrowerInterestRateForPeriodInBasisPoint(_riskLevelToCreditScore(_riskLevel), _durationInEpochs);

        return borrowerRateInBasisPoint - FEE_BP;
    }

    function _creditScoreToRiskLevel(uint8 _creditScore) public pure returns (uint8) {
        return (100 - _creditScore);
    }

    function _riskLevelToCreditScore(uint8 _riskLevel) public pure returns (uint8) {
        return (100 - _riskLevel);
    }

    /*
     * To be used with large numbers.
     */
    function _percentageOf(uint256 x, uint256 basisPoints) internal pure returns (uint256) {
        return x.mul(basisPoints).div(10000);
    }

    // UTILITY FUNCTIONS

    /*
     * Trick to return a dynamic storage array: have Solidity create a new variable which casts it.
     */
    function _getLendersToCapitalProviders(address lender) public view returns (uint256[] memory) {
        uint256[] memory lenderCapitalProvided = lendersToCapitalProviders[lender];
        require(lenderCapitalProvided.length > 0, "No capital provided by this account");

        return lenderCapitalProvided;
    }
}
