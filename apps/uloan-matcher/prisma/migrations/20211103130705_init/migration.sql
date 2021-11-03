-- CreateTable
CREATE TABLE "CapitalProvider" (
    "id" TEXT NOT NULL,
    "amountAvailable" VARCHAR(30) NOT NULL,
    "minRisk" INTEGER NOT NULL,
    "maxRisk" INTEGER NOT NULL,
    "lockUpPeriodInDays" INTEGER NOT NULL,

    CONSTRAINT "CapitalProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "amountRequested" VARCHAR(30) NOT NULL,
    "creditScore" INTEGER NOT NULL,
    "durationInDays" INTEGER NOT NULL,
    "filled" BOOLEAN NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "loanId" TEXT NOT NULL,
    "capitalProviderId" TEXT NOT NULL,
    "amountContributed" VARCHAR(30) NOT NULL,
    "feesTaken" BOOLEAN NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("loanId","capitalProviderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_capitalProviderId_key" ON "Match"("capitalProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_loanId_key" ON "Match"("loanId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_capitalProviderId_fkey" FOREIGN KEY ("capitalProviderId") REFERENCES "CapitalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
