import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import * as cron from "node-cron";
import { Connection, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
import { getOrca, OrcaPoolConfig } from "@orca-so/sdk";
import Decimal from "decimal.js";
import {
  coinGeckoIds as COIN_GECKO_IDS,
  symbols as SYMBOLS,
  mintDevnetAccounts as MINT_DEVNET_ACCOUNTS,
  pythDevnetPriceAccounts as PYTH_DEVNET_PRICE_ACCOUNTS,
  pythDevnetProductAccounts as PYTH_DEVNET_PRODUCT_ACCOUNTS,
  switchboardDevnetOptimizedFeedAccounts as SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS,
  orcaPoolAccounts as ORCA_POOL_ACCOUNTS,
  intervalUpdate as INTERVAL_UPDATE,
} from "./settings.json";

process.env.ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com";
process.env.ANCHOR_WALLET = "../.secret";
const provider = anchor.Provider.env();

anchor.setProvider(provider);

function getProgramData(
  idlPath: string,
  address: string
): [PublicKey, Program] {
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programAddress = idl.metadata ? idl.metadata.address : address;
  const programId = new PublicKey(programAddress);
  const program = new Program(idl, programId);
  return [programId, program];
}

const [delphorAggregatorId, delphorAggregatorProgram] = getProgramData(
  "../target/idl/delphor_oracle_aggregator.json",
  "HbyTY89Se2c8Je7KDKHVjUEGN2sAruFAw3S3NwubzeyU"
);

const [delphorOracleId, delphorOracleProgram] = getProgramData(
  "../target/idl/delphor_oracle.json",
  "3xzPckGW3b771JsrcfQyRYzdPmsYgHjNohupSKHqjEV3"
);

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "singleGossip"
);
const orca = getOrca(connection);

const DECIMALS = 9;
const payer = provider.wallet.publicKey;
const authority = provider.wallet.publicKey;
const systemProgram = anchor.web3.SystemProgram.programId;

async function programCall(
  program: Program,
  f: string,
  params: Array<any>,
  accounts
) {
  return program.rpc[f](...params, {
    accounts: accounts,
  });
}

async function delphorInitCoin(
  mint: PublicKey,
  symbol: string,
  coinData: PublicKey,
  pythProductAccount: PublicKey,
  switchboardOptimizedFeedAccount: PublicKey
) {
  let params = [DECIMALS, symbol];
  let accounts = {
    switchboardOptimizedFeedAccount,
    pythProductAccount,
    coinData,
    mint,
    authority,
    payer,
    systemProgram,
  };
  const tx = await programCall(
    delphorAggregatorProgram,
    "initCoin",
    params,
    accounts
  );
  console.log("Delphor coin initialized: ", tx);
}

async function delphorUpdatePrice(
  coinData: PublicKey,
  coinOracle3: PublicKey,
  pythPriceAccount: PublicKey,
  switchboardOptimizedFeedAccount: PublicKey
) {
  let params = [];
  let accounts = {
    switchboardOptimizedFeedAccount,
    pythPriceAccount,
    coinOracle3,
    coinData,
    payer,
    systemProgram,
  };
  const tx = await programCall(
    delphorAggregatorProgram,
    "updateCoinPrice",
    params,
    accounts
  );
  console.log("Delphor price updated: ", tx);
}

async function createCoin(
  coinGeckoPrice: BN,
  orcaPrice: BN,
  coin: PublicKey,
  symbol: string,
) {
  let params = [coinGeckoPrice, orcaPrice, symbol];
  let accounts = {
    authority,
    coin,
    payer,
    systemProgram,
  };
  const tx = await programCall(
    delphorOracleProgram,
    "createCoin",
    params,
    accounts
  );
  console.log("Created:", tx);
}

async function updateCoin(
  coinGeckoPrice: BN,
  symbol: string,
  orcaPrice: BN,
  coin: PublicKey
) {
  let params = [coinGeckoPrice, orcaPrice];
  let accounts = {
    authority,
    coin,
    payer,
    systemProgram,
  };
  const tx = await programCall(
    delphorOracleProgram,
    "updateCoin",
    params,
    accounts
  );
  console.log("Update", symbol, ":", tx);
}

async function getOrcaPrice(orcaPoolAccount: OrcaPoolConfig): Promise<BN> {
  if ((orcaPoolAccount as string) == "11111111111111111111111111111111") {
    return new BN(0);
  }
  let orcaPool = orca.getPool(orcaPoolAccount);
  let quote = await orcaPool.getQuote(orcaPool.getTokenA(), new Decimal(0.001));
  let orcaMinAmount = quote.getMinOutputAmount().value.toNumber() * 10 ** 3;
  let scale = quote.getMinOutputAmount().scale;
  if (scale < DECIMALS) {
    orcaMinAmount *= 10 ** (DECIMALS - scale);
  } else if (scale > DECIMALS) {
    orcaMinAmount /= 10 ** (scale - DECIMALS);
  }
  return new BN(orcaMinAmount);
}

async function getCoingeckoPrice(tokenId: string): Promise<BN> {
  let priceResponse = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
      tokenId +
      "&vs_currencies=usd"
  );
  let priceJson: Object = await priceResponse.json();
  let price = priceJson[tokenId]["usd"];
  if (price) {
    return new BN(Math.trunc(price.toFixed(5) * 10 ** DECIMALS));
  }
  return new BN(0);
}

async function getOraclePDAs(): Promise<[PublicKey[], number[]]> {
  let symbolsLength = SYMBOLS.length;
  let pdas = new Array<PublicKey>(symbolsLength);
  let bumps = new Array<number>(symbolsLength);
  for (let i = 0; i < symbolsLength; i++) {
    [pdas[i], bumps[i]] = await PublicKey.findProgramAddress(
      [Buffer.from(SYMBOLS[i])],
      delphorOracleId
    );
  }
  return [pdas, bumps];
}

async function getDelphorPDAs(): Promise<[PublicKey[], number[]]> {
  let mintAccountsLength = MINT_DEVNET_ACCOUNTS.length;
  let pdas = new Array<PublicKey>(mintAccountsLength);
  let bumps = new Array<number>(mintAccountsLength);
  for (let i = 0; i < mintAccountsLength; i++) {
    [pdas[i], bumps[i]] = await PublicKey.findProgramAddress(
      [new PublicKey(MINT_DEVNET_ACCOUNTS[i]).toBuffer()],
      delphorAggregatorId
    );
  }
  return [pdas, bumps];
}

async function main() {
  let updatingPrices = false;
  const [coinPDAs, bumps] = await getOraclePDAs();
  const [delphorOraclePDAs, delphorOracleBumps] = await getDelphorPDAs();
  let task = cron.schedule("*/" + INTERVAL_UPDATE + " * * * * *", async () => {
    if (updatingPrices) return;
    updatingPrices = true;
    for (let x = 0; x < SYMBOLS.length; x++) {
      let symbol = SYMBOLS[x];
      try {
        let coinGeckoPrice = await getCoingeckoPrice(COIN_GECKO_IDS[x]);
        let orcaPrice = await getOrcaPrice(ORCA_POOL_ACCOUNTS[x]);
        try {
          await delphorOracleProgram.account.coinInfo.fetch(
            coinPDAs[x].toBase58()
          );
          await updateCoin(coinGeckoPrice, symbol, orcaPrice, coinPDAs[x]);
        } catch (err) {
          await createCoin(
            coinGeckoPrice,
            orcaPrice,
            coinPDAs[x],
            symbol
          );
        }
        try {
          await delphorAggregatorProgram.account.coinData.fetch(
            delphorOraclePDAs[x].toBase58()
          );
          await delphorUpdatePrice(
            delphorOraclePDAs[x],
            coinPDAs[x],
            PYTH_DEVNET_PRICE_ACCOUNTS[x],
            SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x]
          );
        } catch (err) {
          await delphorInitCoin(
            MINT_DEVNET_ACCOUNTS[x],
            symbol,
            delphorOraclePDAs[x],
            PYTH_DEVNET_PRODUCT_ACCOUNTS[x],
            SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x]
          );
          await delphorUpdatePrice(
            delphorOraclePDAs[x],
            coinPDAs[x],
            PYTH_DEVNET_PRICE_ACCOUNTS[x],
            SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x]
          );
        }
      } catch (err) {
        console.error(symbol, err);
      }
    }
    updatingPrices = false;
  });

  task.start();
}

main();
