export interface AssetImageEntry {
  readonly src: string;
  readonly coingeckoUrl: string;
  readonly alt: string;
  readonly bg?: string;
}

export const COINGECKO_ID_IMAGES: Record<string, string> = {
  "bitcoin": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
  "ethereum": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  "tether": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
  "binancecoin": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  "usd-coin": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
  "ripple": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  "solana": "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
  "zcash": "https://coin-images.coingecko.com/coins/images/486/large/Brandmark-Yellow_%281%29.png",
  "dogecoin": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
  "chainlink": "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png",
  "coinbase-wrapped-btc": "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp",
  "dai": "https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png",
  "tether-gold": "https://coin-images.coingecko.com/coins/images/10481/large/logo.png",
  "uniswap": "https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png",
  "sui": "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
  "aave": "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png",
  "aster-2": "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png",
  "arbitrum": "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg",
  "official-trump": "https://coin-images.coingecko.com/coins/images/53746/large/trump.png",
  "starknet": "https://coin-images.coingecko.com/coins/images/26433/large/starknet.png",
  "gnosis": "https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png",
  "frax": "https://coin-images.coingecko.com/coins/images/13422/large/LFRAX.png",
  "dogwifcoin": "https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
  "safe": "https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png",
  "wrapped-near": "https://coin-images.coingecko.com/coins/images/18280/large/EX4mrWMW_400x400.jpg",
  "cow-protocol": "https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png",
  "turbo": "https://coin-images.coingecko.com/coins/images/30117/large/TurboMark-QL_200.png",
  "book-of-meme": "https://coin-images.coingecko.com/coins/images/36071/large/bome.png",
  "berachain-bera": "https://coin-images.coingecko.com/coins/images/25235/large/BERA.png",
  "aurora-near": "https://coin-images.coingecko.com/coins/images/20582/large/aurora.jpeg",
  "kyber-network-crystal": "https://coin-images.coingecko.com/coins/images/14899/large/RwdVsGcw_400x400.jpg",
  "rhea-2": "https://coin-images.coingecko.com/coins/images/67682/large/RHEA_Logo.png",
  "fogo": "https://coin-images.coingecko.com/coins/images/68100/large/fogo_AppIcon.png",
  "publicai": "https://coin-images.coingecko.com/coins/images/67977/large/publicai.jpg",
  "npro": "https://coin-images.coingecko.com/coins/images/70983/large/npro_coin_squared_2x.png",
  "shitzu": "https://coin-images.coingecko.com/coins/images/24857/large/sFChtaUA_400x400.jpg",
  "black-dragon": "https://coin-images.coingecko.com/coins/images/35502/large/Untitled-8.png",
  "jambo-2": "https://coin-images.coingecko.com/coins/images/68744/large/jambo.png",
  "hapi": "https://coin-images.coingecko.com/coins/images/14298/large/Hapi_logo_square_%281%29.png",
  "consumerfi-protocol": "https://coin-images.coingecko.com/coins/images/70993/large/o6dyoqfbdes0qabkk4p6ed9ighgz.",
  "nearkat": "https://coin-images.coingecko.com/coins/images/51737/large/nkimage.png",
  "meta-pool": "https://coin-images.coingecko.com/coins/images/24249/large/aB2d0Nmn_400x400.png",
  "tron": "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
  "wrapped-bitcoin": "https://coin-images.coingecko.com/coins/images/7598/large/WBTCLOGO.png",
  "cardano": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
  "ethena-usde": "https://coin-images.coingecko.com/coins/images/33613/large/usde.png",
  "stellar": "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg",
  "bitcoin-cash": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
  "near": "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
  "usdt0": "https://coin-images.coingecko.com/coins/images/53705/large/usdt0.jpg",
  "litecoin": "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
  "avalanche-2": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  "usd1-wlfi": "https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png",
  "the-open-network": "https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png",
  "global-dollar": "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png",
  "shiba-inu": "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
  "okb": "https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png",
  "falcon-finance": "https://coin-images.coingecko.com/coins/images/54558/large/ff_200_X_200.png",
  "pepe": "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  "venice-token": "https://coin-images.coingecko.com/coins/images/54023/large/VVV_Token_Transparent.png",
  "polygon-ecosystem-token": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
  "dash": "https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png",
  "aptos": "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Profile-Picture_%281%29.png",
  "pudgy-penguins": "https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png",
  "spx6900": "https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png",
  "plasma": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
  "optimism": "https://coin-images.coingecko.com/coins/images/25244/large/Token.png",
  "monad": "https://coin-images.coingecko.com/coins/images/38927/large/mon.png",
  "gmx": "https://coin-images.coingecko.com/coins/images/18323/large/arbit.png",
  "pons": "https://coin-images.coingecko.com/coins/images/102174571/large/jhitvkisdq8fhxvimdkpcw7y3dx5.",
  "adi-token": "https://coin-images.coingecko.com/coins/images/68846/large/ADI_Token-min.png",
  "aleo": "https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png",
  "melania-meme": "https://coin-images.coingecko.com/coins/images/53775/large/melania-meme.png",
  "kaito": "https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg",
  "xdai": "https://coin-images.coingecko.com/coins/images/11062/large/Identity-Primary-DarkBG.png",
  "cash-cat": "https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg",
  "based-brett": "https://coin-images.coingecko.com/coins/images/35529/large/1000050750.png",
  "mog-coin": "https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png",
  "monerium-eur-money-2": "https://coin-images.coingecko.com/coins/images/54303/large/eure.jpg",
  "movement": "https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png",
  "infinex-2": "https://coin-images.coingecko.com/coins/images/70868/large/infinex.png",
  "strkbtc": "https://coin-images.coingecko.com/coins/images/102173511/large/strkBTC_Logo.png",
  "hemi-bitcoin": "https://coin-images.coingecko.com/coins/images/67027/large/hemibtc.jpg",
  "sweatcoin": "https://coin-images.coingecko.com/coins/images/25057/large/Sweat_-_logo-nov-2025.png",
  "monerium-gbp-emoney": "https://coin-images.coingecko.com/coins/images/39004/large/gbp.png",
  "usdcx-movement": "https://coin-images.coingecko.com/coins/images/102172636/large/Circle_USDCx.png",
  "nearkat-2": "https://coin-images.coingecko.com/coins/images/102176913/large/nearkat.jpg",
  "forgive-me-father": "https://coin-images.coingecko.com/coins/images/51666/large/nZLzDdNi_400x400.jpg",
  "thor-wallet": "https://coin-images.coingecko.com/coins/images/70474/large/TITNToken%281%29.png",
  "loud": "https://coin-images.coingecko.com/coins/images/66211/large/loud-logo.jpg",
  "staked-near": "https://coin-images.coingecko.com/coins/images/24250/large/st-NEAR-token-white-dark-purple-circle.png",
  "coca": "https://coin-images.coingecko.com/coins/images/52379/large/_COCA_Token_1.png",
  "wrapped-steth": "https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png",
  "usdcx": "https://coin-images.coingecko.com/coins/images/102171865/large/USDC_Token__192w.png",
  "abg": "/assets/tokens/abg.webp",
  "noear": "/assets/tokens/noear.webp",
  "gnear": "/assets/tokens/gnear.svg",
  "itlx": "/assets/tokens/itlx.svg",
  "testnebula": "/assets/tokens/testnebula.svg",
  "custom:qtc": "https://coin-images.coingecko.com/coins/images/102171910/large/Token_Icon.png",
  "custom:prl": "https://coin-images.coingecko.com/coins/images/102173580/large/pearl.png",
  "custom:ssc1-pit": "/assets/tokens/ssc1_pit.svg"
};

export const COINGECKO_ASSET_IMAGES: Record<string, AssetImageEntry> = {
  "USDC": {
    "src": "/assets/tokens/usdc.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "USD Coin (USDC)"
  },
  "USDT": {
    "src": "/assets/tokens/usdt.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    "alt": "Tether (USDT)"
  },
  "ETH": {
    "src": "/assets/tokens/eth.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
    "alt": "Ethereum (ETH)",
    "bg": "bg-neutral-900"
  },
  "WETH": {
    "src": "/assets/tokens/eth.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
    "alt": "Wrapped Ether (WETH)",
    "bg": "bg-neutral-900"
  },
  "CBETH": {
    "src": "/assets/tokens/eth.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
    "alt": "Coinbase Wrapped Staked ETH (cbETH)",
    "bg": "bg-neutral-900"
  },
  "SOL": {
    "src": "/assets/tokens/sol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
    "alt": "Solana (SOL)",
    "bg": "bg-black"
  },
  "MSOL": {
    "src": "/assets/tokens/sol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
    "alt": "Marinade staked SOL (mSOL)",
    "bg": "bg-black"
  },
  "NEAR": {
    "src": "/assets/tokens/near.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
    "alt": "NEAR Protocol (NEAR)"
  },
  "WNEAR": {
    "src": "/assets/tokens/near.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/18280/large/EX4mrWMW_400x400.jpg",
    "alt": "Wrapped NEAR (wNEAR)"
  },
  "ABG": {
    "src": "/assets/tokens/abg.webp",
    "coingeckoUrl": "/assets/tokens/abg.webp",
    "alt": "ABG"
  },
  "NOEAR": {
    "src": "/assets/tokens/noear.webp",
    "coingeckoUrl": "/assets/tokens/noear.webp",
    "alt": "NOEAR"
  },
  "GNEAR": {
    "src": "/assets/tokens/gnear.svg",
    "coingeckoUrl": "/assets/tokens/gnear.svg",
    "alt": "gNEAR"
  },
  "ITLX": {
    "src": "/assets/tokens/itlx.svg",
    "coingeckoUrl": "/assets/tokens/itlx.svg",
    "alt": "ITLX"
  },
  "CNEAR": {
    "src": "/assets/tokens/cnear.png",
    "coingeckoUrl": "/assets/tokens/cnear.png",
    "alt": "cNEAR"
  },
  "QTC": {
    "src": "https://coin-images.coingecko.com/coins/images/102171910/large/Token_Icon.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102171910/large/Token_Icon.png",
    "alt": "Quantus (QTC)"
  },
  "PRL": {
    "src": "https://coin-images.coingecko.com/coins/images/102173580/large/pearl.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102173580/large/pearl.png",
    "alt": "Pearl (PRL)"
  },
  "STEAKUSDC": {
    "src": "https://coin-images.coingecko.com/coins/images/102174379/large/csteak.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102174379/large/csteak.png",
    "alt": "Steakhouse USDC (steakUSDC)"
  },
  "GTUSDCP": {
    "src": "https://coin-images.coingecko.com/coins/images/71233/large/gauntlet.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/71233/large/gauntlet.png",
    "alt": "Gauntlet USDC Prime (gtUSDCp)"
  },
  "KV-GTSOLB": {
    "src": "https://coin-images.coingecko.com/coins/images/71233/large/gauntlet.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/71233/large/gauntlet.png",
    "alt": "Gauntlet SOL Vault (kV-gtSOLb)"
  },
  "SPARKUSDC": {
    "src": "https://coin-images.coingecko.com/coins/images/38637/large/Spark-Logomark-RGB.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/38637/large/Spark-Logomark-RGB.png",
    "alt": "Spark USDC (sparkUSDC)"
  },
  "MWUSDC": {
    "src": "https://coin-images.coingecko.com/coins/images/52375/large/usd-coin-usdc-logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/52375/large/usd-coin-usdc-logo.png",
    "alt": "Moonwell USDC (mwUSDC)"
  },
  "LAUSDC": {
    "src": "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "Lend Aave USDC (laUSDC)"
  },
  "STJACK": {
    "src": "/assets/tokens/stjack.svg",
    "coingeckoUrl": "/assets/tokens/stjack.svg",
    "alt": "Stable Jack (STJACK)"
  },
  "FMS": {
    "src": "/assets/tokens/fms.svg",
    "coingeckoUrl": "/assets/tokens/fms.svg",
    "alt": "FMS"
  },
  "TLO": {
    "src": "/assets/tokens/tlo.svg",
    "coingeckoUrl": "/assets/tokens/tlo.svg",
    "alt": "TLO"
  },
  "SSC1_PIT": {
    "src": "/assets/tokens/ssc1_pit.svg",
    "coingeckoUrl": "/assets/tokens/ssc1_pit.svg",
    "alt": "SSC1_PIT"
  },
  "TMU": {
    "src": "/assets/tokens/tmu.svg",
    "coingeckoUrl": "/assets/tokens/tmu.svg",
    "alt": "tMU"
  },
  "NZHIPU": {
    "src": "/assets/tokens/nzhipu.svg",
    "coingeckoUrl": "/assets/tokens/nzhipu.svg",
    "alt": "nZHIPU"
  },
  "TESTNEBULA": {
    "src": "/assets/tokens/testnebula.svg",
    "coingeckoUrl": "/assets/tokens/testnebula.svg",
    "alt": "TESTNEBULA"
  },
  "MATIC": {
    "src": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "alt": "Polygon (MATIC)"
  },
  "FRAX": {
    "src": "https://coin-images.coingecko.com/coins/images/13422/large/LFRAX.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/13422/large/LFRAX.png",
    "alt": "FRAX"
  },
  "AURORA": {
    "src": "https://coin-images.coingecko.com/coins/images/20582/large/aurora.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/20582/large/aurora.jpeg",
    "alt": "AURORA"
  },
  "WBTC": {
    "src": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "alt": "wBTC"
  },
  "BLACKDRAGON": {
    "src": "https://coin-images.coingecko.com/coins/images/35502/large/Untitled-8.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/35502/large/Untitled-8.png",
    "alt": "BLACKDRAGON"
  },
  "SHITZU": {
    "src": "https://coin-images.coingecko.com/coins/images/24857/large/sFChtaUA_400x400.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/24857/large/sFChtaUA_400x400.jpg",
    "alt": "SHITZU"
  },
  "MPDAO": {
    "src": "https://coin-images.coingecko.com/coins/images/24249/large/aB2d0Nmn_400x400.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/24249/large/aB2d0Nmn_400x400.png",
    "alt": "mpDAO"
  },
  "ZEC": {
    "src": "https://coin-images.coingecko.com/coins/images/486/large/Brandmark-Yellow_%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/486/large/Brandmark-Yellow_%281%29.png",
    "alt": "ZEC"
  },
  "JAMBO": {
    "src": "https://coin-images.coingecko.com/coins/images/68744/large/jambo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/68744/large/jambo.png",
    "alt": "JAMBO"
  },
  "NEARKAT": {
    "src": "https://coin-images.coingecko.com/coins/images/51737/large/nkimage.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/51737/large/nkimage.png",
    "alt": "NearKat"
  },
  "RHEA": {
    "src": "https://coin-images.coingecko.com/coins/images/67682/large/RHEA_Logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/67682/large/RHEA_Logo.png",
    "alt": "RHEA"
  },
  "PUBLIC": {
    "src": "https://coin-images.coingecko.com/coins/images/67977/large/publicai.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/67977/large/publicai.jpg",
    "alt": "PUBLIC"
  },
  "HAPI": {
    "src": "https://coin-images.coingecko.com/coins/images/14298/large/Hapi_logo_square_%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/14298/large/Hapi_logo_square_%281%29.png",
    "alt": "HAPI"
  },
  "CFI": {
    "src": "https://coin-images.coingecko.com/coins/images/70993/large/o6dyoqfbdes0qabkk4p6ed9ighgz.",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/70993/large/o6dyoqfbdes0qabkk4p6ed9ighgz.",
    "alt": "CFI"
  },
  "NPRO": {
    "src": "https://coin-images.coingecko.com/coins/images/70983/large/npro_coin_squared_2x.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/70983/large/npro_coin_squared_2x.png",
    "alt": "NPRO"
  },
  "XAUT": {
    "src": "https://coin-images.coingecko.com/coins/images/10481/large/logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/10481/large/logo.png",
    "alt": "XAUT"
  },
  "SUI": {
    "src": "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
    "alt": "SUI"
  },
  "BTC": {
    "src": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "alt": "BTC"
  },
  "CBBTC": {
    "src": "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp",
    "alt": "cbBTC"
  },
  "FOGO": {
    "src": "https://coin-images.coingecko.com/coins/images/68100/large/fogo_AppIcon.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/68100/large/fogo_AppIcon.png",
    "alt": "FOGO"
  },
  "ARB": {
    "src": "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg",
    "alt": "ARB"
  },
  "DOGE": {
    "src": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
    "alt": "DOGE"
  },
  "XRP": {
    "src": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    "alt": "XRP"
  },
  "KNC": {
    "src": "https://coin-images.coingecko.com/coins/images/14899/large/RwdVsGcw_400x400.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/14899/large/RwdVsGcw_400x400.jpg",
    "alt": "KNC"
  },
  "TURBO": {
    "src": "https://coin-images.coingecko.com/coins/images/30117/large/TurboMark-QL_200.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/30117/large/TurboMark-QL_200.png",
    "alt": "TURBO"
  },
  "$WIF": {
    "src": "https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
    "alt": "$WIF"
  },
  "BOME": {
    "src": "https://coin-images.coingecko.com/coins/images/36071/large/bome.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/36071/large/bome.png",
    "alt": "BOME"
  },
  "TRUMP": {
    "src": "https://coin-images.coingecko.com/coins/images/53746/large/trump.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/53746/large/trump.png",
    "alt": "TRUMP"
  },
  "DAI": {
    "src": "https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png",
    "alt": "DAI"
  },
  "GNO": {
    "src": "https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png",
    "alt": "GNO"
  },
  "COW": {
    "src": "https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png",
    "alt": "COW"
  },
  "SAFE": {
    "src": "https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png",
    "alt": "SAFE"
  },
  "AAVE": {
    "src": "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png",
    "alt": "AAVE"
  },
  "UNI": {
    "src": "https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png",
    "alt": "UNI"
  },
  "LINK": {
    "src": "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png",
    "alt": "LINK"
  },
  "STRK": {
    "src": "https://coin-images.coingecko.com/coins/images/26433/large/starknet.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26433/large/starknet.png",
    "alt": "STRK"
  },
  "BERA": {
    "src": "https://coin-images.coingecko.com/coins/images/25235/large/BERA.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25235/large/BERA.png",
    "alt": "BERA"
  },
  "BNB(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "alt": "BNB(DEPRECATED)"
  },
  "BNB": {
    "src": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "alt": "BNB"
  },
  "ASTER(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png",
    "alt": "ASTER(DEPRECATED)"
  },
  "ASTER": {
    "src": "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png",
    "alt": "ASTER"
  },
  "MON": {
    "src": "https://coin-images.coingecko.com/coins/images/38927/large/mon.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/38927/large/mon.png",
    "alt": "MON"
  },
  "OKB": {
    "src": "https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png",
    "alt": "OKB"
  },
  "XPL_(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
    "alt": "XPL_(DEPRECATED)"
  },
  "XPL": {
    "src": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
    "alt": "XPL"
  },
  "POL(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "alt": "POL(DEPRECATED)"
  },
  "POL": {
    "src": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "alt": "POL"
  },
  "KAITO": {
    "src": "https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg",
    "alt": "KAITO"
  },
  "TRX": {
    "src": "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
    "alt": "TRX"
  },
  "GRAM": {
    "src": "https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png",
    "alt": "GRAM"
  },
  "OP": {
    "src": "https://coin-images.coingecko.com/coins/images/25244/large/Token.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25244/large/Token.png",
    "alt": "OP"
  },
  "AVAX(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "alt": "AVAX(DEPRECATED)"
  },
  "AVAX": {
    "src": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "alt": "AVAX"
  },
  "XLM": {
    "src": "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg",
    "alt": "XLM"
  },
  "ADA": {
    "src": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
    "alt": "ADA"
  },
  "APT": {
    "src": "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Profile-Picture_%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Profile-Picture_%281%29.png",
    "alt": "APT"
  },
  "LTC": {
    "src": "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
    "alt": "LTC"
  },
  "SPX": {
    "src": "https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png",
    "alt": "SPX"
  },
  "BCH": {
    "src": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
    "alt": "BCH"
  },
  "ADI": {
    "src": "https://coin-images.coingecko.com/coins/images/68846/large/ADI_Token-min.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/68846/large/ADI_Token-min.png",
    "alt": "ADI"
  },
  "SHIB": {
    "src": "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
    "alt": "SHIB"
  },
  "PEPE": {
    "src": "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
    "alt": "PEPE"
  },
  "INX": {
    "src": "https://coin-images.coingecko.com/coins/images/70868/large/infinex.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/70868/large/infinex.png",
    "alt": "INX"
  },
  "PENGU": {
    "src": "https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png",
    "alt": "PENGU"
  },
  "TITN": {
    "src": "https://coin-images.coingecko.com/coins/images/70474/large/TITNToken%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/70474/large/TITNToken%281%29.png",
    "alt": "TITN"
  },
  "ALEO": {
    "src": "https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png",
    "alt": "ALEO"
  },
  "DASH": {
    "src": "https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png",
    "alt": "DASH"
  },
  "USD1": {
    "src": "https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png",
    "alt": "USD1"
  },
  "VVV": {
    "src": "https://coin-images.coingecko.com/coins/images/54023/large/VVV_Token_Transparent.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/54023/large/VVV_Token_Transparent.png",
    "alt": "VVV"
  },
  "USDG": {
    "src": "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png",
    "alt": "USDG"
  },
  "PONS": {
    "src": "https://coin-images.coingecko.com/coins/images/102174571/large/jhitvkisdq8fhxvimdkpcw7y3dx5.",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102174571/large/jhitvkisdq8fhxvimdkpcw7y3dx5.",
    "alt": "PONS"
  },
  "CASHCAT": {
    "src": "https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg",
    "alt": "CASHCAT"
  },
  "XBTC": {
    "src": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "alt": "xBTC"
  },
  "USDT0": {
    "src": "https://coin-images.coingecko.com/coins/images/53705/large/usdt0.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/53705/large/usdt0.jpg",
    "alt": "USDT0"
  },
  "XDAI": {
    "src": "https://coin-images.coingecko.com/coins/images/11062/large/Identity-Primary-DarkBG.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/11062/large/Identity-Primary-DarkBG.png",
    "alt": "xDAI"
  },
  "WETH(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
    "alt": "WETH(DEPRECATED)"
  },
  "USDC(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "USDC(DEPRECATED)"
  },
  "USDT(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    "alt": "USDT(DEPRECATED)"
  },
  "PURGE": {
    "src": "https://coin-images.coingecko.com/coins/images/51666/large/nZLzDdNi_400x400.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/51666/large/nZLzDdNi_400x400.jpg",
    "alt": "PURGE"
  },
  "SWEAT": {
    "src": "https://coin-images.coingecko.com/coins/images/25057/large/Sweat_-_logo-nov-2025.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25057/large/Sweat_-_logo-nov-2025.png",
    "alt": "SWEAT"
  },
  "SWEAT(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/25057/large/Sweat_-_logo-nov-2025.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25057/large/Sweat_-_logo-nov-2025.png",
    "alt": "SWEAT(DEPRECATED)"
  },
  "RHEA(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/67682/large/RHEA_Logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/67682/large/RHEA_Logo.png",
    "alt": "RHEA(DEPRECATED)"
  },
  "NEAR(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
    "alt": "NEAR(DEPRECATED)"
  },
  "SUSDC": {
    "src": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "sUSDC"
  },
  "USDT0(DEPRECATED)": {
    "src": "https://coin-images.coingecko.com/coins/images/53705/large/usdt0.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/53705/large/usdt0.jpg",
    "alt": "USDT0(DEPRECATED)"
  },
  "USAD": {
    "src": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "USAD"
  },
  "USDCX": {
    "src": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
    "alt": "USDCx"
  },
  "STNEAR": {
    "src": "https://coin-images.coingecko.com/coins/images/24250/large/st-NEAR-token-white-dark-purple-circle.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/24250/large/st-NEAR-token-white-dark-purple-circle.png",
    "alt": "stNEAR"
  },
  "STRKBTC": {
    "src": "https://coin-images.coingecko.com/coins/images/102173511/large/strkBTC_Logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102173511/large/strkBTC_Logo.png",
    "alt": "strkBTC"
  },
  "GMX": {
    "src": "https://coin-images.coingecko.com/coins/images/18323/large/arbit.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/18323/large/arbit.png",
    "alt": "GMX"
  },
  "MOG": {
    "src": "https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png",
    "alt": "MOG"
  },
  "BRETT": {
    "src": "https://coin-images.coingecko.com/coins/images/35529/large/1000050750.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/35529/large/1000050750.png",
    "alt": "BRETT"
  },
  "MELANIA": {
    "src": "https://coin-images.coingecko.com/coins/images/53775/large/melania-meme.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/53775/large/melania-meme.png",
    "alt": "MELANIA"
  },
  "LOUD": {
    "src": "https://coin-images.coingecko.com/coins/images/66211/large/loud-logo.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/66211/large/loud-logo.jpg",
    "alt": "LOUD"
  },
  "WNEARKAT": {
    "src": "https://coin-images.coingecko.com/coins/images/102176913/large/nearkat.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102176913/large/nearkat.jpg",
    "alt": "wNEARKAT"
  },
  "EURE": {
    "src": "https://coin-images.coingecko.com/coins/images/54303/large/eure.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/54303/large/eure.jpg",
    "alt": "EURe"
  },
  "GBPE": {
    "src": "https://coin-images.coingecko.com/coins/images/39004/large/gbp.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/39004/large/gbp.png",
    "alt": "GBPe"
  },
  "USDF": {
    "src": "https://coin-images.coingecko.com/coins/images/54558/large/ff_200_X_200.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/54558/large/ff_200_X_200.png",
    "alt": "USDf"
  },
  "NRUSDT": {
    "src": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
    "alt": "nrUsdt"
  },
  "HEMIBTC": {
    "src": "https://coin-images.coingecko.com/coins/images/67027/large/hemibtc.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/67027/large/hemibtc.jpg",
    "alt": "hemiBTC"
  },
  "MOVE": {
    "src": "https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png",
    "alt": "MOVE"
  },
  "COCA": {
    "src": "https://coin-images.coingecko.com/coins/images/52379/large/_COCA_Token_1.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/52379/large/_COCA_Token_1.png",
    "alt": "COCA"
  },
  "USDE": {
    "src": "https://coin-images.coingecko.com/coins/images/33613/large/usde.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/33613/large/usde.png",
    "alt": "USDe"
  },
  "WSTETH": {
    "src": "https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png",
    "alt": "wstETH"
  },
  "BTC(OMNI)": {
    "src": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "alt": "BTC(OMNI)"
  }
};

export const COINGECKO_CHAIN_IMAGES: Record<string, AssetImageEntry> = {
  "ethereum": {
    "src": "/assets/tokens/eth.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/279/large/ethereum.png",
    "alt": "Ethereum",
    "bg": "bg-neutral-900"
  },
  "base": {
    "src": "/assets/tokens/base.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/131/large/base.png",
    "alt": "Base"
  },
  "solana": {
    "src": "/assets/tokens/sol.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/5/large/solana.png",
    "alt": "Solana",
    "bg": "bg-black"
  },
  "near": {
    "src": "/assets/tokens/near.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/34/large/near.jpeg",
    "alt": "NEAR"
  },
  "tron": {
    "src": "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
    "alt": "Tron"
  },
  "arbitrum": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/33/large/AO_logomark.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg",
    "alt": "Arbitrum"
  },
  "avalanche": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/12/large/avalanche.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "alt": "Avalanche"
  },
  "bnb": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/1/large/bnb_smart_chain.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "alt": "BNB Chain"
  },
  "sui": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/126/large/sui-ocean-square.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
    "alt": "Sui"
  },
  "optimism": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/41/large/optimism.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25244/large/Token.png",
    "alt": "Optimism"
  },
  "polygon": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/15/large/polygon_pos.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    "alt": "Polygon"
  },
  "bitcoin": {
    "src": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "alt": "Bitcoin"
  },
  "abstract": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/22196/large/abstract.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/22196/large/abstract.jpg",
    "alt": "Abstract"
  },
  "adi": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/102132311/large/adi-chain.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/68846/large/ADI_Token-min.png",
    "alt": "ADI"
  },
  "aleo": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/102132319/large/aleo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png",
    "alt": "Aleo"
  },
  "aptos": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/116/large/aptos_round.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Profile-Picture_%281%29.png",
    "alt": "Aptos"
  },
  "aurora": {
    "src": "https://coin-images.coingecko.com/coins/images/20582/large/aurora.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/20582/large/aurora.jpeg",
    "alt": "Aurora"
  },
  "bch": {
    "src": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
    "alt": "Bitcoin Cash"
  },
  "berachain": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/176/large/berachain.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/25235/large/BERA.png",
    "alt": "Berachain"
  },
  "cardano": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/22/large/cardano.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
    "alt": "Cardano"
  },
  "dash": {
    "src": "https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png",
    "alt": "Dash"
  },
  "dogecoin": {
    "src": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
    "alt": "Dogecoin"
  },
  "fogo": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/102132286/large/fogo.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/68100/large/fogo_AppIcon.png",
    "alt": "Fogo"
  },
  "gnosis": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/11062/large/Aatar_green_white.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png",
    "alt": "Gnosis"
  },
  "hood": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/102132299/large/robinhood.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/102132299/large/robinhood.png",
    "alt": "Robinhood Chain"
  },
  "hypercore": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/243/large/hyperliquid.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg",
    "alt": "Hyperliquid"
  },
  "litecoin": {
    "src": "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
    "alt": "Litecoin"
  },
  "miden": {
    "src": "/assets/tokens/miden.svg",
    "coingeckoUrl": "/assets/tokens/miden.svg",
    "alt": "Miden"
  },
  "monad": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/22182/large/monad.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/38927/large/mon.png",
    "alt": "Monad"
  },
  "movement": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/32234/large/movement.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png",
    "alt": "Movement"
  },
  "plasma": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/32256/large/plasma.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/66489/large/Plasma-symbol-green-1.png",
    "alt": "Plasma"
  },
  "prl": {
    "src": "https://coin-images.coingecko.com/coins/images/102173580/large/pearl.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102173580/large/pearl.png",
    "alt": "Pearl"
  },
  "qtc": {
    "src": "https://coin-images.coingecko.com/coins/images/102171910/large/Token_Icon.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/102171910/large/Token_Icon.png",
    "alt": "Quantus"
  },
  "scroll": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/153/large/scroll.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/asset_platforms/images/153/large/scroll.jpeg",
    "alt": "Scroll"
  },
  "starknet": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/151/large/starknet.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/26433/large/starknet.png",
    "alt": "Starknet"
  },
  "stellar": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/100/large/stellar.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg",
    "alt": "Stellar"
  },
  "ton": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/142/large/tonblockchain.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png",
    "alt": "TON"
  },
  "xlayer": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/238/large/x_logo.jpeg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png",
    "alt": "X Layer"
  },
  "xrp": {
    "src": "https://coin-images.coingecko.com/asset_platforms/images/36/large/xrp-logo.jpg",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    "alt": "XRP Ledger"
  },
  "zcash": {
    "src": "https://coin-images.coingecko.com/coins/images/486/large/Brandmark-Yellow_%281%29.png",
    "coingeckoUrl": "https://coin-images.coingecko.com/coins/images/486/large/Brandmark-Yellow_%281%29.png",
    "alt": "Zcash"
  }
};
