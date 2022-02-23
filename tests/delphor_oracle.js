const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const assert = require("assert");
const {
  programCall,
  expectProgramCallRevert,
  checkEqualValues,
} = require("./utils");

describe("delphor-oracle", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.DelphorOracle;
  const authority = provider.wallet.publicKey;
  const payer = provider.wallet.publicKey;
  const systemProgram = anchor.web3.SystemProgram.programId;

  let tempCoin = {
    price: new BN(1000000),
    symbol: "MockUSDT",
  };

  let listener = null;

  it("Initialize coinInfo", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event] = await new Promise(async (resolve, _reject) => {
      listener = program.addEventListener("NewCoinInfo", (event, slot) => {
        resolve([event, slot]);
      });

      await programCall(
        program,
        "createCoin",
        [tempCoin.price, tempCoin.price, tempCoin.symbol],
        {
          coin: coinPDA,
          authority,
          payer,
          systemProgram,
        }
      );
    });

    await program.removeEventListener(listener);
    const coinInfo = await program.account.coinInfo.fetch(coinPDA);

    assert.ok(
      checkEqualValues(
        [
          event.symbol,
          event.coinGeckoPrice,
          event.lastUpdateTimestamp,
          tempCoin.symbol,
          tempCoin.price,
        ],
        [
          tempCoin.symbol,
          tempCoin.price,
          coinInfo.lastUpdateTimestamp,
          coinInfo.symbol,
          coinInfo.coinGeckoPrice,
        ]
      )
    );
  });

  it("Update coinInfo", async () => {
    tempCoin.price = new BN(258);

    // compute a PDA based on program.programId + symbol
    let [coinPDA] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event] = await new Promise(async (resolve, _reject) => {
      listener = program.addEventListener("NewCoinInfo", (event, slot) => {
        resolve([event, slot]);
      });

      await programCall(
        program,
        "updateCoin",
        [tempCoin.price, tempCoin.price],
        {
          coin: coinPDA,
          authority,
        }
      );
    });

    await program.removeEventListener(listener);
    const coinInfo = await program.account.coinInfo.fetch(coinPDA);

    assert.ok(
      checkEqualValues(
        [
          event.symbol,
          event.coinGeckoPrice,
          event.lastUpdateTimestamp,
          tempCoin.symbol,
          tempCoin.price,
        ],
        [
          tempCoin.symbol,
          tempCoin.price,
          coinInfo.lastUpdateTimestamp,
          coinInfo.symbol,
          coinInfo.coinGeckoPrice,
        ]
      )
    );
  });

  it("Reject update coinInfo from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on program.programId + symbol
    let [coinPDA] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let coinInfo = await program.account.coinInfo.fetch(coinPDA);
    let lastUpdateTimestamp = coinInfo.lastUpdateTimestamp;

    assert.ok(
      await expectProgramCallRevert(
        program,
        "updateCoin",
        [new BN(5368), new BN(5368)],
        {
          coin: coinPDA,
          authority: aRandomKey.publicKey,
        },
        "You are not authorized to perform this action.",
        [aRandomKey]
      )
    );

    coinInfo = await program.account.coinInfo.fetch(coinPDA);

    assert.ok(
      checkEqualValues(
        [tempCoin.symbol, tempCoin.price, lastUpdateTimestamp],
        [coinInfo.symbol, coinInfo.coinGeckoPrice, coinInfo.lastUpdateTimestamp]
      )
    );
  });

  it("Delete coin", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    await programCall(program, "deleteCoin", [], {
      coin: coinPDA,
      authority,
      payer,
    });

    try {
      await program.account.coinInfo.fetch(coinPDA);
      assert.ok(false);
    } catch (e) {
      assert.ok(e == "Error: Account does not exist " + coinPDA.toBase58());
    }
  });
});
