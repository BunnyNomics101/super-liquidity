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

  let mockUSDC = {
    price: new BN(1),
    symbol: "USDC",
    decimals: 9,
  };

  let mockSOLMint,
    mockUSDCMint,
    delphorOracleMockSOLPDA,
    delphorOracleMockUSDCPDA,
    aggregatorGlobalAccount;

  let pythProductAccount = systemProgram;
  let pythPriceAccount = systemProgram;
  let chainlinkFeed = systemProgram;
  let chainlinkProgram = systemProgram;
  let switchboardOptimizedFeedAccount = systemProgram;

  it("Create mockSOL", async () => {
    mockSOLMint = await createMint(provider, adminAccount);
  });

  it("Create mockUSDC", async () => {
    mockUSDCMint = await createMint(provider, adminAccount);
  });

  it("DelphorOracle create mockSOL", async () => {
    [delphorOracleMockSOLPDA] = await PublicKey.findProgramAddress(
      [mockSOL.symbol],
      delphorOracleProgram.programId
    );

    await programCall(
      delphorOracleProgram,
      "createCoin",
      [mockSOL.price, mockSOL.price, mockSOL.price, mockSOL.symbol],
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

  it("DelphorOracle create mockUSDC", async () => {
    [delphorOracleMockUSDCPDA] = await PublicKey.findProgramAddress(
      [mockUSDC.symbol],
      delphorOracleProgram.programId
    );

    await programCall(
      delphorOracleProgram,
      "createCoin",
      [mockUSDC.price, mockUSDC.price, mockUSDC.price, mockUSDC.symbol],
      {
        coin: delphorOracleMockUSDCPDA,
        authority: adminAccount,
        payer,
        systemProgram,
      }
    );

    const pdaData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockUSDCPDA
    );

    assert.ok(
      checkEqualValues(
        [mockUSDC.price, adminAccount, mockUSDC.symbol],
        [pdaData.orcaPrice, pdaData.authority, pdaData.symbol]
      )
    );
  });

  it("DelphorAggregator init global account", async () => {
    let bumpGlobalAccount;
    [aggregatorGlobalAccount, bumpGlobalAccount] =
      await PublicKey.findProgramAddress(
        [adminAccount.toBuffer()],
        delphorAggregatorProgram.programId
      );

    await programCall(
      delphorAggregatorProgram,
      "initGlobalAccount",
      [adminAccount],
      {
        globalAccount: aggregatorGlobalAccount,
        payer,
        systemProgram,
      }
    );

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    assert.ok(
      checkEqualValues(
        [bumpGlobalAccount, adminAccount, []],
        [globalAccount.bump, globalAccount.authority, globalAccount.tokens]
      )
    );
  });

  it("DelphorAggregator add mockSOL", async () => {
    await programCall(
      delphorAggregatorProgram,
      "addToken",
      [mockSOL.decimals, mockSOL.symbol],
      {
        globalAccount: aggregatorGlobalAccount,
        mint: mockSOLMint,
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythProductAccount: pythProductAccount,
        chainlinkFeed,
        chainlinkProgram,
        authority: adminAccount,
      }
    );

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    let mockSOLData = globalAccount.tokens[0];
    assert.ok(
      checkEqualValues(
        [
          1,
          0,
          0,
          mockSOLMint,
          mockSOL.decimals,
          pythProductAccount,
          switchboardOptimizedFeedAccount,
          mockSOL.symbol,
        ],
        [
          globalAccount.tokens.length,
          mockSOLData.price,
          mockSOLData.lastUpdateTimestamp,
          mockSOLData.mint,
          mockSOLData.decimals,
          mockSOLData.pythPriceAccount,
          mockSOLData.switchboardOptimizedFeedAccount,
          mockSOLData.symbol,
        ]
      )
    );
  });

  it("DelphorAggregator add mockUSDC", async () => {
    await programCall(
      delphorAggregatorProgram,
      "addToken",
      [mockUSDC.decimals, mockUSDC.symbol],
      {
        globalAccount: aggregatorGlobalAccount,
        mint: mockUSDCMint,
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythProductAccount: pythProductAccount,
        chainlinkFeed,
        chainlinkProgram,
        authority: adminAccount,
      }
    );

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    let mockUSDCData = globalAccount.tokens[1];
    assert.ok(
      checkEqualValues(
        [
          2,
          0,
          0,
          mockUSDCMint,
          mockUSDC.decimals,
          pythProductAccount,
          switchboardOptimizedFeedAccount,
          mockUSDC.symbol,
        ],
        [
          globalAccount.tokens.length,
          mockUSDCData.price,
          mockUSDCData.lastUpdateTimestamp,
          mockUSDCData.mint,
          mockUSDCData.decimals,
          mockUSDCData.pythPriceAccount,
          mockUSDCData.switchboardOptimizedFeedAccount,
          mockUSDCData.symbol,
        ]
      )
    );
  });

  it("DelphorAggregator update mockSOL price", async () => {
    await programCall(delphorAggregatorProgram, "updateTokenPrice", [0], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      chainlinkFeed,
      chainlinkProgram,
      delphorOracle: delphorOracleMockSOLPDA,
      globalAccount: aggregatorGlobalAccount,
      authority: adminAccount,
    });

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    assert.ok(globalAccount.tokens[0].price.eq(mockSOL.price));
  });

  it("DelphorAggregator update mockUSDC price", async () => {
    await programCall(delphorAggregatorProgram, "updateTokenPrice", [1], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      chainlinkFeed,
      chainlinkProgram,
      delphorOracle: delphorOracleMockUSDCPDA,
      globalAccount: aggregatorGlobalAccount,
      authority: adminAccount,
    });

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    assert.ok(globalAccount.tokens[1].price.eq(mockUSDC.price));
  });

  /*
  it("DelphorOracleAggregator reject update price with wrong oracles accounts", async () => {
    const randomKey = anchor.web3.Keypair.generate();

    assert.ok(
      await expectProgramCallRevert(
        delphorAggregatorProgram,
        "updateCoinPrice",
        [],
        {
          switchboardOptimizedFeedAccount: randomKey.publicKey,
          pythPriceAccount,
          delphorOracle: delphorOracleMockSOLPDA,
          coinData: delphorAggregatorMockSOLPDA,
          payer,
          systemProgram,
        },
        "A raw constraint was violated"
      )
    );

    assert.ok(
      await expectProgramCallRevert(
        delphorAggregatorProgram,
        "updateCoinPrice",
        [],
        {
          switchboardOptimizedFeedAccount,
          pythPriceAccount: randomKey.publicKey,
          delphorOracle: delphorOracleMockSOLPDA,
          coinData: delphorAggregatorMockSOLPDA,
          payer,
          systemProgram,
        },
        "A raw constraint was violated"
      )
    );
  });
  */
});
