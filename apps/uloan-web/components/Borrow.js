import { useEffect, useState } from 'react';
import Web3 from 'web3';

function Borrow({ account }) {
  const [creditScore, setCreditScore] = useState(null);

  useEffect(() => {
    async function getCreditScoreIfAvailable() {
      if (account) {
        // Check if user already has a credit score and update it
      }
    }
    getCreditScoreIfAvailable();
  }, []);

  function getCreditScore() {
    // Retrieve credit score using Bloom
  }

  return !creditScore ? (
    <div>
      <h3 className='p-2'>Please obtain a credit score before borrowing</h3>
      <button
        className='font-bold border m-2 p-2 hover:bg-gray-600 active:scale-95 rounded'
        onClick={getCreditScore}
      >
        Compute Credit Score
      </button>
    </div>
  ) : (
    <div className='flex flex-col pt-2'>
      <h1 className='p-4 mb-4'>
        The following numbers have been computed based on your credit score
      </h1>
      <div className='flex flex-row justify-between items-center px-16'>
        <h1 className='font-bold'>ASSET</h1>
        <h1 className='font-bold mr-16'>APY</h1>
        <h1 className='font-bold mr-20'>WITHDRAW</h1>
        <h1 className='font-bold'>PAY</h1>
      </div>
      <div className='flex flex-row justify-between items-center p-5'>
        <div className='flex flex-row items-center'>
          <img
            src='https://seeklogo.com/images/U/usd-coin-usdc-logo-CB4C5B1C51-seeklogo.com.png'
            width='50'
            className='p-2'
          />
          <h1 className='font-bold'>USDC</h1>
        </div>
        <h1 className='font-bold'>2.19%</h1>
        <form>
          <div className='flex flex-col'>
            <div className='flex items-center py-2'>
              <div className='flex flex-col px-4'>
                <input
                  className='w-16 mb-2 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                  type='number'
                  step='0.0001'
                  min='0'
                  placeholder='Amount'
                  aria-label='Withdraw amount'
                />
              </div>
              <button className='font-bold border mt-2 p-2 hover:bg-gray-600 active:scale-95 rounded'>
                Withdraw
              </button>
            </div>
            <h5 className='pt-2 text-center'>
              {account && `Max Amount: 0 USDC`}
            </h5>
          </div>
        </form>
        <form>
          <div className='flex flex-col'>
            <div className='flex items-center py-2'>
              <input
                className='w-16 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                type='number'
                step='0.01'
                placeholder='Amount'
                aria-label='Pay'
              />
              <button className='font-bold border ml-4 p-2 hover:bg-gray-600 active:scale-95 rounded'>
                Pay
              </button>
            </div>
            <h5 className='pt-2 text-center'>{account && `Balance: 0 USDC`}</h5>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Borrow;
