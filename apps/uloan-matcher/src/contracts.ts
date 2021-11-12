import { ethers } from 'ethers';

import uloanAbi from '../abis/Uloan.json';
import conf from './conf';


const provider = new ethers.providers.JsonRpcProvider(conf.NODE_URL);
export const uloan = new ethers.Contract(conf.ULOAN_ADDRESS, uloanAbi, provider);
