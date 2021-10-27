//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./ULoan.sol";


/*
 * Given that neither hardhat, nor waffle allow to access and override private contract variables,
 * inheritance is the solution, see `ULoanTest`. Note: unfortunately, it doesn't allow to change
 * visibility of `private` or `internal` functions. So the need to mark functions like
 * `_computeBorrowerInterestRateForPeriodInBasisPoint` public remains but it's okay as they are
 * `view` functions.
 */
contract ULoanTest is ULoan {
    constructor(address _stablecoin) ULoan(_stablecoin) {}

    function __testOnly_setBorrowerCreditScore(address _borrower, uint8 _creditScore) public {
        creditScores[_borrower] = _creditScore;
    }

    function __testOnly_getBorrowerCreditScore(address _borrower) public view returns(uint8) {
        return creditScores[_borrower];
    }

    function __testOnly_changeLoanState(uint256 _loanId, ULoan.LoanState _newState) public {
        loans[_loanId].state = _newState;
    }
}
