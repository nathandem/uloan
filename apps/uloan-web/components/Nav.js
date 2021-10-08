import requests from "../utils/requests";
import { useRouter } from "next/router";
import HeaderItem from "./HeaderItem";
import {
    BadgeCheckIcon,
    CollectionIcon,
    HomeIcon,
    CreditCardIcon,
    SearchIcon,
    UserIcon,
} from "@heroicons/react/outline";

function Nav() {
    const router = useRouter();

    return (
    <nav className="relative">
        <div className="flex flex-grow justify-evenly max-w-2xl h-auto">
                    <HeaderItem title='HOME' Icon={HomeIcon} />
                    <HeaderItem title='APPROVED' Icon={BadgeCheckIcon} />
                    <HeaderItem title='LOANS' Icon={CollectionIcon} />
                    <HeaderItem title='ACCOUNT' Icon={UserIcon} />
                    <HeaderItem title='SEARCH' Icon={SearchIcon} />
        </div>
        {/* <div className="flex px-10 sm:px-20 text-2xl whitespace-nowrap 
        space-x-10 sm:space-x-20 overflow-x-scroll scrollbar-hide">
            {Object.entries(requests).map(([key, { title , url }]) => (
                <h2 
                    key={key}
                    onClick={() => router.push(`/?genre=${key}`)} 
                    className='last:pr-24 cursor-pointer 
                    transition duration-100 transform hover:scale-125 
                    hover:text-white active:text-red-500'
                >
                    {title}
                </h2>
            ))}
        </div>  
        <div className="absolute top-0 right-0 bg-gradient-to-l from-[#06202A] h-10 w-1/12">

        </div>          */}
    </nav>
    );
}

export default Nav
