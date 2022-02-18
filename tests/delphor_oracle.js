const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const assert = require("assert");
const { programCall, expectProgramCallRevert } = require("./utils");

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

  function checkData(slot, event, tempCoin, coinInfo) {
    assert.ok(slot > 0);
    assert.ok(event.symbol == tempCoin.symbol);
    assert.ok(event.coinGeckoPrice.eq(tempCoin.price));
    assert.ok(event.lastUpdateTimestamp.eq(coinInfo.lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == tempCoin.symbol);
    assert.ok(coinInfo.coinGeckoPrice.eq(tempCoin.price));
  }

  it("Initialize coinInfo oracle", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event, slot] = await new Promise(async (resolve, _reject) => {
      listener = program.addEventListener("NewCoinInfo", (event, slot) => {
        resolve([event, slot]);
      });

      await programCall(
        program,
        "createCoin",
        [tempCoin.price, tempCoin.price, bump, tempCoin.symbol],
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

    checkData(slot, event, tempCoin, coinInfo);
  });

  it("Update coinInfo oracle", async () => {
    tempCoin.price = new BN(258);

    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event, slot] = await new Promise(async (resolve, _reject) => {
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

    checkData(slot, event, tempCoin, coinInfo);
  });

  it("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await PublicKey.findProgramAddress(
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

    assert.ok(coinInfo.lastUpdateTimestamp.eq(lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == tempCoin.symbol);
    assert.ok(coinInfo.coinGeckoPrice.eq(tempCoin.price));
  });

  it("Delete coin", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    await programCall(program, "deleteCoin", [], {
      coin: coinPDA,
      authority,
      payer,
    });

    try {
      coinInfo = await program.account.coinInfo.fetch(coinPDA);
      assert.ok(false);
    } catch (e) {
      assert.ok(e == "Error: Account does not exist " + coinPDA.toBase58());
    }
  });
});
