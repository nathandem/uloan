import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import Web3Modal from 'web3modal';
import Web3 from 'web3';
// import ULoan from '../uloan'
import ULOAN from '../abis/ULoan.json';
import STABLECOIN from '../abis/Stablecoin.json'

//Addresses of contract. Need to be in environment variables in production
const uloanContractAddr = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512'
const stablecoinContractAddr = '0x5fbdb2315678afecb367f032d93f642f64180aa3'


function Lend({ account, contracts, setContracts, user, setUser }) {
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [formInput, updateFormInput] = useState({ amount: 0, minRisk: 0, maxRisk: 0, lockPeriod: 0 })
  useEffect(() => {
    async function getUSDCBalance() {
      if (contracts.stablecoinContract) {
        /* Web3 functions */

        // const web3 = new Web3(window.ethereum);
        // const accounts = await web3.eth.getAccounts();
        // const account = accounts[0];

        // const minABI = [
        //   // balanceOf
        //   {
        //     constant: true,
        //     inputs: [{ name: '_owner', type: 'address' }],
        //     name: 'balanceOf',
        //     outputs: [{ name: 'balance', type: 'uint256' }],
        //     type: 'function',
        //   },
        // ];

        /* For the purpose of testing, usdc will set to equal our testnet stablecoin contract */
        // const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
        // const contract = new web3.eth.Contract(minABI, usdc);
        // const result = await contract.methods.balanceOf(account).call();
        const contract = contracts.stablecoinContract;
        const result = await contract.balanceOf(account);
        console.log("balance of account: ", result);
        const format = result / Math.pow(10, 6);
        setUsdcBalance(format.toFixed(2));
      }
    }
    getUSDCBalance();
  }, [account]);

  async function connectContracts() {  
      const web3Modal = new Web3Modal()
      const connection = await web3Modal.connect()
      const provider = new ethers.providers.Web3Provider(connection)
      const signer = provider.getSigner()
      const signerAddress = await signer.getAddress()
      // address from local host
      const uloanContract = new ethers.Contract(uloanContractAddr, ULOAN.abi, signer)
      // Get Stablecoin ERC20 address
      const tokenAddress = await uloanContract.stablecoin()
      // const tokenAddress = '';  //Testnet
      const stablecoinContract = new ethers.Contract(tokenAddress, STABLECOIN.abi, signer)
      setUser({
        provider: provider,
        signer: signer,
        signerAddress: signerAddress,
      })
      console.log("setUser info: ", user)
      setContracts({
        uloanContract: uloanContract,
        stablecoinContract: stablecoinContract
      })
      console.log("setContract info: ", contracts)
  }
  async function makeDeposit() {
    await connectContracts()
    const { amount, maxRisk, lockPeriod } = formInput
    if (!amount || !maxRisk || !lockPeriod) return 
    // access uloan contract
  }


  return (
    <div className='flex flex-col pt-2'>
      <div className='flex flex-row justify-between items-center px-16'>
        <h1 className='font-bold'>ASSET</h1>
        <h1 className='font-bold mr-20'>APY</h1>
        <h1 className='font-bold mr-28'>DEPOSIT</h1>
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
            <div className='flex items-center py-2'>
              <div className='flex flex-col px-4'>
                <input
                  className='w-32 mb-2 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                  type='number'
                  step='0.0001'
                  min='0'
                  placeholder='Amount'
                  aria-label='Deposit amount'
                  onChange={e => updateFormInput({ ...formInput, amount: e.target.value })}
                />
                <input
                  className='w-32 mb-2 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                  type='number'
                  placeholder='Max Risk'
                  aria-label='Risk'
                  max='100'
                  min='0'
                  onChange={e => updateFormInput({ ...formInput, maxRisk: e.target.value })}
                />
                <input
                  className='w-32 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                  type='number'
                  placeholder='Duration (Days)'
                  aria-label='Duration'
                  min='1'
                  onChange={e => updateFormInput({ ...formInput, lockPeriod: e.target.value })}
                />
              </div>
              <button onClick={makeDeposit} className='font-bold border mt-2 p-2 hover:bg-gray-600 active:scale-95 rounded'>
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
            <div className='flex items-center py-2'>
              <input
                className='w-16 appearance-none bg-transparent border-b focus:outline-none font-bold text-md'
                type='number'
                placeholder='ID'
                aria-label='Withdraw'
              />
              <button className='font-bold border ml-4 p-2 hover:bg-gray-600 active:scale-95 rounded'>
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
