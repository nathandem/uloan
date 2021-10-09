//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract ULoan {

    // STATE

    // Protocol wide parameters

    IERC20 public stablecoin;  // TODO: allow admin to change this, in case of emergency with said stablecoin

    uint256 public MIN_DEPOSIT_AMOUNT = 10;  // arbitrary value to be debated
    uint256 public MIN_LOCKUP_PERIOD_IN_DAYS = 7;  // arbitrary value to be debated
    uint256 public MIN_RISK_LEVEL = 1;
    uint256 public MAX_RISK_LEVEL = 100;

    // Note: *_IN_CENTILE refers to an internal representation of fixed-point numbers, with a precision to a hundredth.
    // For example, 100 means 1, 40 means 0.40
    uint16 public RISK_FREE_RATE_IN_CENTILE = 100;
    uint16 public RISK_COEFFICIENT_IN_CENTILE = 30;  // arbitrary value to be debated
    uint16 public DURATION_COEFFICIENT_IN_CENTILE = 30;  // arbitrary value to be debated
    uint16 public PROTOCOL_FEE_IN_CENTILE = 300;  // arbitrary value to be debated


    // Lending and loan specific state

    struct FundedLoan {
        uint256 loanId;  // the index at which to find the loan struct in `loans`
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
        uint256 lenderId;  // the index at which to find the `CapitalProvider` struct in `capitalProviders`
        uint256 amountContributed;  // constant, won't change over time
        uint256 amountToReceiveBack;  // constant (amountContributed + expected interests), computed when capital is matched to the loan
        uint256 amountPaidBack;  // variable, grows as the borrower pays back the loans+interests
    }
    enum LoanState { Requested, Funded, Withdrawn, PayedBack, Closed }
    struct Loan {
        address borrower;
        uint8 creditScore;
        uint256 requestTimestamp;  // the timestamp of the block at which the borrower sent the loan request. To be used to cancel loans not fulfilled for too long
        uint16 durationInDays;
        uint256 amountRequested;
        uint256 amountToRepay;  // sums amountRequested + all the interest payments (i.e. amountRequested * (APY * durationInDays / 365))
        Lender[] lenders;
        LoanState state;
        string closeReason;  // reason why the loan is Closed (to be sourced from an enum)
    }
    uint256 lastLoanId;
    mapping(uint256 => Loan) loans;

    mapping(address => uint8) creditScores;
    mapping(address => uint256) feesEntitled;  // loan fee go to the creator of the match between a loan and the lender (or set of lenders)


    // EVENTS
    event NewCapitalProvided(uint256 capitalProviderIndex, uint256 amount, uint8 minRiskLevel, uint8 maxRiskLevel, uint16 lockUpPeriodInDays);
    event CapitalRecouped(uint256 capitalProviderIndex, uint256 amountToRecoup);


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
    function recoupCapital(uint256 _capitalProviderIndex) public {
        require(_capitalProviderIndex <= lastCapitalProviderId, "This capital provider doesn't exist");

        CapitalProvider storage capitalProvider = capitalProviders[_capitalProviderIndex];
        uint256 amountToRecoup = capitalProvider.amountAvailable;

        require(capitalProvider.lender == msg.sender, "You can't withdraw funds you didn't provide in the first place");
        require(amountToRecoup >= 0, "You currently have nothing to withdraw");

        bool success = stablecoin.transfer(capitalProvider.lender, amountToRecoup);
        require(success, "The transfer of funds from ULoan to your account failed");

        capitalProvider.amountAvailable = 0;

        emit CapitalRecouped(_capitalProviderIndex, amountToRecoup);
    }


    // PRIVATE FUNCTIONS

    function _computeBorrowerInterestRateInCentile(uint8 _riskLevel, uint16 _durationInDays) private view returns (uint16) {
        // TODO: this formula returns values way too high! Keep the same inputs, but tweak it to return more reasonable rates.
        return RISK_FREE_RATE_IN_CENTILE + ((RISK_COEFFICIENT_IN_CENTILE * _riskLevel) * (DURATION_COEFFICIENT_IN_CENTILE * _durationInDays));
    }

    function _computeLenderInterestRateInCentile(uint8 _riskLevel, uint16 _durationInDays) private view returns (uint16) {
        uint16 borrowerRateInCentile = _computeBorrowerInterestRateInCentile(_riskLevel, _durationInDays);

        return borrowerRateInCentile * (1 - PROTOCOL_FEE_IN_CENTILE);
    }

}
