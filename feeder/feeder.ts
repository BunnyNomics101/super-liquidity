import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import * as cron from "node-cron";
import { Connection, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
import { getOrca } from "@orca-so/sdk";
import Decimal from "decimal.js";
import {
  coinGeckoIds as COIN_GECKO_IDS,
  symbols as SYMBOLS,
  mockOracleDevnetPriceAccounts as MOCK_ORACLE_DEVNET_ACCOUNTS,
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

const mockOracleIdl = JSON.parse(
  fs.readFileSync("../target/idl/mock_oracle.json", "utf8")
);
const mockOracleAddress = mockOracleIdl.metadata
  ? mockOracleIdl.metadata.address
  : "EfufQbaDxhhq693vUSaeKU2aKvxpwk114Fw3qTkM87Ke";
const mockOracleId = new anchor.web3.PublicKey(mockOracleAddress);
const mockOracleProgram = new anchor.Program(mockOracleIdl, mockOracleId);

const delphorOracleIdl = JSON.parse(
  fs.readFileSync("../target/idl/delphor_oracle.json", "utf8")
);
const delphorOracleAddress = delphorOracleIdl.metadata
  ? delphorOracleIdl.metadata.address
  : "DJkR4f9MY9NBYsJS1m2aXmhM97B1nW8fMVCcSAtsBdg8";
const delphorOracleId = new anchor.web3.PublicKey(delphorOracleAddress);
const delphorOracleProgram = new anchor.Program(
  delphorOracleIdl,
  delphorOracleId
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
  coinDataBump: number,
  pythProductAccount: PublicKey,
  switchboardOptimizedFeedAccount: PublicKey
) {
  let params = [coinDataBump, DECIMALS, symbol];
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
    delphorOracleProgram,
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
    delphorOracleProgram,
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
  bump: number
) {
  let params = [coinGeckoPrice, orcaPrice, bump, symbol];
  let accounts = {
    authority,
    coin,
    payer,
    systemProgram,
  };
  const tx = await programCall(
    mockOracleProgram,
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
    mockOracleProgram,
    "updateCoin",
    params,
    accounts
  );
  console.log("Update", symbol, ":", tx);
}

async function main() {
  let updatingPrices = false;

  let task = cron.schedule("*/" + INTERVAL_UPDATE + " * * * * *", async () => {
    if (updatingPrices) {
      return;
    }
    updatingPrices = true;

    for (let x = 0; x < COIN_GECKO_IDS.length; x++) {
      let coinGeckoTokenId = COIN_GECKO_IDS[x];
      let symbol = SYMBOLS[x];
      try {
        let priceResponse = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=" +
            coinGeckoTokenId +
            "&vs_currencies=usd"
        );
        let priceJson: Object = await priceResponse.json();
        if (priceJson[coinGeckoTokenId]["usd"]) {
          let coinGeckoPrice = new BN(
            Math.trunc(
              priceJson[coinGeckoTokenId]["usd"].toFixed(5) * 1000000000
            )
          );
          let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from(symbol)],
            mockOracleId
          );
          let pythPriceAccount = PYTH_DEVNET_PRICE_ACCOUNTS[x];
          let orcaPool = orca.getPool(ORCA_POOL_ACCOUNTS[x]);
          let quote = await orcaPool.getQuote(
            orcaPool.getTokenA(),
            new Decimal(0.001)
          );
          let orcaMinAmount =
            quote.getMinOutputAmount().value.toNumber() * 10 ** 3;
          let scale = quote.getMinOutputAmount().scale;
          if (scale < DECIMALS) {
            orcaMinAmount *= 10 ** (DECIMALS - scale);
          } else if (scale > DECIMALS) {
            orcaMinAmount /= 10 ** (scale - DECIMALS);
          }
          let orcaPrice = new BN(orcaMinAmount);
          let switchboardOptimizedFeedAccount =
            SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x];
          try {
            await mockOracleProgram.account.coinInfo.fetch(coinPDA.toBase58());
            await updateCoin(coinGeckoPrice, symbol, orcaPrice, coinPDA);
          } catch (err) {
            await createCoin(coinGeckoPrice, orcaPrice, coinPDA, symbol, bump);
          }
          let mintToken = new anchor.web3.PublicKey(
            MOCK_ORACLE_DEVNET_ACCOUNTS[x]
          );
          let [delphorOraclePDA, delphorOraclePDAbump] =
            await anchor.web3.PublicKey.findProgramAddress(
              [mintToken.toBuffer()],
              delphorOracleProgram.programId
            );
          try {
            await delphorOracleProgram.account.coinData.fetch(
              delphorOraclePDA.toBase58()
            );
            await delphorUpdatePrice(
              delphorOraclePDA,
              coinPDA,
              pythPriceAccount,
              switchboardOptimizedFeedAccount
            );
          } catch (err) {
            await delphorInitCoin(
              mintToken,
              symbol,
              delphorOraclePDA,
              delphorOraclePDAbump,
              PYTH_DEVNET_PRODUCT_ACCOUNTS[x],
              switchboardOptimizedFeedAccount
            );
            await delphorUpdatePrice(
              delphorOraclePDA,
              coinPDA,
              pythPriceAccount,
              switchboardOptimizedFeedAccount
            );
          }
        }
      } catch (err) {
        console.error(coinGeckoTokenId, err);
      }
    }

    updatingPrices = false;
  });

  task.start();
}

main();
