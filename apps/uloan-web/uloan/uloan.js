import React from 'react';
import { useState } from 'react';

export default async function uLoan(props) {
    const { account, user, contracts } = props;
    const [formInput, updateFormInput] = useState({ amount: 0, minRisk: 0, maxRisk: 0, lockPeriod: 0})

    async function depositCapital(formInput) {
        const uloan = contracts.uloanContract

        const transaction = await uloan.depositCapital(formInput.amount, formInput.minRisk, formInput.maxRisk, formInput.lockPeriod)
        await transaction.wait()
        
    }

    
}

