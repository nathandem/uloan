require('dotenv').config();

// import `db` and `contracts` for the side-effects
// i.e. open DB connection and create uloan Ethers's contract
import prisma from './db';
import { uloan } from './contracts';

import eventHandlers from './eventHandlers';


eventHandlers()
    .catch((e) => {
        throw e;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
