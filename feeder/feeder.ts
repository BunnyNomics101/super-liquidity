import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import * as cron from "node-cron";
import fetch from "node-fetch";

process.env.ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com";
//process.env.ANCHOR_PROVIDER_URL = "http://127.0.0.1:8899";
process.env.ANCHOR_WALLET = "../.secret";
const provider = anchor.Provider.env();

anchor.setProvider(provider);

const mockOracleIdl = JSON.parse(
  fs.readFileSync("../target/idl/mock_oracle.json", "utf8")
);
const mockOracleAddress = mockOracleIdl.metadata
  ? mockOracleIdl.metadata.address
  : "6BQhRV18kqJMLSXVuU3cxiX3KcpeLMZFQLura3QdrDUa";
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

async function delphorInitCoin(
  mintToken,
  symbol,
  decimals,
  delphorOraclePDA,
  delphorOraclePDAbump,
  pythProductAccount
) {
  const tx = await delphorOracleProgram.rpc.initCoin(
    delphorOraclePDAbump,
    decimals,
    symbol,
    {
      accounts: {
        pythProductAccount: pythProductAccount,
        coinData: delphorOraclePDA,
        mint: mintToken,
        authority: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    }
  );
  console.log("Delphor coin initialized: ", tx);
}

async function delphorUpdatePrice(delphorOraclePDA, oraclePDA, pythPriceAccount) {
  const tx = await delphorOracleProgram.rpc.updateCoinPrice({
    accounts: {
      pythPriceAccount: pythPriceAccount,
      coinOracle2: oraclePDA,
      coinOracle3: oraclePDA,
      coinData: delphorOraclePDA,
      payer: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
  });
  console.log("Delphor price updated: ", tx);
}

async function createCoin(coinInfo, coinPDA, bump) {
  const tx = await mockOracleProgram.rpc.createCoin(
    coinInfo.price,
    coinInfo.coinGeckoTokenId,
    bump,
    {
      accounts: {
        authority: provider.wallet.publicKey,
        coin: coinPDA,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    }
  );
  console.log("Created:", tx);
}

async function updateCoin(coinInfo, coinPDA, bump) {
  const tx = await mockOracleProgram.rpc.updateCoin(coinInfo.price, {
    accounts: {
      authority: provider.wallet.publicKey,
      coin: coinPDA,
      payer: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
  });
  console.log("Update", coinInfo.coinGeckoTokenId, ":", tx);
}

// Configure the local cluster.
async function main() {
  let updatingPrices = false;
  const SETTINGS = require("./settings.json");
  const SYMBOLS_ALLOWED = SETTINGS.symbols;
  const MOCK_ORACLE_DEVNET_ACCOUNTS = SETTINGS.mockOracleDevnetPriceAccounts;
  const PYTH_DEVNET_PRICE_ACCOUNTS = SETTINGS.pythDevnetPriceAccounts;
  const PYTH_DEVNET_PRODUCT_ACCOUNTS = SETTINGS.pythDevnetProductAccounts;
  const INTERVAL_UPDATE = SETTINGS.intervalUpdate;
  const MIN_PRICE_VARIATION = SETTINGS.minPriceVariation;

  let task = cron.schedule("*/" + INTERVAL_UPDATE + " * * * * *", async () => {
    if (updatingPrices) {
      return;
    }
    updatingPrices = true;

    for (let x = 0; x < SYMBOLS_ALLOWED.length; x++) {
      let coinGeckoTokenId = SYMBOLS_ALLOWED[x];
      let priceJson = {};
      try {
        let priceResponse = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=" +
            coinGeckoTokenId +
            "&vs_currencies=usd"
        );
        priceJson = await priceResponse.json();
        if (priceJson[coinGeckoTokenId]["usd"]) {
          let newCoinPrice = Math.trunc(
            priceJson[coinGeckoTokenId]["usd"].toFixed(5) * 1000000000
          );
          let coinInfo: {
            coinGeckoTokenId: string;
            price: BN;
          } = {
            coinGeckoTokenId: coinGeckoTokenId,
            price: new BN(newCoinPrice),
          };

          let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from(coinGeckoTokenId)],
            mockOracleId
          );
          let tokenMint = MOCK_ORACLE_DEVNET_ACCOUNTS[x];
          let pythPriceAccount = PYTH_DEVNET_PRICE_ACCOUNTS[x];
          let pythProductAccount = PYTH_DEVNET_PRODUCT_ACCOUNTS[x];
          try {
            let contractCoinInfo =
              await mockOracleProgram.account.coinInfo.fetch(
                coinPDA.toBase58()
              );
            let storedPrice = Number(contractCoinInfo["price"]);
            let dif = Math.abs(storedPrice - newCoinPrice);
            if ((dif / storedPrice) * 100 >= MIN_PRICE_VARIATION) {
              await updateCoin(coinInfo, coinPDA, bump);
              let mintToken = new anchor.web3.PublicKey(tokenMint);
              let [delphorOraclePDA, delphorOraclePDAbump] =
                await anchor.web3.PublicKey.findProgramAddress(
                  [mintToken.toBuffer()],
                  delphorOracleProgram.programId
                );
              try {
                let contractCoinInfo =
                  await delphorOracleProgram.account.coinData.fetch(
                    delphorOraclePDA.toBase58()
                  );
                await delphorUpdatePrice(
                  delphorOraclePDA,
                  coinPDA,
                  new anchor.web3.PublicKey(pythPriceAccount),
                );
              } catch (err) {
                await delphorInitCoin(
                  mintToken,
                  coinGeckoTokenId,
                  9,
                  delphorOraclePDA,
                  delphorOraclePDAbump,
                  pythProductAccount
                );
                await delphorUpdatePrice(
                  delphorOraclePDA,
                  coinPDA,
                  new anchor.web3.PublicKey(pythPriceAccount),
                );
              }
            }
          } catch (err) {
            await createCoin(coinInfo, coinPDA, bump);
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
