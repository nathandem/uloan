import Image from 'next/image';
import Wallet from './Wallet';
import { CreditCardIcon } from '@heroicons/react/outline';

function Header({ account, setAccount }) {
  return (
    <div>
      <header className='flex flex-col sm:flex-row m-5 justify-between items-center'>
        <h1 className='font-bold text-5xl'>ULoan</h1>

        <div className='justify-evenly h-auto'>
          <Wallet
            account={account}
            setAccount={setAccount}
            title='CONNECT WALLET'
            Icon={CreditCardIcon}
          />
        </div>
      </header>
    </div>
  );
}

export default Header;
