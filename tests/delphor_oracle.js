const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const assert = require("assert");

const { createMint } = require("./utils");

function checkData(mockSOL, coinData) {
  assert.ok(coinData.symbol == mockSOL.symbol);
  assert.ok(coinData.price.eq(mockSOL.price));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("delphor-oracle", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const mockOracleProgram = anchor.workspace.MockOracle;
  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const adminAccount = provider.wallet.publicKey;

  let mockSOL = {
    price: new BN(150000),
    symbol: "MSOL",
    decimals: 9,
  };

  let mockSOLMint,
    oracleMockSOLPDA,
    oracleMockSOLPDAbump,
    delphorMockSOLPDA,
    delphorMockSOLPDAbump;

  let pythProductAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  let pythPriceAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  let switchboardOptimizedFeedAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  if (process.env.ANCHOR_PROVIDER_URL == "https://api.devnet.solana.com") {
    pythProductAccount = new anchor.web3.PublicKey(
      "os3is9HtWPHW4EXpGAkdr2prdWVs2pS8qKtf2ZYJdBw"
    );

    pythPriceAccount = new anchor.web3.PublicKey(
      "9a6RNx3tCu1TSs6TBSfV2XRXEPEZXQ6WB7jRojZRvyeZ"
    );

    switchboardOptimizedFeedAccount = new anchor.web3.PublicKey(
      "GvvC8SKcr9yrVMsFToU3E29TWtBFHcasPddaLYQqaYFw"
    );
  }

  it("Create MockSOL", async () => {
    mockSOLMint = await createMint(provider, adminAccount);
  });

  it("MockOracle create coin", async () => {
    [oracleMockSOLPDA, oracleMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        mockOracleProgram.programId
      );

    let oracleMockSOLData;

    try {
      // Catch if coin is already created for tests on devnet
      oracleMockSOLData = await mockOracleProgram.account.coinInfo.fetch(
        oracleMockSOLPDA
      );
    } catch (err) {
      await mockOracleProgram.rpc.createCoin(
        mockSOL.price,
        mockSOL.symbol,
        oracleMockSOLPDAbump,
        {
          accounts: {
            coin: oracleMockSOLPDA,
            authority: adminAccount,
            payer: adminAccount,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        }
      );
      oracleMockSOLData = await mockOracleProgram.account.coinInfo.fetch(
        oracleMockSOLPDA
      );
    }

    checkData(mockSOL, oracleMockSOLData);
  });

  it("DelphorOracle init coin", async () => {
    [delphorMockSOLPDA, delphorMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOLMint.toBuffer()],
        delphorOracleProgram.programId
      );

    await delphorOracleProgram.rpc.initCoin(
      delphorMockSOLPDAbump,
      mockSOL.decimals,
      mockSOL.symbol,
      {
        accounts: {
          switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
          pythProductAccount: pythProductAccount,
          coinData: delphorMockSOLPDA,
          mint: mockSOLMint,
          authority: adminAccount,
          payer: adminAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const delphorMockSOLData =
      await delphorOracleProgram.account.coinData.fetch(delphorMockSOLPDA);

    assert.ok(delphorMockSOLData.symbol == mockSOL.symbol);
    assert.ok(delphorMockSOLData.mint.toBase58() == mockSOLMint.toBase58());
    assert.ok(
      delphorMockSOLData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockSOLData.decimals == mockSOL.decimals);
  });

  it("DelphorOracle update price", async () => {
    await delphorOracleProgram.rpc.updateCoinPrice({
      accounts: {
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythPriceAccount: pythPriceAccount,
        coinOracle3: oracleMockSOLPDA,
        coinData: delphorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData =
      await delphorOracleProgram.account.coinData.fetch(delphorMockSOLPDA);
    console.log(delphorMockSOLData.symbol);
    console.log(delphorMockSOLData.price.toString());

    // checkData(mockSOL, delphorMockSOLData);
  });
  return;
  it("MockOracle update coinInfo", async () => {
    mockSOL.price = new BN(258);

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

  it("DelphorOralce update price", async () => {
    // Solana doesn't allow sending two identical tx's within the same block,
    // so we wait a second. Otherwise revert with:
    // "Error: failed to send transaction: Transaction simulation failed:
    // This transaction has already been processed"
    await sleep(1000);

    await delphorOracleProgram.rpc.updateCoinPrice({
      accounts: {
        pythPriceAccountData: pythPriceAccountData,
        coinOracle2: oracleMockSOLPDA,
        coinOracle3: oracleMockSOLPDA,
        coinData: delphorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData =
      await delphorOracleProgram.account.coinData.fetch(delphorMockSOLPDA);

    checkData(mockSOL, delphorMockSOLData);
  });

  // TODO: Reject update price from non authority
  // Or add checks to secure the accounts that are passed to the oracle

  /*
  xit("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on mockOracleProgram.programId + symbol
    let [oracleMockSOLPDA, oracleMockSOLPDAbump] =
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
  */
});
