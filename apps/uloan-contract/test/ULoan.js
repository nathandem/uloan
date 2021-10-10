const { expect } = require("chai");
const { deployMockContract } = require("ethereum-waffle");
const { ethers } = require("hardhat");

const Stablecoin = require('../artifacts/contracts/Stablecoin.sol/Stablecoin.json');


const ULOAN_STATES = {
    Requested: 0,
    Funded: 1,
    BeingPaidBack: 2,
    PayedBack: 3,
    Closed: 4
}

describe("ULoan", () => {
    let ULoanContract;
    let uloan;
    let stablecoinMock;
    let owner;
    let bob;
    let alice;
    let charles;

    before(async () => {
        [owner, bob, alice, charles] = await ethers.getSigners();
        ULoanContract = await ethers.getContractFactory("ULoan");
    });

    beforeEach(async () => {
        stablecoinMock = await deployMockContract(owner, Stablecoin.abi);
        uloan = await ULoanContract.deploy(stablecoinMock.address);
        await uloan.deployed();
    });

    describe("Correctly initialize the contract when being deployed", () => {
        it("Stablecoin should be correctly set when contract is live", async () => {
            expect(await uloan.stablecoin()).to.equal(stablecoinMock.address);
        });
    });

    describe("[Lender] Investment estimation and deposit", () => {
        // protocol constants
        let ULOAN_EPOCH_IN_DAYS;
        let MIN_DEPOSIT_AMOUNT;
        let MIN_LOCKUP_PERIOD_IN_DAYS;
        let MIN_RISK_LEVEL;
        let MAX_RISK_LEVEL;

        // lender inputs
        // reminder: amounts are dealt with in wei-like denomination (18 decimal)
        const valid_amount = ethers.utils.parseEther('1000').toString();
        const valid_min_risk = 20;
        const valid_max_risk = 60;
        const valid_lock_period_in_days = 84;

        before(async () => {
            // ethersjs `BigNumber` type (not JS's `number` type)
            ULOAN_EPOCH_IN_DAYS = await uloan.ULOAN_EPOCH_IN_DAYS();
            MIN_DEPOSIT_AMOUNT = await uloan.MIN_DEPOSIT_AMOUNT();
            MIN_LOCKUP_PERIOD_IN_DAYS = await uloan.MIN_LOCKUP_PERIOD_IN_DAYS();
            MIN_RISK_LEVEL = await uloan.MIN_RISK_LEVEL();
            MAX_RISK_LEVEL = await uloan.MAX_RISK_LEVEL();
        });

        describe("Common verifications", () => {
            it("Fails when max risk level under min risk level", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(valid_amount, valid_max_risk, valid_min_risk, valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be smaller than the min risk level");
                await expect(uloan.depositCapital(valid_amount, valid_max_risk, valid_min_risk, valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be smaller than the min risk level");
            });

            it("Fails when minimum risk level provided under protocol's MIN_RISK_LEVEL", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(valid_amount, MIN_RISK_LEVEL.sub(1), valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The min risk level can't be smaller than MIN_RISK_LEVEL");
                await expect(uloan.depositCapital(valid_amount, MIN_RISK_LEVEL.sub(1), valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The min risk level can't be smaller than MIN_RISK_LEVEL");
            });

            it("Fails when maximum risk level provided above protocol's MAX_RISK_LEVEL", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(valid_amount, valid_min_risk, MAX_RISK_LEVEL.add(1), valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be above MAX_RISK_LEVEL");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, MAX_RISK_LEVEL.add(1), valid_lock_period_in_days)).to.be.revertedWith("The max risk level can't be above MAX_RISK_LEVEL");
            });

            it("Fails when lock-up period under protocol's MIN_LOCKUP_PERIOD_IN_DAYS", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, 0)).to.be.revertedWith("The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, valid_max_risk, 0)).to.be.revertedWith("The lock-up period can't be shorter than MIN_LOCKUP_PERIOD_IN_DAYS");
            });

            it("Fails when lock-up period not a multiple of ULOAN_EPOCH_IN_DAYS", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days + 1)).to.be.revertedWith("The lock-up period (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
                await expect(uloan.depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days + 1)).to.be.revertedWith("The lock-up period (in days) must be a multiple of ULOAN_EPOCH_IN_DAYS");
            });

            it("Fails when amount inferior than MIN_DEPOSIT_AMOUNT", async () => {
                await expect(uloan.getReturnEstimateInBasisPoint(MIN_DEPOSIT_AMOUNT.sub(1), valid_min_risk, valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The amount can't be lower than MIN_DEPOSIT_AMOUNT");
                await expect(uloan.depositCapital(MIN_DEPOSIT_AMOUNT.sub(1), valid_min_risk, valid_max_risk, valid_lock_period_in_days)).to.be.revertedWith("The amount can't be lower than MIN_DEPOSIT_AMOUNT");
            });
        });

        describe("Get estimated interest rates", () => {
            it("Give proper min and max interest rates when arguments are correct", async () => {
                const [minRate, maxRate] = await uloan.getReturnEstimateInBasisPoint(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
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

            it("In case of success, capital provided correct stored on-chain", async () => {
                await uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                const newCapitalProvider = await uloan.capitalProviders(1);
                expect(newCapitalProvider.lender).to.eq(alice.address);
                expect(newCapitalProvider.minRiskLevel).to.eq(valid_min_risk);
                expect(newCapitalProvider.maxRiskLevel).to.eq(valid_max_risk);
                expect(newCapitalProvider.lockUpPeriodInDays).to.eq(valid_lock_period_in_days);
                expect(newCapitalProvider.amountProvided).to.eq(valid_amount);
                expect(newCapitalProvider.amountAvailable).to.eq(valid_amount);
            });

            it("In case of success, protocol emits an event when capital provided properly created", async () => {
                await expect(uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(1, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
            });

            it("In case of success, every new capital provided get a unique identifier", async () => {
                await expect(uloan.connect(alice).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(1, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);

                await stablecoinMock.mock.transferFrom.withArgs(bob.address, uloan.address, valid_amount).returns(true);
                await expect(uloan.connect(bob).depositCapital(valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days))
                    .to.emit(uloan, "NewCapitalProvided").withArgs(2, valid_amount, valid_min_risk, valid_max_risk, valid_lock_period_in_days);
            });
        });
    });
});
