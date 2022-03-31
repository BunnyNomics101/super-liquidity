const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const {
  programCall,
  checkEqualValues,
  expectProgramCallRevert,
} = require("./utils");
const assert = require("assert");

const {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getTokenAccount,
  getAssociatedTokenAccount,
  createMint,
  mintToAccount,
  getBalance,
  airdropLamports,
} = require("./utils");

describe("super-liquidity", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const superLiquidityProgram = anchor.workspace.SuperLiquidity;
  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const delphorAggregatorProgram = anchor.workspace.DelphorOracleAggregator;
  const adminAccount = provider.wallet.publicKey;
  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();
  const payer = provider.wallet.publicKey;
  const authority = adminAccount;
  const systemProgram = anchor.web3.SystemProgram.programId;

  let mockSOLMint,
    alicemockSOL,
    bobmockSOL,
    mockSOLStore,
    mockUSDCMint,
    alicemockUSDC,
    bobmockUSDC,
    mockUSDCStore,
    tokenStoreAuthorityBump,
    tokenStoreAuthority,
    aliceLP,
    bobLP,
    alicePM,
    bobPM,
    globalState,
    aliceMockSOLAccount,
    bobMockSOLAccount,
    aliceMockUSDCAccount,
    bobMockUSDCAccount,
    delphorOracleMockSOLPDA,
    delphorOracleMockUSDCPDA,
    aggregatorGlobalAccount,
    finalAmount;

  let sellFee = 100,
    buyFee = 300,
    min = new anchor.BN(1 * 10 ** 9),
    max = new anchor.BN(10 * 10 ** 9),
    positionMockSOL = 0,
    positionMockUSDC = 1;

  function Lamport(value) {
    return new BN(value * 10 ** 9);
  }

  let mintMockSOLAmountToAlice = Lamport(100);
  let mintMockSOLAmountToBob = Lamport(50);
  let mintMockUSDCAmountToAlice = Lamport(17500);
  let depositAmountAliceMockSOL = Lamport(8);
  let depositAmountAliceMockUSDC = Lamport(500);
  let bobSwapAmountSOLForUSDC = Lamport(2);
  let bobSwapUSDCMinAmount = Lamport(250);

  let mockSOL = {
    price: Lamport(150),
    symbol: "mSOL",
    decimals: 9,
  };

  let mockUSDC = {
    price: Lamport(1),
    symbol: "usdc",
    decimals: 9,
  };

  let pythProductAccount = systemProgram;
  let pythPriceAccount = systemProgram;
  let switchboardOptimizedFeedAccount = systemProgram;

  it("Airdrop lamports to alice", async function () {
    let balance = await getBalance(alice.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(alice.publicKey);
    balance = await getBalance(alice.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL * 10);
  });

  it("Airdrop lamports to bob", async function () {
    let balance = await getBalance(bob.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(bob.publicKey);
    balance = await getBalance(bob.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL * 10);
  });

  it("Create MockSOL and mint test tokens", async () => {
    mockSOLMint = await createMint(provider, adminAccount);

    alicemockSOL = await createAssociatedTokenAccount(
      provider,
      mockSOLMint,
      alice.publicKey
    );

    assert.ok(
      alicemockSOL.toBase58() ==
        (
          await getAssociatedTokenAccount(mockSOLMint, alice.publicKey)
        ).toBase58()
    );

    await mintToAccount(
      provider,
      mockSOLMint,
      alicemockSOL,
      mintMockSOLAmountToAlice,
      adminAccount
    );

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    assert.ok(aliceMockSOLAccount.amount.eq(mintMockSOLAmountToAlice));

    bobmockSOL = await createAssociatedTokenAccount(
      provider,
      mockSOLMint,
      bob.publicKey
    );

    assert.ok(
      bobmockSOL.toBase58() ==
        (await getAssociatedTokenAccount(mockSOLMint, bob.publicKey)).toBase58()
    );

    await mintToAccount(
      provider,
      mockSOLMint,
      bobmockSOL,
      mintMockSOLAmountToBob,
      adminAccount
    );

    bobMockSOLAccount = await getTokenAccount(provider, bobmockSOL);
    assert.ok(bobMockSOLAccount.amount.eq(mintMockSOLAmountToBob));
  });

  it("Create MockUSDC and mint test tokens", async () => {
    mockUSDCMint = await createMint(provider, adminAccount);

    alicemockUSDC = await createAssociatedTokenAccount(
      provider,
      mockUSDCMint,
      alice.publicKey
    );

    assert.ok(
      alicemockUSDC.toBase58() ==
        (
          await getAssociatedTokenAccount(mockUSDCMint, alice.publicKey)
        ).toBase58()
    );

    await mintToAccount(
      provider,
      mockUSDCMint,
      alicemockUSDC,
      mintMockUSDCAmountToAlice,
      adminAccount
    );

    aliceMockUSDCAccount = await getTokenAccount(provider, alicemockUSDC);
    assert.ok(aliceMockUSDCAccount.amount.eq(mintMockUSDCAmountToAlice));

    bobmockUSDC = await createAssociatedTokenAccount(
      provider,
      mockUSDCMint,
      bob.publicKey
    );

    assert.ok(
      bobmockUSDC.toBase58() ==
        (
          await getAssociatedTokenAccount(mockUSDCMint, bob.publicKey)
        ).toBase58()
    );

    bobMockUSDCAccount = await getTokenAccount(provider, bobmockUSDC);
    assert.ok(bobMockUSDCAccount.amount == 0);
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
        authority,
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
        authority,
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
        authority,
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
        authority,
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
      delphorOracle: delphorOracleMockSOLPDA,
      globalAccount: aggregatorGlobalAccount,
      authority,
      mint: mockSOLMint,
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
      delphorOracle: delphorOracleMockUSDCPDA,
      globalAccount: aggregatorGlobalAccount,
      authority,
      mint: mockUSDCMint,
    });

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    assert.ok(globalAccount.tokens[1].price.eq(mockUSDC.price));
  });

  it("Initialize global state", async () => {
    let globalStateBump;
    [globalState, globalStateBump] = await PublicKey.findProgramAddress(
      [adminAccount.toBuffer()],
      superLiquidityProgram.programId
    );

    await programCall(superLiquidityProgram, "initializeGlobalState", [], {
      adminAccount: adminAccount,
      globalState,
      systemProgram,
    });

    let globalStateData = await superLiquidityProgram.account.globalState.fetch(
      globalState
    );

    assert.ok(
      checkEqualValues(
        [adminAccount, globalStateBump, 0],
        [
          globalStateData.adminAccount,
          globalStateData.bump,
          globalStateData.tokens.length,
        ]
      )
    );
  });

  it("Initialize MockSOL token store", async () => {
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        superLiquidityProgram.programId
      );

    mockSOLStore = await createAssociatedTokenAccount(
      provider,
      mockSOLMint,
      tokenStoreAuthority
    );

    assert.ok(
      mockSOLStore.toBase58() ==
        (
          await getAssociatedTokenAccount(mockSOLMint, tokenStoreAuthority)
        ).toBase58()
    );
  });

  it("Initialize MockUSDC token store", async () => {
    mockUSDCStore = await createAssociatedTokenAccount(
      provider,
      mockUSDCMint,
      tokenStoreAuthority
    );

    assert.ok(
      mockUSDCStore.toBase58() ==
        (
          await getAssociatedTokenAccount(mockUSDCMint, tokenStoreAuthority)
        ).toBase58()
    );
  });

  it("Add mockSOL to globalState", async () => {
    await programCall(superLiquidityProgram, "addToken", [], {
      adminAccount,
      globalState,
      mint: mockSOLMint,
    });

    let globalStateData = await superLiquidityProgram.account.globalState.fetch(
      globalState
    );

    assert.ok(
      checkEqualValues(
        [1, mockSOLMint],
        [globalStateData.tokens.length, globalStateData.tokens[0]]
      )
    );
  });

  it("Add mockUSDC to globalState", async () => {
    await programCall(superLiquidityProgram, "addToken", [], {
      adminAccount,
      globalState,
      mint: mockUSDCMint,
    });

    let globalStateData = await superLiquidityProgram.account.globalState.fetch(
      globalState
    );

    assert.ok(
      checkEqualValues(
        [2, mockUSDCMint],
        [globalStateData.tokens.length, globalStateData.tokens[1]]
      )
    );
  });

  it("Initialize alice liquidity provider vault", async () => {
    let bump;
    [aliceLP, bump] = await PublicKey.findProgramAddress(
      [alice.publicKey.toBuffer(), Buffer.from("liquidity_provider")],
      superLiquidityProgram.programId
    );

    await programCall(
      superLiquidityProgram,
      "initUserLiquidityProvider",
      [],
      {
        userAccount: alice.publicKey,
        userVault: aliceLP,
        systemProgram,
      },
      [alice]
    );

    let aliceLPData = await superLiquidityProgram.account.userVault.fetch(
      aliceLP
    );

    aliceLPData.vaults.forEach((vault) => {
      Object.values(vault).forEach((propertie) => {
        assert.ok(Number(propertie) == 0);
      });
    });

    assert.ok(
      checkEqualValues(
        [bump, alice.publicKey, "liquidityProvider", 50],
        [
          aliceLPData.bump,
          aliceLPData.user,
          Object.getOwnPropertyNames(aliceLPData.vaultType),
          aliceLPData.vaults.length,
        ]
      )
    );
  });

  it("Initialize bob liquidity provider vault", async () => {
    let bump;
    [bobLP, bump] = await PublicKey.findProgramAddress(
      [bob.publicKey.toBuffer(), Buffer.from("liquidity_provider")],
      superLiquidityProgram.programId
    );

    await programCall(
      superLiquidityProgram,
      "initUserLiquidityProvider",
      [],
      {
        userAccount: bob.publicKey,
        userVault: bobLP,
        systemProgram,
      },
      [bob]
    );

    let bobLPData = await superLiquidityProgram.account.userVault.fetch(bobLP);

    bobLPData.vaults.forEach((vault) => {
      Object.values(vault).forEach((propertie) => {
        assert.ok(Number(propertie) == 0);
      });
    });

    assert.ok(
      checkEqualValues(
        [bump, bob.publicKey, "liquidityProvider", 50],
        [
          bobLPData.bump,
          bobLPData.user,
          Object.getOwnPropertyNames(bobLPData.vaultType),
          bobLPData.vaults.length,
        ]
      )
    );
  });

  it("Alice update mockSOL liquidity provider vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserLiquidityProvider",
      [positionMockSOL, buyFee, sellFee, min, max, true, true, true, new BN(0)],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockSOLMint,
        userVault: aliceLP,
      },
      [alice]
    );

    const aliceLPData = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL];

    assert.ok(
      checkEqualValues(
        [
          aliceLPData.buyFee,
          aliceLPData.sellFee,
          aliceLPData.min,
          aliceLPData.max,
          aliceLPData.receiveStatus,
          aliceLPData.provideStatus,
          aliceLPData.limitPriceStatus,
          aliceLPData.limitPrice,
        ],
        [buyFee, sellFee, min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Alice update mockUSDC liquidity provider vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserLiquidityProvider",
      [
        positionMockUSDC,
        buyFee,
        sellFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockUSDCMint,
        userVault: aliceLP,
      },
      [alice]
    );

    const aliceLPData = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC];

    assert.ok(
      checkEqualValues(
        [
          aliceLPData.buyFee,
          aliceLPData.sellFee,
          aliceLPData.min,
          aliceLPData.max,
          aliceLPData.receiveStatus,
          aliceLPData.provideStatus,
          aliceLPData.limitPriceStatus,
          aliceLPData.limitPrice,
        ],
        [buyFee, sellFee, min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Bob update mockSOL liquidity provider vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserLiquidityProvider",
      [positionMockSOL, buyFee, sellFee, min, max, true, true, true, new BN(0)],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockSOLMint,
        userVault: bobLP,
      },
      [bob]
    );

    const bobLPData = (
      await superLiquidityProgram.account.userVault.fetch(bobLP)
    ).vaults[positionMockSOL];

    assert.ok(
      checkEqualValues(
        [
          bobLPData.buyFee,
          bobLPData.sellFee,
          bobLPData.min,
          bobLPData.max,
          bobLPData.receiveStatus,
          bobLPData.provideStatus,
          bobLPData.limitPriceStatus,
          bobLPData.limitPrice,
        ],
        [buyFee, sellFee, min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Bob update mockUSDC liquidity provider vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserLiquidityProvider",
      [
        positionMockUSDC,
        buyFee,
        sellFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockUSDCMint,
        userVault: bobLP,
      },
      [bob]
    );

    const bobLPData = (
      await superLiquidityProgram.account.userVault.fetch(bobLP)
    ).vaults[positionMockUSDC];

    assert.ok(
      checkEqualValues(
        [
          bobLPData.buyFee,
          bobLPData.sellFee,
          bobLPData.min,
          bobLPData.max,
          bobLPData.receiveStatus,
          bobLPData.provideStatus,
          bobLPData.limitPriceStatus,
          bobLPData.limitPrice,
        ],
        [buyFee, sellFee, min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Initialize alice portfolio manager vault", async () => {
    let bump;
    [alicePM, bump] = await PublicKey.findProgramAddress(
      [alice.publicKey.toBuffer(), Buffer.from("portfolio_manager")],
      superLiquidityProgram.programId
    );

    await programCall(
      superLiquidityProgram,
      "initUserPortfolio",
      [],
      {
        userAccount: alice.publicKey,
        userVault: alicePM,
        systemProgram,
      },
      [alice]
    );

    let alicePMData = await superLiquidityProgram.account.userVault.fetch(
      alicePM
    );

    assert.ok(
      checkEqualValues(
        [bump, alice.publicKey, "portfolioManager", 50, true, 1000],
        [
          alicePMData.bump,
          alicePMData.user,
          Object.getOwnPropertyNames(alicePMData.vaultType),
          alicePMData.vaults.length,
          alicePMData.vaultType.portfolioManager.autoFee,
          alicePMData.vaultType.portfolioManager.tolerance,
        ]
      )
    );
  });

  it("Initialize bob portfolio manager vault", async () => {
    let bump;
    [bobPM, bump] = await PublicKey.findProgramAddress(
      [bob.publicKey.toBuffer(), Buffer.from("portfolio_manager")],
      superLiquidityProgram.programId
    );

    await programCall(
      superLiquidityProgram,
      "initUserPortfolio",
      [],
      {
        userAccount: bob.publicKey,
        userVault: bobPM,
        systemProgram,
      },
      [bob]
    );

    let bobPMData = await superLiquidityProgram.account.userVault.fetch(bobPM);

    assert.ok(
      checkEqualValues(
        [bump, bob.publicKey, "portfolioManager", 50, true, 1000],
        [
          bobPMData.bump,
          bobPMData.user,
          Object.getOwnPropertyNames(bobPMData.vaultType),
          bobPMData.vaults.length,
          bobPMData.vaultType.portfolioManager.autoFee,
          bobPMData.vaultType.portfolioManager.tolerance,
        ]
      )
    );
  });

  it("Alice update mockSOL portfolio manager vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockSOL, min, max, true, new BN(0)],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockSOLMint,
        userVault: alicePM,
      },
      [alice]
    );

    const alicePMData = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL];

    assert.ok(
      checkEqualValues(
        [
          alicePMData.min,
          alicePMData.max,
          alicePMData.receiveStatus,
          alicePMData.provideStatus,
          alicePMData.limitPriceStatus,
          alicePMData.limitPrice,
        ],
        [min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Alice update mockUSDC portfolio manager vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockUSDC, min, max, true, new BN(0)],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockUSDCMint,
        userVault: alicePM,
      },
      [alice]
    );

    const alicePMData = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockUSDC];

    assert.ok(
      checkEqualValues(
        [
          alicePMData.min,
          alicePMData.max,
          alicePMData.receiveStatus,
          alicePMData.provideStatus,
          alicePMData.limitPriceStatus,
          alicePMData.limitPrice,
        ],
        [min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Bob update mockSOL portfolio manager vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockSOL, min, max, true, new BN(0)],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockSOLMint,
        userVault: bobPM,
      },
      [bob]
    );

    const bobPMData = (
      await superLiquidityProgram.account.userVault.fetch(bobPM)
    ).vaults[positionMockSOL];

    assert.ok(
      checkEqualValues(
        [
          bobPMData.min,
          bobPMData.max,
          bobPMData.receiveStatus,
          bobPMData.provideStatus,
          bobPMData.limitPriceStatus,
          bobPMData.limitPrice,
        ],
        [min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Bob update mockUSDC portfolio manager vault", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockUSDC, min, max, true, new BN(0)],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockUSDCMint,
        userVault: bobPM,
      },
      [bob]
    );

    const bobPMData = (
      await superLiquidityProgram.account.userVault.fetch(bobPM)
    ).vaults[positionMockUSDC];

    assert.ok(
      checkEqualValues(
        [
          bobPMData.min,
          bobPMData.max,
          bobPMData.receiveStatus,
          bobPMData.provideStatus,
          bobPMData.limitPriceStatus,
          bobPMData.limitPrice,
        ],
        [min, max, true, true, true, new BN(0)]
      )
    );
  });

  it("Alice deposit mockSOL in liquidity provider", async () => {
    const aliceMockSOLBeforeBalance = (
      await getTokenAccount(provider, alicemockSOL)
    ).amount;
    const delphorMockSOLBeforeBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const aliceLPBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;

    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockSOL, positionMockSOL],
      {
        globalState,
        userVault: aliceLP,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockSOLMint,
        getTokenFrom: alicemockSOL,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockSOLStore,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    const aliceMockSOLCurrentBalance = (
      await getTokenAccount(provider, alicemockSOL)
    ).amount;
    const delphorMockSOLCurrentBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const aliceLPCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;

    assert.ok(
      checkEqualValues(
        [
          aliceLPCurrentBalance,
          aliceMockSOLCurrentBalance,
          delphorMockSOLCurrentBalance,
        ],
        [
          aliceLPBeforeBalance.add(depositAmountAliceMockSOL),
          aliceMockSOLBeforeBalance.sub(depositAmountAliceMockSOL),
          delphorMockSOLBeforeBalance.add(depositAmountAliceMockSOL),
        ]
      )
    );
  });

  it("Alice deposit mockUSDC in liquidity provider", async () => {
    const aliceMockUSDCBeforeBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;
    const delphorMockUSDCBeforeBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockUSDC, positionMockUSDC],
      {
        globalState,
        userVault: aliceLP,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockUSDCMint,
        getTokenFrom: alicemockUSDC,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockUSDCStore,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    const aliceMockUSDCCurrentBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;
    const delphorMockUSDCCurrentBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    assert.ok(
      checkEqualValues(
        [
          aliceLPCurrentBalance,
          aliceMockUSDCCurrentBalance,
          delphorMockUSDCCurrentBalance,
        ],
        [
          aliceLPBeforeBalance.add(depositAmountAliceMockUSDC),
          aliceMockUSDCBeforeBalance.sub(depositAmountAliceMockUSDC),
          delphorMockUSDCBeforeBalance.add(depositAmountAliceMockUSDC),
        ]
      )
    );
  });

  it("Bob swap mockSOL for mockUSDC from LP alice vault", async () => {
    const bobMockSOLBeforeBalance = (
      await getTokenAccount(provider, bobmockSOL)
    ).amount;
    const delphorMockSOLBeforeBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const delphorMockUSDCBeforeBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPmockSOLBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;
    const bobMockUSDCBeforeBalance = (
      await getTokenAccount(provider, bobmockUSDC)
    ).amount;
    const aliceLPmockUSDCBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    await programCall(
      superLiquidityProgram,
      "swap",
      [
        bobSwapAmountSOLForUSDC,
        bobSwapUSDCMinAmount,
        tokenStoreAuthorityBump,
        positionMockSOL,
        positionMockUSDC,
      ],
      {
        globalState,
        delphorAggregatorPrices: aggregatorGlobalAccount,
        userVault: aliceLP,
        tokenStoreAuthority: tokenStoreAuthority,
        mintSell: mockSOLMint,
        mintBuy: mockUSDCMint,
        getTokenFrom: bobmockSOL,
        getTokenFromAuthority: bob.publicKey,
        sendTokenTo: bobmockUSDC,
        tokenStorePdaFrom: mockUSDCStore,
        tokenStorePdaTo: mockSOLStore,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [bob]
    );

    const bobMockSOLCurrentBalance = (
      await getTokenAccount(provider, bobmockSOL)
    ).amount;
    const delphorMockSOLCurrentBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const delphorMockUSDCCurrentBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPmockSOLCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;
    const bobMockUSDCCurrentBalance = (
      await getTokenAccount(provider, bobmockUSDC)
    ).amount;
    const aliceLPmockUSDCCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    const swapBuyFee = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].buyFee;
    const swapSellFee = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].sellFee;
    finalAmount = new BN(
      (bobSwapAmountSOLForUSDC *
        Math.trunc(
          ((mockSOL.price * (10000 - swapBuyFee)) /
            10000 /
            ((mockUSDC.price * (10000 + swapSellFee)) / 10000)) *
            10 ** 9
        )) /
        10 ** 9
    );

    assert.ok(
      checkEqualValues(
        [
          bobMockSOLCurrentBalance,
          delphorMockSOLCurrentBalance,
          delphorMockUSDCCurrentBalance,
          aliceLPmockSOLCurrentBalance,
          bobMockUSDCCurrentBalance,
          aliceLPmockUSDCCurrentBalance,
        ],
        [
          bobMockSOLBeforeBalance.sub(bobSwapAmountSOLForUSDC),
          delphorMockSOLBeforeBalance.add(bobSwapAmountSOLForUSDC),
          delphorMockUSDCBeforeBalance.sub(finalAmount),
          aliceLPmockSOLBeforeBalance.add(bobSwapAmountSOLForUSDC),
          bobMockUSDCBeforeBalance.add(finalAmount),
          aliceLPmockUSDCBeforeBalance.sub(finalAmount),
        ]
      )
    );
  });

  it("Alice withdraw mockSOL tokens from LP vault", async () => {
    const aliceMockSOLBeforeBalance = (
      await getTokenAccount(provider, alicemockSOL)
    ).amount;
    const delphorMockSOLBeforeBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const aliceLPBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;

    await programCall(
      superLiquidityProgram,
      "withdraw",
      [tokenStoreAuthorityBump, aliceLPBeforeBalance, positionMockSOL],
      {
        globalState,
        userAccount: alice.publicKey,
        userVault: aliceLP,
        sendTokenTo: alicemockSOL,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockSOLMint,
        tokenStorePda: mockSOLStore,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    const aliceMockSOLCurrentBalance = (
      await getTokenAccount(provider, alicemockSOL)
    ).amount;
    const delphorMockSOLCurrentBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const aliceLPCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockSOL].amount;

    assert.ok(
      checkEqualValues(
        [
          aliceLPCurrentBalance,
          aliceMockSOLCurrentBalance,
          delphorMockSOLCurrentBalance,
        ],
        [
          new BN(0),
          aliceMockSOLBeforeBalance.add(aliceLPBeforeBalance),
          delphorMockSOLBeforeBalance.sub(aliceLPBeforeBalance),
        ]
      )
    );
  });

  it("Alice withdraw mockUSDC tokens from vault", async () => {
    const aliceMockUSDCBeforeBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;
    const delphorMockUSDCBeforeBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    await programCall(
      superLiquidityProgram,
      "withdraw",
      [tokenStoreAuthorityBump, aliceLPBeforeBalance, positionMockUSDC],
      {
        globalState,
        userAccount: alice.publicKey,
        userVault: aliceLP,
        sendTokenTo: alicemockUSDC,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockUSDCMint,
        tokenStorePda: mockUSDCStore,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    const aliceMockUSDCCurrentBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;
    const delphorMockUSDCCurrentBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const aliceLPCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(aliceLP)
    ).vaults[positionMockUSDC].amount;

    assert.ok(
      checkEqualValues(
        [
          aliceLPCurrentBalance,
          aliceMockUSDCCurrentBalance,
          delphorMockUSDCCurrentBalance,
        ],
        [
          new BN(0),
          aliceMockUSDCBeforeBalance.add(aliceLPBeforeBalance),
          delphorMockUSDCBeforeBalance.sub(aliceLPBeforeBalance),
        ]
      )
    );
  });

  /*
  it("Reject swap with error exceeds max balance", async () => {
    assert.ok(
      await expectProgramCallRevert(
        superLiquidityProgram,
        "swap",
        [
          bobSwapAmountSOLForUSDC,
          bobSwapUSDCMinAmount,
          tokenStoreAuthorityBump,
        ],
        {
          getCoinData: delphorMockSOLPDA,
          sendCoinData: delphorMockUSDCPDA,
          userVaultFrom: aliceMockUSDCVault,
          userVaultTo: aliceLP,
          tokenStoreAuthority: tokenStoreAuthority,
          mintSell: mockSOLMint,
          mintBuy: mockUSDCMint,
          getTokenFrom: bobmockSOL,
          getTokenFromAuthority: bob.publicKey,
          sendTokenTo: bobmockUSDC,
          tokenStorePdaFrom: mockUSDCStore,
          tokenStorePdaTo: mockSOLStore,
          systemProgram,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        "Operation exceeds max balance to user_vault_to",
        [bob]
      )
    );
  });

  it("Reject swap with error vault to paused", async () => {
    assert.ok(
      await expectProgramCallRevert(
        superLiquidityProgram,
        "swap",
        [
          bobSwapAmountSOLForUSDC,
          bobSwapUSDCMinAmount,
          tokenStoreAuthorityBump,
        ],
        {
          getCoinData: delphorMockSOLPDA,
          sendCoinData: delphorMockUSDCPDA,
          userVaultFrom: aliceMockUSDCVault,
          userVaultTo: aliceLP,
          tokenStoreAuthority: tokenStoreAuthority,
          mintSell: mockSOLMint,
          mintBuy: mockUSDCMint,
          getTokenFrom: bobmockSOL,
          getTokenFromAuthority: bob.publicKey,
          sendTokenTo: bobmockUSDC,
          tokenStorePdaFrom: mockUSDCStore,
          tokenStorePdaTo: mockSOLStore,
          systemProgram,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        "Vault to paused.",
        [bob]
      )
    );
  });
  */
});
