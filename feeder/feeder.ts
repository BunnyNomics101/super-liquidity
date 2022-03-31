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

const ADMIN_ACCOUNT = new PublicKey(
  "2kKx9xZB85wAbpvXLBui78jVZhPBuY3BxZ5Mad9d94h5"
);

const [delphorAggregatorId, aggregatorProgram] = getProgramData(
  "../target/idl/delphor_oracle_aggregator.json",
  "Ev8Q73RFWaDPTc1YBaa6Zu7J2XmQMQy3aQcdyb3Z64Qd"
);

const [delphorOracleId, oracleProgram] = getProgramData(
  "../target/idl/delphor_oracle.json",
  "orcGZ2qdQPdF2CpwP6kHD6AJHA5oSZiFFDBmNEHyyS4"
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

async function aggregatorAddToken(
  mint: PublicKey,
  symbol: string,
  globalAccount: PublicKey,
  pythProductAccount: PublicKey,
  switchboardOptimizedFeedAccount: PublicKey
) {
  let params = [DECIMALS, symbol];
  let accounts = {
    globalAccount,
    mint,
    authority,
    switchboardOptimizedFeedAccount,
    pythProductAccount,
  };
  const tx = await programCall(aggregatorProgram, "addToken", params, accounts);
  console.log("Aggregator token added: ", tx);
}

async function aggregatorUpdatePrice(
  position: number,
  globalAccount: PublicKey,
  delphorOracle: PublicKey,
  pythPriceAccount: PublicKey,
  switchboardOptimizedFeedAccount: PublicKey
) {
  let params = [position];
  let accounts = {
    switchboardOptimizedFeedAccount,
    pythPriceAccount,
    delphorOracle,
    globalAccount,
    authority,
  };
  const tx = await programCall(
    aggregatorProgram,
    "updateTokenPrice",
    params,
    accounts
  );
  console.log("Aggregator price updated: ", tx);
}

async function oracleCreateCoin(
  coinGeckoPrice: BN,
  orcaPrice: BN,
  coin: PublicKey,
  symbol: string
) {
  let params = [coinGeckoPrice, orcaPrice, orcaPrice, symbol];
  let accounts = {
    authority,
    coin,
    payer,
    systemProgram,
  };
  const tx = await programCall(oracleProgram, "createCoin", params, accounts);
  console.log("Oracle token PDA created:", tx);
}

async function oracleUpdateCoin(
  coinGeckoPrice: BN,
  symbol: string,
  orcaPrice: BN,
  coin: PublicKey
) {
  let params = [coinGeckoPrice, orcaPrice, orcaPrice];
  let accounts = {
    authority,
    coin,
  };
  const tx = await programCall(oracleProgram, "updateCoin", params, accounts);
  console.log("Oracle token PDA update", symbol, ":", tx);
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

async function getOraclePDAs(): Promise<PublicKey[]> {
  let symbolsLength = SYMBOLS.length;
  let pdas = new Array<PublicKey>(symbolsLength);
  for (let i = 0; i < symbolsLength; i++) {
    [pdas[i]] = await PublicKey.findProgramAddress(
      [Buffer.from(SYMBOLS[i])],
      delphorOracleId
    );
  }
  return pdas;
}

async function createAggregatorGlobalAccount(): Promise<PublicKey> {
  let [aggregatorGlobalAccount] = await PublicKey.findProgramAddress(
    [ADMIN_ACCOUNT.toBuffer()],
    aggregatorProgram.programId
  );

  try {
    await aggregatorProgram.account.globalAccount.fetch(
      aggregatorGlobalAccount.toBase58()
    );
  } catch (err) {
    await programCall(aggregatorProgram, "initGlobalAccount", [ADMIN_ACCOUNT], {
      globalAccount: aggregatorGlobalAccount,
      payer,
      systemProgram,
    });
  }
  return aggregatorGlobalAccount;
}

async function main() {
  let updatingPrices = false;
  const coinPDAs = await getOraclePDAs();
  const aggregatorGlobalAccount = await createAggregatorGlobalAccount();
  let task = cron.schedule("*/" + INTERVAL_UPDATE + " * * * * *", async () => {
    if (updatingPrices) return;
    updatingPrices = true;
    /*
    for (let x = 0; x < SYMBOLS.length; x++) {
      try{
        await aggregatorAddToken(
          MINT_DEVNET_ACCOUNTS[x],
          SYMBOLS[x],
          aggregatorGlobalAccount,
          PYTH_DEVNET_PRODUCT_ACCOUNTS[x],
          SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x]
        );
      }catch(err){
        console.log(err);
        return
      }
    }
*/
    for (let x = 0; x < SYMBOLS.length; x++) {
      let symbol = SYMBOLS[x];
      try {
        let coinGeckoPrice = await getCoingeckoPrice(COIN_GECKO_IDS[x]);
        let orcaPrice = await getOrcaPrice(ORCA_POOL_ACCOUNTS[x]);
        try {
          await oracleProgram.account.coinInfo.fetch(coinPDAs[x].toBase58());
          await oracleUpdateCoin(
            coinGeckoPrice,
            symbol,
            orcaPrice,
            coinPDAs[x]
          );
        } catch (err) {
          await oracleCreateCoin(
            coinGeckoPrice,
            orcaPrice,
            coinPDAs[x],
            symbol
          );
        }
        let aggregatorGlobalAccountData =
          await aggregatorProgram.account.globalAccount.fetch(
            aggregatorGlobalAccount.toBase58()
          );
        let tokenExist = false;
        aggregatorGlobalAccountData.tokens.forEach((element) => {
          if (element.mint == MINT_DEVNET_ACCOUNTS[x]) {
            tokenExist = true;
          }
        });
        if (tokenExist) {
          await aggregatorUpdatePrice(
            x,
            aggregatorGlobalAccount,
            coinPDAs[x],
            PYTH_DEVNET_PRICE_ACCOUNTS[x],
            SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x]
          );
        } else {
          await aggregatorAddToken(
            MINT_DEVNET_ACCOUNTS[x],
            symbol,
            aggregatorGlobalAccount,
            PYTH_DEVNET_PRODUCT_ACCOUNTS[x],
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
