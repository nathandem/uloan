function Wallet({ Icon, title }) {
    return (
        <div className="flex flex-row items-center cursor-pointer group
          text-white">
            <p className="opacity-0 group-hover:opacity-100 
            tracking-widest">{title}: </p>
            <Icon className="h-12 group-hover:animate-bounce"/>
            
        </div>
    )
}

export default Wallet
