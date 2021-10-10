import { useEffect, useState } from 'react';
import Web3 from 'web3';

function Lend({ account }) {
  const [usdcBalance, setUsdcBalance] = useState(null);
  useEffect(() => {
    async function getUSDCBalance() {
      if (account) {
        const web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();
        const account = accounts[0];

        const minABI = [
          // balanceOf
          {
            constant: true,
            inputs: [{ name: '_owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            type: 'function',
          },
        ];

        const usdc = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
        const contract = new web3.eth.Contract(minABI, usdc);
        const result = await contract.methods.balanceOf(account).call();
        const format = result / Math.pow(10, 6);
        setUsdcBalance(format.toFixed(2));
      }
    }
    getUSDCBalance();
  }, [account]);

  return (
    <div className='flex flex-col pt-2'>
      <div className='flex flex-row justify-between items-center px-16'>
        <h1 className='font-bold'>ASSET</h1>
        <h1 className='font-bold mr-16'>APY</h1>
        <h1 className='font-bold mr-24'>DEPOSIT</h1>
        <h1 className='font-bold'>WITHDRAW</h1>
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
            <div className='flex items-center border-b py-2'>
              <input
                className='w-24 appearance-none bg-transparent border-none focus:outline-none font-bold text-md'
                type='number'
                step='0.0001'
                placeholder='Amount'
                aria-label='Deposit amount'
              />
              <button className='font-bold border p-2 hover:bg-gray-600 active:scale-95 rounded'>
                Deposit
              </button>
            </div>
            <h5 className='pt-2 text-center'>
              {account && `Balance: ${usdcBalance} USDC`}
            </h5>
          </div>
        </form>
        <form>
          <div className='flex flex-col'>
            <div className='flex items-center border-b py-2'>
              <input
                className='w-24 appearance-none bg-transparent border-none focus:outline-none font-bold text-md'
                type='number'
                step='0.0001'
                placeholder='Amount'
                aria-label='Withdraw amount'
              />
              <button className='font-bold border p-2 hover:bg-gray-600 active:scale-95 rounded'>
                Withdraw
              </button>
            </div>
            <h5 className='pt-2 text-center'>{account && `Balance: 0 USDC`}</h5>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Lend;
