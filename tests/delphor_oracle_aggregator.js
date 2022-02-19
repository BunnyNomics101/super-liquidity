const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const assert = require("assert");
const {
  createMint,
  programCall,
  sleep,
  checkEqualValues,
  expectProgramCallRevert,
} = require("./utils");

describe("delphor-oracle-aggregator", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const delphorAggregatorProgram = anchor.workspace.DelphorOracleAggregator;
  const adminAccount = provider.wallet.publicKey;
  const payer = provider.wallet.publicKey;
  const systemProgram = anchor.web3.SystemProgram.programId;

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

  let pythProductAccount = systemProgram;
  let pythPriceAccount = systemProgram;
  let switchboardOptimizedFeedAccount = systemProgram;

  if (process.env.ANCHOR_PROVIDER_URL == "https://api.devnet.solana.com") {
    pythProductAccount = new PublicKey(
      "os3is9HtWPHW4EXpGAkdr2prdWVs2pS8qKtf2ZYJdBw"
    );

    pythPriceAccount = new PublicKey(
      "9a6RNx3tCu1TSs6TBSfV2XRXEPEZXQ6WB7jRojZRvyeZ"
    );

    switchboardOptimizedFeedAccount = new PublicKey(
      "GvvC8SKcr9yrVMsFToU3E29TWtBFHcasPddaLYQqaYFw"
    );
  }

  it("Create MockSOL", async () => {
    mockSOLMint = await createMint(provider, adminAccount);
  });

  it("DelphorOracle create coin", async () => {
    [delphorOracleMockSOLPDA, delphorOracleMockSOLPDAbump] =
      await PublicKey.findProgramAddress(
        [mockSOL.symbol],
        delphorOracleProgram.programId
      );

    await programCall(
      delphorOracleProgram,
      "createCoin",
      [
        mockSOL.price,
        mockSOL.price,
        delphorOracleMockSOLPDAbump,
        mockSOL.symbol,
      ],
      {
        coin: delphorOracleMockSOLPDA,
        authority: adminAccount,
        payer,
        systemProgram,
      }
    );

    const pdaData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOL.price, adminAccount, mockSOL.symbol],
        [pdaData.orcaPrice, pdaData.authority, pdaData.symbol]
      )
    );
  });

  it("DelphorOracle init coin", async () => {
    [delphorAggregatorMockSOLPDA, delphorAggregatorMockSOLPDAbump] =
      await PublicKey.findProgramAddress(
        [mockSOLMint.toBuffer()],
        delphorAggregatorProgram.programId
      );

    await programCall(
      delphorAggregatorProgram,
      "initCoin",
      [delphorAggregatorMockSOLPDAbump, mockSOL.decimals, mockSOL.symbol],
      {
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythProductAccount: pythProductAccount,
        coinData: delphorAggregatorMockSOLPDA,
        mint: mockSOLMint,
        authority: adminAccount,
        payer,
        systemProgram,
      }
    );

    const pdaData = await delphorAggregatorProgram.account.coinData.fetch(
      delphorAggregatorMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOLMint, adminAccount, mockSOL.symbol, mockSOL.decimals],
        [pdaData.mint, pdaData.authority, pdaData.symbol, pdaData.decimals]
      )
    );
  });

  it("DelphorOracle update price", async () => {
    await programCall(delphorAggregatorProgram, "updateCoinPrice", [], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      coinOracle3: delphorOracleMockSOLPDA,
      coinData: delphorAggregatorMockSOLPDA,
      payer,
      systemProgram,
    });

    const pdaData = await delphorAggregatorProgram.account.coinData.fetch(
      delphorAggregatorMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOLMint, adminAccount, mockSOL.symbol, mockSOL.decimals],
        [pdaData.mint, pdaData.authority, pdaData.symbol, pdaData.decimals]
      )
    );
  });

  it("DelphorOracle update coinInfo", async () => {
    mockSOL.price = new BN(258);

    await programCall(
      delphorOracleProgram,
      "updateCoin",
      [mockSOL.price, mockSOL.price],
      {
        coin: delphorOracleMockSOLPDA,
        authority: provider.wallet.publicKey,
      }
    );

    const pdaData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOL.price, adminAccount, mockSOL.symbol],
        [pdaData.orcaPrice, pdaData.authority, pdaData.symbol]
      )
    );
  });

  it("DelphorOralce update price", async () => {
    // Solana doesn't allow sending two identical tx's within the same block,
    // so we wait a second.
    await sleep(1000);

    await programCall(delphorAggregatorProgram, "updateCoinPrice", [], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      coinOracle3: delphorOracleMockSOLPDA,
      coinData: delphorAggregatorMockSOLPDA,
      payer,
      systemProgram,
    });

    const pdaData = await delphorAggregatorProgram.account.coinData.fetch(
      delphorAggregatorMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOLMint, adminAccount, mockSOL.symbol, mockSOL.decimals],
        [pdaData.mint, pdaData.authority, pdaData.symbol, pdaData.decimals]
      )
    );
  });

  // TODO: Reject update price from non authority
  // Or add checks to secure the accounts that are passed to the oracle
  it("Reject update coinInfo oracle from non authority", async () => {
    const aRandomKey = anchor.web3.Keypair.generate();

    let pdaData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    let lastUpdateTimestamp = pdaData.lastUpdateTimestamp;

    assert.ok(
      await expectProgramCallRevert(
        delphorOracleProgram,
        "updateCoin",
        [new BN(5368), new BN(5368)],
        {
          coin: delphorOracleMockSOLPDA,
          authority: aRandomKey.publicKey,
        },
        "You are not authorized to perform this action.",
        [aRandomKey]
      )
    );

    pdaData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    assert.ok(
      checkEqualValues(
        [mockSOL.price, adminAccount, mockSOL.symbol, lastUpdateTimestamp],
        [
          pdaData.orcaPrice,
          pdaData.authority,
          pdaData.symbol,
          pdaData.lastUpdateTimestamp,
        ]
      )
    );
  });
});
