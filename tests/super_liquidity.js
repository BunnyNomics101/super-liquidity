const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const {
  programCall,
  checkEqualValues,
  expectProgramCallRevert,
} = require("./utils");
const assert = require("assert");
const chai = require("chai");
chai.use(require("chai-bn")(BN));
const expect = chai.expect;

const {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getTokenAccount,
  getAssociatedTokenAccount,
  createMint,
  mintToAccount,
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
    alicePM,
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

  const BASIS_POINTS = new BN(10000);
  const tolerance = 2000;

  let midUsdc = new BN(1000);
  let midSol = new BN(9000);

  let minUsdc = midUsdc.sub(midUsdc.muln(tolerance).div(BASIS_POINTS).divn(2)),
    minSol = midSol.sub(midSol.muln(tolerance).div(BASIS_POINTS).divn(2)),
    maxSol = midSol.add(midSol.muln(tolerance).div(BASIS_POINTS).divn(2)),
    maxUsdc = midUsdc.add(midUsdc.muln(tolerance).div(BASIS_POINTS).divn(2));

    console.log(Number(minSol))
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

  let mockToken = {
    price: Lamport(9999),
    symbol: "mock",
    decimals: 9,
  };

  const totalGenericTokens = 10;
  const genericMints = new Array(totalGenericTokens);
  const genericOracleTokensPDAs = new Array(totalGenericTokens);
  const genericTokenStores = new Array(totalGenericTokens);

  let pythProductAccount = systemProgram;
  let pythPriceAccount = systemProgram;
  let switchboardOptimizedFeedAccount = systemProgram;

  let transaction = new anchor.web3.Transaction();
  it("Transfer lamports to alice and bob", async function () {
    transaction.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: adminAccount,
        toPubkey: alice.publicKey,
        lamports: anchor.web3.LAMPORTS_PER_SOL * 10,
      })
    );

    transaction.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: adminAccount,
        toPubkey: bob.publicKey,
        lamports: anchor.web3.LAMPORTS_PER_SOL * 10,
      })
    );

    await provider.send(transaction, []);
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

  it("Create generic mints", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      genericMints[i] = await createMint(provider, adminAccount);
    }
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

  it("DelphorOracle create generic coins", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      [genericOracleTokensPDAs[i]] = await PublicKey.findProgramAddress(
        [mockToken.symbol + i],
        delphorOracleProgram.programId
      );

      await programCall(
        delphorOracleProgram,
        "createCoin",
        [
          mockToken.price,
          mockToken.price,
          mockToken.price,
          mockToken.symbol + i,
        ],
        {
          coin: genericOracleTokensPDAs[i],
          authority,
          payer,
          systemProgram,
        }
      );

      const pdaData = await delphorOracleProgram.account.coinInfo.fetch(
        genericOracleTokensPDAs[i]
      );

      assert.ok(
        checkEqualValues(
          [mockToken.price, adminAccount, mockToken.symbol + i],
          [pdaData.orcaPrice, pdaData.authority, pdaData.symbol]
        )
      );
    }
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

  it("DelphorAggregator add generic tokens", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      const mint = genericMints[i];

      await programCall(
        delphorAggregatorProgram,
        "addToken",
        [mockToken.decimals, mockToken.symbol + i],
        {
          globalAccount: aggregatorGlobalAccount,
          mint: mint,
          switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
          pythProductAccount: pythProductAccount,
          authority,
        }
      );

      const globalAccount =
        await delphorAggregatorProgram.account.globalAccount.fetch(
          aggregatorGlobalAccount
        );

      let tokenAggData = globalAccount.tokens[i + 2];
      expect(globalAccount.tokens.length).eq(i + 1 + 2);
      expect(tokenAggData.price).bignumber.eq(new BN(0));
      expect(tokenAggData.symbol).eq(mockToken.symbol + i);
      expect(tokenAggData.lastUpdateTimestamp).bignumber.eq(new BN(0));
      expect(tokenAggData.mint.toBase58()).eq(mint.toBase58());
      expect(tokenAggData.decimals).eq(mockToken.decimals);
      expect(tokenAggData.pythPriceAccount.toBase58()).eq(
        pythProductAccount.toBase58()
      );
      expect(tokenAggData.switchboardOptimizedFeedAccount.toBase58()).eq(
        switchboardOptimizedFeedAccount.toBase58()
      );
    }
  });

  it("DelphorAggregator update mockSOL price", async () => {
    await programCall(delphorAggregatorProgram, "updateTokenPrice", [0], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      delphorOracle: delphorOracleMockSOLPDA,
      globalAccount: aggregatorGlobalAccount,
      authority,
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
    });

    const globalAccount =
      await delphorAggregatorProgram.account.globalAccount.fetch(
        aggregatorGlobalAccount
      );

    assert.ok(globalAccount.tokens[1].price.eq(mockUSDC.price));
  });

  it("DelphorAggregator update generic token prices", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      await programCall(delphorAggregatorProgram, "updateTokenPrice", [i + 2], {
        switchboardOptimizedFeedAccount,
        pythPriceAccount,
        delphorOracle: genericOracleTokensPDAs[i],
        globalAccount: aggregatorGlobalAccount,
        authority,
      });

      const globalAccount =
        await delphorAggregatorProgram.account.globalAccount.fetch(
          aggregatorGlobalAccount
        );

      expect(globalAccount.tokens[i + 2].price).bignumber.eq(mockToken.price);
    }
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

  it("Initialize generic token stores", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      const mint = genericMints[i];

      genericTokenStores[i] = await createAssociatedTokenAccount(
        provider,
        mint,
        tokenStoreAuthority
      );

      expect(genericTokenStores[i].toBase58()).eq(
        (await getAssociatedTokenAccount(mint, tokenStoreAuthority)).toBase58()
      );
    }
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

  it("Add generic tokens to globalState", async () => {
    for (let i = 0; i < totalGenericTokens; i++) {
      const mint = genericMints[i];

      await programCall(superLiquidityProgram, "addToken", [], {
        adminAccount,
        globalState,
        mint,
      });

      let globalStateData =
        await superLiquidityProgram.account.globalState.fetch(globalState);

      expect(globalStateData.tokens.length).eq(i + 1 + 2);
      expect(globalStateData.tokens[i + 2].toBase58()).eq(mint.toBase58());
    }
  });

  it("Initialize alice LP", async () => {
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

  it("Alice update mockSOL LP", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserLiquidityProvider",
      [positionMockSOL, buyFee, sellFee, min, max, true, true, true, new BN(0)],
      {
        userAccount: alice.publicKey,
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

  it("Alice update mockUSDC LP", async () => {
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
        userAccount: alice.publicKey,
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

  it("Alice deposit mockSOL in LP", async () => {
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

  it("Alice deposit mockUSDC in LP", async () => {
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

  it("Bob swap mockSOL for mockUSDC from LP alice", async () => {
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

  it("Alice withdraw mockSOL tokens from LP", async () => {
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

  it("Alice withdraw mockUSDC tokens from LP", async () => {
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

  it("Initialize alice PM", async () => {
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

  it("Alice update mockSOL PM", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockSOL, midSol, true, new BN(0), tolerance],
      {
        globalState,
        userAccount: alice.publicKey,
        userVault: alicePM,
      },
      [alice]
    );

    const alicePMData = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL];

    expect(alicePMData.min).bignumber.eq(minSol);
    expect(alicePMData.mid).bignumber.eq(midSol);
    expect(alicePMData.max).bignumber.eq(maxSol);
    expect(alicePMData.receiveStatus).to.be.true;
    expect(alicePMData.provideStatus).to.be.true;
    expect(alicePMData.limitPriceStatus).to.be.true;
    expect(alicePMData.limitPrice).bignumber.eq(new BN(0));
  });

  it("Alice update mockUSDC PM", async () => {
    await programCall(
      superLiquidityProgram,
      "updateUserPortfolio",
      [positionMockUSDC, midUsdc, true, new BN(0), tolerance],
      {
        globalState,
        userAccount: alice.publicKey,
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
          alicePMData.mid,
          alicePMData.max,
          alicePMData.receiveStatus,
          alicePMData.provideStatus,
          alicePMData.limitPriceStatus,
          alicePMData.limitPrice,
        ],
        [minUsdc, midUsdc, maxUsdc, true, true, true, new BN(0)]
      )
    );
  });

  it("Alice deposit mockSOL in PM", async () => {
    const aliceMockSOLBeforeBalance = (
      await getTokenAccount(provider, alicemockSOL)
    ).amount;
    const delphorMockSOLBeforeBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const alicePMBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].amount;

    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockSOL, positionMockSOL],
      {
        globalState,
        userVault: alicePM,
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
    const alicePMCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].amount;

    assert.ok(
      checkEqualValues(
        [
          alicePMCurrentBalance,
          aliceMockSOLCurrentBalance,
          delphorMockSOLCurrentBalance,
        ],
        [
          alicePMBeforeBalance.add(depositAmountAliceMockSOL),
          aliceMockSOLBeforeBalance.sub(depositAmountAliceMockSOL),
          delphorMockSOLBeforeBalance.add(depositAmountAliceMockSOL),
        ]
      )
    );
  });

  it("Alice deposit mockUSDC in PM", async () => {
    const aliceMockUSDCBeforeBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;
    const delphorMockUSDCBeforeBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const alicePMBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockUSDC].amount;

    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockUSDC, positionMockUSDC],
      {
        globalState,
        userVault: alicePM,
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
    const alicePMCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockUSDC].amount;

    assert.ok(
      checkEqualValues(
        [
          alicePMCurrentBalance,
          aliceMockUSDCCurrentBalance,
          delphorMockUSDCCurrentBalance,
        ],
        [
          alicePMBeforeBalance.add(depositAmountAliceMockUSDC),
          aliceMockUSDCBeforeBalance.sub(depositAmountAliceMockUSDC),
          delphorMockUSDCBeforeBalance.add(depositAmountAliceMockUSDC),
        ]
      )
    );
  });

  it("Bob swap mockSOL for mockUSDC from LP alice", async () => {
    const bobMockSOLBeforeBalance = (
      await getTokenAccount(provider, bobmockSOL)
    ).amount;
    const delphorMockSOLBeforeBalance = (
      await getTokenAccount(provider, mockSOLStore)
    ).amount;
    const delphorMockUSDCBeforeBalance = (
      await getTokenAccount(provider, mockUSDCStore)
    ).amount;
    const alicePMmockSOLBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].amount;
    const bobMockUSDCBeforeBalance = (
      await getTokenAccount(provider, bobmockUSDC)
    ).amount;
    const alicePMmockUSDCBeforeBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
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
        userVault: alicePM,
        tokenStoreAuthority: tokenStoreAuthority,
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
    const alicePMmockSOLCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].amount;
    const bobMockUSDCCurrentBalance = (
      await getTokenAccount(provider, bobmockUSDC)
    ).amount;
    const alicePMmockUSDCCurrentBalance = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockUSDC].amount;

    /*
    const swapBuyFee = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].buyFee;
    const swapSellFee = (
      await superLiquidityProgram.account.userVault.fetch(alicePM)
    ).vaults[positionMockSOL].sellFee;
    */
    finalAmount = new BN(
      (bobSwapAmountSOLForUSDC *
        Math.trunc(
          ((mockSOL.price * (10000 - 10)) /
            10000 /
            ((mockUSDC.price * (10000 + 10)) / 10000)) *
            10 ** 9
        )) /
        10 ** 9
    );

    expect(bobMockSOLCurrentBalance).bignumber.equal(
      bobMockSOLBeforeBalance.sub(bobSwapAmountSOLForUSDC)
    );
    expect(delphorMockSOLCurrentBalance).bignumber.equal(
      delphorMockSOLBeforeBalance.add(bobSwapAmountSOLForUSDC)
    );
    expect(delphorMockUSDCCurrentBalance).bignumber.equal(
      delphorMockUSDCBeforeBalance.sub(finalAmount)
    );
    expect(alicePMmockSOLCurrentBalance).bignumber.equal(
      alicePMmockSOLBeforeBalance.add(bobSwapAmountSOLForUSDC)
    );
    expect(bobMockUSDCCurrentBalance).bignumber.equal(
      bobMockUSDCBeforeBalance.add(finalAmount)
    );
    expect(alicePMmockUSDCCurrentBalance).bignumber.equal(
      alicePMmockUSDCBeforeBalance.sub(finalAmount)
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
