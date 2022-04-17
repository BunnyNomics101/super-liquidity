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
  "BSVnZFytqxNN5e9UVN434YRWEFXJdpQyyyB8QmXoXdd3"
);

const [delphorOracleId, oracleProgram] = getProgramData(
  "../target/idl/delphor_oracle.json",
  "CSLRinGydCdX4KZs1ngeRQHfdfh1g63g8wwCGUZ4r5j8"
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

    for (let x = 0; x < SYMBOLS.length; x++) {
      try {
        const tx = await programCall(
          aggregatorProgram,
          "addToken",
          [DECIMALS, SYMBOLS[x]],
          {
            globalAccount: aggregatorGlobalAccount,
            mint: MINT_DEVNET_ACCOUNTS[x],
            authority,
            switchboardOptimizedFeedAccount:
              SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x],
            pythProductAccount: PYTH_DEVNET_PRODUCT_ACCOUNTS[x],
          }
        );

        console.log("Aggregator token added: ", tx);
      } catch (e) {
        console.log(e);
        return;
      }
    }
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
    for (let x = 0; x < SYMBOLS.length; x++) {
      let symbol = SYMBOLS[x];
      try {
        let coinGeckoPrice = await getCoingeckoPrice(COIN_GECKO_IDS[x]);
        let orcaPrice = await getOrcaPrice(ORCA_POOL_ACCOUNTS[x]);
        try {
          await oracleProgram.account.coinInfo.fetch(coinPDAs[x].toBase58());
          const tx = await programCall(
            oracleProgram,
            "updateCoin",
            [coinGeckoPrice, orcaPrice, orcaPrice],
            {
              authority,
              coin: coinPDAs[x],
            }
          );
          console.log("Oracle token PDA updated", symbol, ":", tx);
        } catch (err) {
          const tx = await programCall(
            oracleProgram,
            "createCoin",
            [coinGeckoPrice, orcaPrice, orcaPrice, symbol],
            {
              authority,
              coin: coinPDAs[x],
              payer,
              systemProgram,
            }
          );
          console.log("Oracle token PDA created:", tx);
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
          const tx = await programCall(
            aggregatorProgram,
            "updateTokenPrice",
            [x],
            {
              switchboardOptimizedFeedAccount:
                SWITCHBOARD_DEVNET_OPTIMIZED_FEED_ACCOUNTS[x],
              pythPriceAccount: PYTH_DEVNET_PRICE_ACCOUNTS[x],
              delphorOracle: coinPDAs[x],
              globalAccount: aggregatorGlobalAccount,
              authority,
            }
          );
          console.log("Aggregator price updated: ", tx);
        } else {
          console.log(
            "Mint ",
            MINT_DEVNET_ACCOUNTS[x],
            " don't exists on agg."
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
