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

    function __testOnly_setLoanState(uint256 _loanId, ULoan.LoanState _newState) public {
        loans[_loanId].state = _newState;
    }

    function __testOnly_setCapitalProviderAvailableCapital(uint256 _capitalProviderId, uint256 _newAmountAvailable) public {
        capitalProviders[_capitalProviderId].amountAvailable = _newAmountAvailable;
    }

    function __testOnly_setLoanMatchMaker(uint256 _loanId, address _newMatchMaker) public {
        loans[_loanId].matchMaker = _newMatchMaker;
    }

    function __testOnly_setMatchMakerFees(address _matchMaker, uint256 _fees) public {
        matchMakerFees[_matchMaker] = _fees;
    }

    function __testOnly_setProtocolOwnerFees(uint256 _fees) public {
        protocolOwnerFees = _fees;
    }
}
