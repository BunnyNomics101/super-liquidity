const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const assert = require("assert");

describe("mock-oracle", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.MockOracle;

  let tempCoin = {
    price: new BN(1000000),
    symbol: "MockUSDT",
  };

  let listener = null;

  function checkData(slot, event, tempCoin, coinInfo) {
    assert.ok(slot > 0);
    assert.ok(event.symbol == tempCoin.symbol);
    assert.ok(event.price.eq(tempCoin.price));
    assert.ok(event.lastUpdateTimestamp.eq(coinInfo.lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == tempCoin.symbol);
    assert.ok(coinInfo.price.eq(tempCoin.price));
  }

  it("Initialize coinInfo oracle", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event, slot] = await new Promise(async (resolve, _reject) => {
      listener = program.addEventListener("NewCoinInfo", (event, slot) => {
        resolve([event, slot]);
      });

      const tx = await program.rpc
        .createCoin(tempCoin.price, tempCoin.symbol, bump, {
          accounts: {
            coin: coinPDA,
            authority: provider.wallet.publicKey,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        })
        .catch((err) => {
          console.error(err);
        });
    });

    await program.removeEventListener(listener);
    const coinInfo = await program.account.coinInfo.fetch(coinPDA);

    checkData(slot, event, tempCoin, coinInfo);
  });

  it("Update coinInfo oracle", async () => {
    tempCoin.price = new BN(258);

    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let [event, slot] = await new Promise(async (resolve, _reject) => {
      listener = program.addEventListener("NewCoinInfo", (event, slot) => {
        resolve([event, slot]);
      });

      const tx = await program.rpc
        .updateCoin(tempCoin.price, {
          accounts: {
            coin: coinPDA,
            authority: provider.wallet.publicKey,
          },
        })
        .catch((err) => {
          console.error(err);
        });
    });

    await program.removeEventListener(listener);
    const coinInfo = await program.account.coinInfo.fetch(coinPDA);

    checkData(slot, event, tempCoin, coinInfo);
  });

  it("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    let coinInfo = await program.account.coinInfo.fetch(coinPDA);
    let lastUpdateTimestamp = coinInfo.lastUpdateTimestamp;

    program.rpc
      .updateCoin(new BN(5368), {
        accounts: {
          authority: aRandomKey.publicKey,
          coin: coinPDA,
        },
        signers: [aRandomKey],
      })
      .catch((err) => {
        assert.ok(err.msg == "You are not authorized to perform this action.");
      });

    coinInfo = await program.account.coinInfo.fetch(coinPDA);

    assert.ok(coinInfo.lastUpdateTimestamp.eq(lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == tempCoin.symbol);
    assert.ok(coinInfo.price.eq(tempCoin.price));
  });

  it("Delete coin", async () => {
    // compute a PDA based on program.programId + symbol
    let [coinPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [tempCoin.symbol],
      program.programId
    );

    const tx = await program.rpc
      .deleteCoin({
        accounts: {
          coin: coinPDA,
          authority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
        },
      })
      .catch((err) => {
        console.error(err);
      });

    try {
      coinInfo = await program.account.coinInfo.fetch(coinPDA);
      assert.ok(false);
    } catch (e) {
      assert.ok(e == "Error: Account does not exist " + coinPDA.toBase58());
    }
  });
});
