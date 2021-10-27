const { expect } = require("chai");
const { deployMockContract } = require("ethereum-waffle");
// hardhat `ethers` object is an extended version of the regular ethers library
const { ethers } = require("hardhat");

const Stablecoin = require('../artifacts/contracts/Stablecoin.sol/Stablecoin.json');


const ULOAN_STATES = {
    Requested: 0,
    Funded: 1,
    Withdrawn: 2,
    BeingPaidBack: 3,
    PayedBack: 4,
    Closed: 5
}

// reminder: amounts are dealt with in wei-like denomination (18 decimal)
const valid_amount = ethers.utils.parseEther('1000').toString();
const valid_min_risk = 20;
const valid_max_risk = 60;
const valid_lock_period_in_days = 84;
const valid_credit_score = 50;
const valid_duration_in_days = valid_lock_period_in_days;
const alice_credit_score = 80;

// see ULoanTest to understand why ULoan is tested through ULoanTest
describe("ULoanTest", () => {
    let ULoanTestContract;
    let uloan;
    let stablecoinMock;
    let owner;
    let bob;
    let alice;
    let charles;

    // protocol constants
    let ULOAN_EPOCH_IN_DAYS;
    let MIN_DEPOSIT_AMOUNT;
    let MIN_LOCKUP_PERIOD_IN_DAYS;
    let MIN_RISK_LEVEL;
    let MAX_RISK_LEVEL;
    let MIN_LOAN_DURATION_IN_DAYS;
    let MAX_LOAN_DURATION_IN_DAYS;
    let MIN_LOAN_AMOUNT;
    let MAX_LOAN_AMOUNT;

    async function _deploy_uloan() {
        stablecoinMock = await deployMockContract(owner, Stablecoin.abi);
        uloan = await ULoanTestContract.deploy(stablecoinMock.address);
        await uloan.deployed();
    }

    before(async () => {
        [owner, bob, alice, charles] = await ethers.getSigners();
        ULoanTestContract = await ethers.getContractFactory("ULoanTest");

        // contract needs to be available/deployed to get the contract constants
        // (eventhough we'll do that before each test, see `beforeEach`)
        await _deploy_uloan();

        // ethersjs `BigNumber` type (not JS's `number` type)
        ULOAN_EPOCH_IN_DAYS = await uloan.ULOAN_EPOCH_IN_DAYS();
        MIN_DEPOSIT_AMOUNT = await uloan.MIN_DEPOSIT_AMOUNT();
        MIN_LOCKUP_PERIOD_IN_DAYS = await uloan.MIN_LOCKUP_PERIOD_IN_DAYS();
        MIN_RISK_LEVEL = await uloan.MIN_RISK_LEVEL();
        MAX_RISK_LEVEL = await uloan.MAX_RISK_LEVEL();
        MIN_LOAN_DURATION_IN_DAYS = await uloan.MIN_LOAN_DURATION_IN_DAYS();
        MAX_LOAN_DURATION_IN_DAYS = await uloan.MAX_LOAN_DURATION_IN_DAYS();
        MIN_LOAN_AMOUNT = await uloan.MIN_LOAN_AMOUNT();
        MAX_LOAN_AMOUNT = await uloan.MAX_LOAN_AMOUNT();
    });

    beforeEach(async () => {
        await _deploy_uloan();
    });

    describe("Correctly initialize the contract when being deployed", () => {
        it("Stablecoin should be correctly set when contract is live", async () => {
            expect(await uloan.stablecoin()).to.equal(stablecoinMock.address);
        });
    });

    describe("Lender operations", () => {
        async function aliceDepositsFunds(amount, min_risk, max_risk, lock_period_in_days) {
            await stablecoinMock.mock.transferFrom.withArgs(alice.address, uloan.address, amount).returns(true);
            await uloan.connect(alice).depositCapital(amount, min_risk, max_risk, lock_period_in_days);
        }

        describe("Common verifications", () => {
            it("Fails when max risk level under min risk level", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, valid_max_risk, valid_min_risk, valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be smaller than the min risk level");
                await expect(uloan.depositCapital(valid_amount, valid_max_risk, valid_min_risk, valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be smaller than the min risk level");
            });

            it("Fails when minimum risk level provided under protocol's MIN_RISK_LEVEL", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, MIN_RISK_LEVEL.sub(1), valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The min risk level can't be smaller than MIN_RISK_LEVEL");
                await expect(uloan.depositCapital(valid_amount, MIN_RISK_LEVEL.sub(1), valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The min risk level can't be smaller than MIN_RISK_LEVEL");
            });

            it("Fails when maximum risk level provided above protocol's MAX_RISK_LEVEL", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, valid_min_risk, MAX_RISK_LEVEL.add(1), valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be above MAX_RISK_LEVEL");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, MAX_RISK_LEVEL.add(1), valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be above MAX_RISK_LEVEL");
            });

            it("Fails when lock-up period under protocol's MIN_LOCKUP_PERIOD_IN_DAYS", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, 0)).to.be.revertedWith("The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, valid_max_risk, 0)).to.be.revertedWith("The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
            });

            it("Fails when lock-up period not a multiple of ULOAN_EPOCH_IN_DAYS", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days + 1)).to.be.revertedWith("The lock-up period (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days + 1)).to.be.revertedWith("The lock-up period (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
            });

            it("Fails when amount inferior than MIN_DEPOSIT_AMOUNT", async () => {
                await expect(uloan.getReturnEstimateForPeriodInBasisPoint(MIN_DEPOSIT_AMOUNT.sub(1), valid_min_risk, valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The amount can't be lower than MIN_DEPOSIT_AMOUNT");
                await expect(uloan.depositCapital(MIN_DEPOSIT_AMOUNT.sub(1), valid_min_risk, valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The amount can't be lower than MIN_DEPOSIT_AMOUNT");
            });
        });

        describe("Get estimated interest rates in basis point", () => {
            it("Give proper min and max interest rates when arguments are correct", async () => {
                const [minRate, maxRate] = await uloan.getReturnEstimateForPeriodInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
                expect(maxRate).to.be.greaterThan(minRate);
            });

            // other and better tests to add???
        });

        describe("Deposit capital to the protocol", () => {
            beforeEach(async () => {
                // make the transfer of stablecoin from one user (alice) to the protocol work
                // this assumes that the user has allowed/gave allowance to the protocol's address for this amount
                await stablecoinMock.mock.transferFrom.withArgs(alice.address, uloan.address, valid_amount).returns(true);
            });

            it("Fails if the stablecoin transfer has not been allowed first", async () => {
                await stablecoinMock.mock.transferFrom.withArgs(alice.address, uloan.address, valid_amount).returns(false);

                await expect(uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.be.revertedWith("The transfer of funds failed, do you have enough funds approved for transfer to the protocol?");
            });

            it("In case of success, capital provided correctly stored on-chain", async () => {
                await uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
                const lastCapitalProviderId = (await uloan.lastCapitalProviderId()).toNumber();

                const newCapitalProvider = await uloan.capitalProviders(lastCapitalProviderId);
                expect(newCapitalProvider.lender).to.eq(alice.address);
                expect(newCapitalProvider.minRiskLevel).to.eq(valid_min_risk);
                expect(newCapitalProvider.maxRiskLevel).to.eq(valid_max_risk);
                expect(newCapitalProvider.lockUpPeriodInDays).to.eq(valid_lock_period_in_days);
                expect(newCapitalProvider.amountProvided).to.eq(valid_amount);
                expect(newCapitalProvider.amountAvailable).to.eq(valid_amount);

                const aliceCapitalProvidedRaw = await uloan._getLendersToCapitalProviders(alice.address);
                const aliceCapitalProvidedParsed = aliceCapitalProvidedRaw.map(n => n.toNumber());  // only cast to number because for sure under max JS number value
                expect(aliceCapitalProvidedParsed).to.deep.eq([1]);
            });

            it("In case of success, protocol emits an event when capital provided properly created", async () => {
                await expect(uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(1, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
            });

            it("In case of success, every new capital provided get a unique identifier", async () => {
                const firstCapitalProviderId = 1;
                const secondCapitalProviderId = 2;

                await expect(uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(firstCapitalProviderId, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await stablecoinMock.mock.transferFrom.withArgs(bob.address, uloan.address, valid_amount).returns(true);
                await expect(uloan.connect(bob).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(secondCapitalProviderId, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
            });
        });

        describe("Recoup all available capital", () => {
            it("Fails if the requester has not provided any capital", async () => {
                await expect(uloan.connect(bob).recoupAllCapital()).to.be.revertedWith("No provided capital is attached to this address");
            });

            // TODO: come back to this test later when loan creation and matching tested
            it.skip("Fails if lender has currently no available capital to withdraw", async () => {});

            it("In case of success, all of the capital available of an user is withdrawn", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                let aliceCapitalProvided;
                aliceCapitalProvided = await uloan.capitalProviders(1);
                expect(aliceCapitalProvided.amountAvailable).to.eq(valid_amount);

                await stablecoinMock.mock.transfer.withArgs(alice.address, valid_amount).returns(true);
                await expect(uloan.connect(alice).recoupAllCapital())
                    .to.emit(uloan, "LenderCapitalRecouped").withArgs(valid_amount, [1]);

                aliceCapitalProvided = await uloan.capitalProviders(1);
                expect(aliceCapitalProvided.amountAvailable).to.eq(0);
            });

            it("In case of success, all the capital provided is withdrawn", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                // bob deposits as well but his amount shouldn't be affected
                await stablecoinMock.mock.transferFrom.withArgs(bob.address, uloan.address, valid_amount).returns(true);
                await uloan.connect(bob).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await stablecoinMock.mock.transfer.returns(true);
                await uloan.connect(alice).recoupAllCapital();

                let aliceAmountAvailableInProtocol = ethers.BigNumber.from(0);
                aliceAmountAvailableInProtocol.add((await uloan.capitalProviders(1)).amountAvailable);
                aliceAmountAvailableInProtocol.add((await uloan.capitalProviders(2)).amountAvailable);
                expect(aliceAmountAvailableInProtocol.eq(0)).to.be.true;

                // the capital of bob is still in the contract
                expect((await uloan.capitalProviders(3)).amountAvailable).to.eq(valid_amount);
            });

        });

        describe("Recoup one capital provided", () => {
            beforeEach(async () => {
                await stablecoinMock.mock.transfer.withArgs(alice.address, valid_amount).returns(true);
            });

            it("Fails if capital provider id doesn't exist", async () => {
                await expect(uloan.recoupCapitalPerCapitalProvided(1))
                    .to.be.revertedWith("This capital provider doesn't exist");
            });

            it("Fails if capital wasn't provided by lender in the first place", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await expect(uloan.connect(bob).recoupCapitalPerCapitalProvided(1))
                    .to.be.revertedWith("You can't withdraw funds you didn't provide in the first place");
            });

            it("Fails if ERC20 transfer of funds failed", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await stablecoinMock.mock.transfer.withArgs(alice.address, valid_amount).returns(false);
                await expect(uloan.connect(alice).recoupCapitalPerCapitalProvided(1))
                    .to.be.revertedWith("The transfer of funds from ULoan to your account failed");
            });

            it("Withdraws the capital provider of the lender if all conditions are met and set the value to 0", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                let aliceCapitalProvidedAmountAvailable;
                aliceCapitalProvidedAmountAvailable = (await uloan.capitalProviders(1)).amountAvailable;
                expect(aliceCapitalProvidedAmountAvailable).to.eq(valid_amount);

                await uloan.connect(alice).recoupCapitalPerCapitalProvided(1);

                aliceCapitalProvidedAmountAvailable = (await uloan.capitalProviders(1)).amountAvailable;
                expect(aliceCapitalProvidedAmountAvailable).to.eq(0);
            });

            it("Doesn't affect other capital provider structs of the lender (and other lenders)", async () => {
                await aliceDepositsFunds(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                // bob deposits as well but his amount shouldn't be affected
                await stablecoinMock.mock.transferFrom.withArgs(bob.address, uloan.address, valid_amount).returns(true);
                await uloan.connect(bob).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await uloan.connect(alice).recoupCapitalPerCapitalProvided(1);

                bobCapitalProvidedAmountAvailable = (await uloan.capitalProviders(2)).amountAvailable;
                expect(bobCapitalProvidedAmountAvailable).to.eq(valid_amount);
            });
        });
    });

    describe("Borrower operations", () => {
        describe("Common verifications", () => {
            it("Fails if loan duration under MIN_LOAN_DURATION_IN_DAYS", async () => {
                await expect(uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, valid_credit_score, MIN_LOAN_DURATION_IN_DAYS - 1)).to.be.revertedWith("The loan period can't be shorter than MIN_LOAN_DURATION_IN_DAYS");
                await expect(uloan.requestLoan(valid_amount, MIN_LOAN_DURATION_IN_DAYS - 1)).to.be.revertedWith("The loan period can't be shorter than MIN_LOAN_DURATION_IN_DAYS");
            });

            it("Fails if loan duration above MAX_LOAN_DURATION_IN_DAYS", async () => {
                await expect(uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, valid_credit_score, MAX_LOAN_DURATION_IN_DAYS + 1)).to.be.revertedWith("The loan period can't be longer than MAX_LOAN_DURATION_IN_DAYS");
                await expect(uloan.requestLoan(valid_amount, MAX_LOAN_DURATION_IN_DAYS + 1)).to.be.revertedWith("The loan period can't be longer than MAX_LOAN_DURATION_IN_DAYS");
            });

            it("Fails if loan duration not a multiple of ULOAN_EPOCH_IN_DAYS", async () => {
                await expect(uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, valid_credit_score, valid_duration_in_days + 1)).to.be.revertedWith("The loan duration (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
                await expect(uloan.requestLoan(valid_amount, valid_duration_in_days + 1)).to.be.revertedWith("The loan duration (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
            });

            it("Fails if loan amount below MIN_LOAN_AMOUNT", async () => {
                await expect(uloan.getInterestEstimateForPeriodInBasisPoint(MIN_LOAN_AMOUNT.sub(1), valid_credit_score, valid_duration_in_days)).to.be.revertedWith("The amount can't be lower than MIN_LOAN_AMOUNT");
                await expect(uloan.requestLoan(MIN_LOAN_AMOUNT.sub(1), valid_duration_in_days)).to.be.revertedWith("The amount can't be lower than MIN_LOAN_AMOUNT");
            });

            it("Fails if loan amount above MAX_LOAN_AMOUNT", async () => {
                await expect(uloan.getInterestEstimateForPeriodInBasisPoint(MAX_LOAN_AMOUNT.add(1), valid_credit_score, valid_duration_in_days)).to.be.revertedWith("The amount can't be above than MAX_LOAN_AMOUNT");
                await expect(uloan.requestLoan(MAX_LOAN_AMOUNT.add(1), valid_duration_in_days)).to.be.revertedWith("The amount can't be above than MAX_LOAN_AMOUNT");
            });
        });

        describe("Get interest rate estimation for period", () => {
            it("Should return a valid borrower interest rate", async () => {
                let value;

                // values are similar to what's computed below in "Should return a valid borrower interest rate"
                value = await uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, 50, ULOAN_EPOCH_IN_DAYS * 4);
                expect(value).to.eq(808);

                value = await uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, 80, ULOAN_EPOCH_IN_DAYS * 4);
                expect(value).to.eq(508);

                value = await uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, 50, ULOAN_EPOCH_IN_DAYS * 52);
                expect(value).to.eq(904);

                value = await uloan.getInterestEstimateForPeriodInBasisPoint(valid_amount, 30, ULOAN_EPOCH_IN_DAYS * 52);
                expect(value).to.eq(1104);
            });
        });

        describe("Request a loan", () => {
            // needs to beforeEach because contract is deployed between every individual test
            beforeEach(async () => {
                await uloan.__testOnly_setBorrowerCreditScore(alice.address, alice_credit_score);
            });

            it("Fails if the borrower has no credit score", async () => {
                await expect(uloan.connect(bob).requestLoan(valid_amount, valid_duration_in_days)).to.be.revertedWith("You must have a credit score to request a loan. Get one first!");
            });

            it("Creates a loan without lenders and emit an event about it when credit score exist", async () => {
                const nextBlockTimestamp = 2627657056;
                await hre.network.provider.request({
                    method: "evm_setNextBlockTimestamp",
                    params: [nextBlockTimestamp],
                });

                let lastLoanId = (await uloan.lastLoanId()) + 1;

                await expect(uloan.connect(alice).requestLoan(valid_amount, valid_duration_in_days))
                    .to.emit(uloan, "LoanRequested")
                    .withArgs(lastLoanId, valid_amount, alice_credit_score, valid_duration_in_days);

                const aliceLoan = await uloan.loans(lastLoanId);
                const durationInEpochs = valid_duration_in_days / ULOAN_EPOCH_IN_DAYS;

                expect(aliceLoan.borrower).to.eq(alice.address);
                expect(aliceLoan.creditScore).to.eq(alice_credit_score);
                expect(aliceLoan.lastActionTimestamp).to.eq(nextBlockTimestamp);
                expect(aliceLoan.durationInDays).to.eq(valid_duration_in_days);
                expect(aliceLoan.amountRequested).to.eq(valid_amount);
                expect(aliceLoan.amountToRepay.gt(valid_amount)).to.be.true;
                expect(aliceLoan.numberOfEpochsPaid).to.eq(0);
                expect(aliceLoan.totalNumberOfEpochsToPay).to.eq(durationInEpochs);
                // note: just like Solidity, ethers' BigNumber operations always return an interger, which is great.
                // in this case, valid_amount/durationInEpochs (10000/12) should be 83.3333 but ethers returns 83 which matches the solidity values!
                expect(aliceLoan.amountToRepayEveryEpoch).to.eq(ethers.BigNumber.from(valid_amount).div(durationInEpochs));
                expect(aliceLoan.state).to.eq(ULOAN_STATES.Requested);
                // uninitialized values for now
                expect(aliceLoan.lenders).to.be.undefined;
                expect(aliceLoan.matchMaker).to.eq(ethers.constants.AddressZero);
            });

            it("Create a loan with proper amount to repay", async () => {
                // inputs:
                //   x: ethers.BigNumber
                //   basisPoints: JS number
                // returns:
                //   ethers.BigNumber
                function _percentageOf(x, basisPoints) {
                    return x.mul(basisPoints).div(10000);
                }

                await uloan.connect(alice).requestLoan(valid_amount, valid_duration_in_days);

                const aliceLoan = await uloan.loans(1);

                const amountRequested = aliceLoan.amountRequested;
                const loanDurationInEpochs = valid_duration_in_days / ULOAN_EPOCH_IN_DAYS;
                const aliceInterestRateForPeriod = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(alice_credit_score, loanDurationInEpochs);
                const amountToRepay = amountRequested.add(_percentageOf(amountRequested, aliceInterestRateForPeriod));

                expect(aliceLoan.amountToRepay.eq(amountToRepay)).to.be.true;
            });
        });

        describe("Withdraw funds from loan after it is funded", () => {
            beforeEach(async () => {
                await uloan.__testOnly_setBorrowerCreditScore(alice.address, alice_credit_score);
                await uloan.connect(alice).requestLoan(valid_amount, valid_duration_in_days);
                await uloan.__testOnly_changeLoanState(1, ULOAN_STATES.Funded);
                await stablecoinMock.mock.transfer.withArgs(alice.address, valid_amount).returns(true);
            });

            it("Fails when one tries to withdraw funds from loan he/she didn't initiate", async () => {
                await expect(uloan.connect(bob).withdrawLoanFunds(1)).to.revertedWith("You cannot withdraw funds from a loan you didn't initiate");
            });

            it("Fails when loan isn't funded yet", async () => {
                await uloan.__testOnly_changeLoanState(1, ULOAN_STATES.Requested);
                await expect(uloan.connect(alice).withdrawLoanFunds(1)).to.revertedWith("The loan must be funded to be withdrawn");
            });

            it("Fails when transfer of funds from ULoan to the borrower fails", async () => {
                await stablecoinMock.mock.transfer.withArgs(alice.address, valid_amount).returns(false);
                await expect(uloan.connect(alice).withdrawLoanFunds(1)).to.revertedWith("The transfer of funds failed");
            });

            it("Transfer funds from ULoan to borrower and change loan status to Withdrawn", async () => {
                await expect(uloan.connect(alice).withdrawLoanFunds(1)).to.emit(uloan, "LoanWithdrawn").withArgs(1);

                const aliceLoan = await uloan.loans(1);
                expect(aliceLoan.state).to.eq(ULOAN_STATES.Withdrawn);
            });
        });
    });

    describe("Interest rates", () => {
        it("Should return a valid borrower interest rate", async () => {
            let value;

            // values for one month for different risk levels
            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(80, 4);
            expect(value).to.eq(508);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(50, 4);
            expect(value).to.eq(808);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(30, 4);
            expect(value).to.eq(1008);

            // values for one year for different risk levels
            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(80, 52);
            expect(value).to.eq(604);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(50, 52);
            expect(value).to.eq(904);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(30, 52);
            expect(value).to.eq(1104);
        });

        it("Should return a valid lender interest rate", async () => {
            let value;

            // values for one month for different risk levels
            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(80, 4);
            expect(value).to.eq(508);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(50, 4);
            expect(value).to.eq(808);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(30, 4);
            expect(value).to.eq(1008);

            // values for one year for different risk levels
            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(80, 57);
            expect(value).to.eq(614);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(50, 57);
            expect(value).to.eq(914);

            value = await uloan._computeBorrowerInterestRateForPeriodInBasisPoint(30, 57);
            expect(value).to.eq(1114);
        });
    });
});