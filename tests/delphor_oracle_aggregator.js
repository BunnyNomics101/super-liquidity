const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const assert = require("assert");

const { createMint } = require("./utils");

function checkData(mockSOL, coinData) {
  assert.ok(coinData.symbol == mockSOL.symbol);
  assert.ok(coinData.coinGeckoPrice.eq(mockSOL.price));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("delphor-oracle-aggregator", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const delphorAggregatorProgram = anchor.workspace.DelphorOracleAggregator;
  const adminAccount = provider.wallet.publicKey;

  let mockSOL = {
    price: new BN(150000),
    symbol: "MSOL",
    decimals: 9,
  };

  let mockSOLMint,
    delphorOracleMockSOLPDA,
    delphorOracleMockSOLPDAbump,
    delphorAggregatorMockSOLPDA,
    delphorAggregatorMockSOLPDAbump;

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

  it("DelphorOracle create coin", async () => {
    [delphorOracleMockSOLPDA, delphorOracleMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        delphorOracleProgram.programId
      );

    let delphorOracleMockSOLData;

    try {
      // Catch if coin is already created for tests on devnet
      delphorOracleMockSOLData = await delphorOracleProgram.account.coinInfo.fetch(
        delphorOracleMockSOLPDA
      );
    } catch (err) {
      await delphorOracleProgram.rpc.createCoin(
        mockSOL.price,
        mockSOL.price,
        delphorOracleMockSOLPDAbump,
        mockSOL.symbol,
        {
          accounts: {
            coin: delphorOracleMockSOLPDA,
            authority: adminAccount,
            payer: adminAccount,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        }
      );
      delphorOracleMockSOLData = await delphorOracleProgram.account.coinInfo.fetch(
        delphorOracleMockSOLPDA
      );
    }

    checkData(mockSOL, delphorOracleMockSOLData);
  });

  it("DelphorOracle init coin", async () => {
    [delphorAggregatorMockSOLPDA, delphorAggregatorMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOLMint.toBuffer()],
        delphorAggregatorProgram.programId
      );

    await delphorAggregatorProgram.rpc.initCoin(
      delphorAggregatorMockSOLPDAbump,
      mockSOL.decimals,
      mockSOL.symbol,
      {
        accounts: {
          switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
          pythProductAccount: pythProductAccount,
          coinData: delphorAggregatorMockSOLPDA,
          mint: mockSOLMint,
          authority: adminAccount,
          payer: adminAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const delphorMockSOLData =
      await delphorAggregatorProgram.account.coinData.fetch(delphorAggregatorMockSOLPDA);

    assert.ok(delphorMockSOLData.symbol == mockSOL.symbol);
    assert.ok(delphorMockSOLData.mint.toBase58() == mockSOLMint.toBase58());
    assert.ok(
      delphorMockSOLData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockSOLData.decimals == mockSOL.decimals);
  });

  it("DelphorOracle update price", async () => {
    await delphorAggregatorProgram.rpc.updateCoinPrice({
      accounts: {
        switchboardOptimizedFeedAccount,
        pythPriceAccount,
        coinOracle3: delphorOracleMockSOLPDA,
        coinData: delphorAggregatorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData =
      await delphorAggregatorProgram.account.coinData.fetch(delphorAggregatorMockSOLPDA);

    // checkData(mockSOL, delphorMockSOLData);
  });
  return;
  it("DelphorOracle update coinInfo", async () => {
    mockSOL.price = new BN(258);

    await delphorOracleProgram.rpc.updateCoin(mockSOL.price, {
      accounts: {
        coin: delphorOracleMockSOLPDA,
        authority: provider.wallet.publicKey,
      },
    });

    const coinInfo = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    checkData(mockSOL, coinInfo);
  });

  it("DelphorOralce update price", async () => {
    // Solana doesn't allow sending two identical tx's within the same block,
    // so we wait a second. Otherwise revert with:
    // "Error: failed to send transaction: Transaction simulation failed:
    // This transaction has already been processed"
    await sleep(1000);

    await delphorAggregatorProgram.rpc.updateCoinPrice({
      accounts: {
        pythPriceAccountData: pythPriceAccountData,
        coinOracle2: delphorOracleMockSOLPDA,
        coinOracle3: delphorOracleMockSOLPDA,
        coinData: delphorAggregatorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData =
      await delphorAggregatorProgram.account.coinData.fetch(delphorAggregatorMockSOLPDA);

    checkData(mockSOL, delphorMockSOLData);
  });

  // TODO: Reject update price from non authority
  // Or add checks to secure the accounts that are passed to the oracle

  /*
  xit("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    // compute a PDA based on delphorOracleProgram.programId + symbol
    let [delphorOracleMockSOLPDA, delphorOracleMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        delphorOracleProgram.programId
      );

    let coinInfo = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );
    let lastUpdateTimestamp = coinInfo.lastUpdateTimestamp;

    delphorOracleProgram.rpc
      .updateCoin(new BN(5368), {
        accounts: {
          authority: aRandomKey.publicKey,
          coin: delphorOracleMockSOLPDA,
        },
        signers: [aRandomKey],
      })
      .catch((err) => {
        assert.ok(err.msg == "You are not authorized to perform this action.");
      });

    coinInfo = await delphorOracleProgram.account.coinInfo.fetch(delphorOracleMockSOLPDA);

    assert.ok(coinInfo.lastUpdateTimestamp.eq(lastUpdateTimestamp));
    assert.ok(coinInfo.symbol == mockSOL.symbol);
    assert.ok(coinInfo.price.eq(mockSOL.price));
  });
  */
});
