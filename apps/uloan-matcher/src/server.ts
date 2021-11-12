require('dotenv').config();

import { ethers } from 'ethers';

import uloanAbi from '../abis/Uloan.json';
import conf from './conf';
import prisma from './db';
import eventHandlers from './eventHandlers';


const provider = new ethers.providers.JsonRpcProvider(conf.NODE_URL);
const uloan = new ethers.Contract(conf.ULOAN_ADDRESS, uloanAbi, provider);


eventHandlers(uloan)
    .catch((e) => {
        throw e;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
