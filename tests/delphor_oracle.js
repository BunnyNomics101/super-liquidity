const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const assert = require("assert");

function checkData(mockSOL, coinData) {
  assert.ok(coinData.symbol == mockSOL.symbol);
  assert.ok(coinData.price.eq(mockSOL.price));
}

describe("delphor-oracle", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const mockOracleProgram = anchor.workspace.MockOracle;
  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const adminAccount = provider.wallet.publicKey;

  let mockSOL = {
    price: new BN(165800),
    symbol: "MockSOL",
  };

  it("Create coin and update price", async () => {
    let [oracleMockSOLPDA, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        mockOracleProgram.programId
      );

    await mockOracleProgram.rpc.createCoin(
      mockSOL.price,
      mockSOL.symbol,
      bump,
      {
        accounts: {
          coin: oracleMockSOLPDA,
          authority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    let [delphorMockSOLPDA, bump2] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        delphorOracleProgram.programId
      );

    await delphorOracleProgram.rpc.updatePrice(mockSOL.symbol, bump2, {
      accounts: {
        coinOracle1: oracleMockSOLPDA,
        coinOracle2: oracleMockSOLPDA,
        coinOracle3: oracleMockSOLPDA,
        coinPrice: delphorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData = await delphorOracleProgram.account.coinData.fetch(
      delphorMockSOLPDA
    );

    checkData(mockSOL, delphorMockSOLData);
  });
/*
  xit("Update coinInfo oracle", async () => {
    mockSOL.price = new BN(258);

    // compute a PDA based on mockOracleProgram.programId + symbol
    let [oracleMockSOLPDA, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        mockOracleProgram.programId
      );

    await mockOracleProgram.rpc.updateCoin(mockSOL.price, {
      accounts: {
        coin: oracleMockSOLPDA,
        authority: provider.wallet.publicKey,
      },
    });

    const coinInfo = await mockOracleProgram.account.coinInfo.fetch(
      oracleMockSOLPDA
    );

    checkData(mockSOL, coinInfo);
  });

  xit("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on mockOracleProgram.programId + symbol
    let [oracleMockSOLPDA, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        mockOracleProgram.programId
      );

    let coinInfo = await mockOracleProgram.account.coinInfo.fetch(
      oracleMockSOLPDA
    );
    let lastUpdateTimestamp = coinInfo.lastUpdateTimestamp;

    mockOracleProgram.rpc
      .updateCoin(new BN(5368), {
        accounts: {
          authority: aRandomKey.publicKey,
          coin: oracleMockSOLPDA,
        },
        signers: [aRandomKey],
      })
      .catch((err) => {
        assert.ok(err.msg == "You are not authorized to perform this action.");
      });

    coinInfo = await mockOracleProgram.account.coinInfo.fetch(oracleMockSOLPDA);

    assert.ok(coinInfo.lastUpdateTimestamp.eq(lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == mockSOL.symbol);
    assert.ok(coinInfo.price.eq(mockSOL.price));
  });

  xit("Delete coin", async () => {
    // compute a PDA based on mockOracleProgram.programId + symbol
    let [oracleMockSOLPDA, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        mockOracleProgram.programId
      );

    const tx = await mockOracleProgram.rpc
      .deleteCoin({
        accounts: {
          coin: oracleMockSOLPDA,
          authority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
        },
      })
      .catch((err) => {
        console.error(err);
      });

    try {
      coinInfo = await mockOracleProgram.account.coinInfo.fetch(
        oracleMockSOLPDA
      );
      assert.ok(false);
    } catch (e) {
      assert.ok(
        e == "Error: Account does not exist " + oracleMockSOLPDA.toBase58()
      );
    }
  });
  */
});
