import * as fs from 'fs';
import * as anchor from '@project-serum/anchor';
import { BN } from "@project-serum/anchor";
import * as cron from 'node-cron';
import fetch from "node-fetch";

process.env.ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com";
//process.env.ANCHOR_PROVIDER_URL = "http://127.0.0.1:8899";
process.env.ANCHOR_WALLET = "../.secret"
const provider = anchor.Provider.env();

anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync('../target/idl/mock_oracle.json', 'utf8'));

const programAddress = idl.metadata ? idl.metadata.address : 
  '6BQhRV18kqJMLSXVuU3cxiX3KcpeLMZFQLura3QdrDUa';

const programId = new anchor.web3.PublicKey(programAddress)

const program = new anchor.Program(idl, programId);

async function createCoin(coinInfo, coinPDA, bump){
  const tx = await program.rpc.createCoin(
    coinInfo.price, coinInfo.symbol, bump, {
    accounts: {
      authority: provider.wallet.publicKey,
      coin: coinPDA,
      payer: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
  });
  console.log("Created:", tx)
}

async function updateCoin(coinInfo, coinPDA, bump){
  const tx = await program.rpc.updateCoin(
    coinInfo.price, {
    accounts: {
        authority: provider.wallet.publicKey,
        coin: coinPDA,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
    }
  });
  console.log("Update", coinInfo.symbol, ":", tx)
}

// Configure the local cluster.
async function main() {
  let updatingPrices = false;
  const SETTINGS = require("./settings.json")
  const SYMBOLS_ALLOWED = SETTINGS.symbols;
  const INTERVAL_UPDATE = SETTINGS.intervalUpdate;
  const MIN_PRICE_VARIATION = SETTINGS.minPriceVariation;

  let task = cron.schedule('*/' + INTERVAL_UPDATE + ' * * * * *', async() => 
  {
    if(updatingPrices){
      return
    }
    updatingPrices = true;

    for(let x = 0; x < SYMBOLS_ALLOWED.length; x++){
      let symbol = SYMBOLS_ALLOWED[x];
      let priceJson = {}
      try {
        let priceResponse = await fetch("https://api.diadata.org/v1/quotation/" + symbol)
        priceJson = await priceResponse.json(); 
        if(priceJson["Price"]){
          let newCoinPrice = Math.trunc(priceJson["Price"].toFixed(5) * 100000);
          let coinInfo: {
            symbol: string;
            price: BN;
          } = {
            symbol: symbol,
            price: new BN(newCoinPrice)
          }

          let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(symbol)], program.programId)
          try{
            let contractCoinInfo = await program.account.coinInfo.fetch(coinPDA.toBase58());
            let storedPrice = Number(contractCoinInfo["price"]);
            let dif = Math.abs(storedPrice - newCoinPrice)
            if( dif / storedPrice * 100 >= MIN_PRICE_VARIATION){
              await updateCoin(coinInfo, coinPDA, bump);
            }
          }catch(err){
            await createCoin(coinInfo, coinPDA, bump);
          }
        }      
      }catch(err){
        console.error(symbol, err)
      }
    }

    updatingPrices = false;
  });

  task.start();
}

main()