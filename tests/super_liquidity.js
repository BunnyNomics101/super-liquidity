const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;

const {
  createLiquidityProviderUser, selectSwappers
} = require("./utils/swap")

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

function checkData(mockSOL, symbol, price) {
  price = new BN(price);
  assert.ok(symbol == mockSOL.symbol);
  assert.ok(price.eq(mockSOL.price));
}

describe("super-liquidity", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const superLiquidityProgram = anchor.workspace.SuperLiquidity;
  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const delphorOracleAggregatorProgram =
    anchor.workspace.DelphorOracleAggregator;
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
    aliceMockSOLVault,
    bobMockSOLVault,
    aliceMockUSDCVault,
    bobMockUSDCVault,
    globalState,
    aliceMockSOLAccount,
    bobMockSOLAccount,
    programMockSOLAccount,
    aliceMockUSDCAccount,
    bobMockUSDCAccount,
    programMockUSDCAccount,
    delphorMockUSDCPDA,
    delphorMockSOLPDA,
    delphorOracleMockSOLPDA,
    delphorOracleMockUSDCPDA,
    finalAmount;

  function Lamport(value) {
    return new BN(value * 10 ** 9);
  }

  let mintMockSOLAmountToAlice = Lamport(10);
  let mintMockSOLAmountToBob = Lamport(5);
  let mintMockUSDCAmountToAlice = Lamport(1750);
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

  it("DelphorOracle create MockSOL coin", async () => {
    [delphorOracleMockSOLPDA] = await PublicKey.findProgramAddress(
      [mockSOL.symbol],
      delphorOracleProgram.programId
    );

    await programCall(
      delphorOracleProgram,
      "createCoin",
      [mockSOL.price, mockSOL.price, mockSOL.symbol],
      {
        coin: delphorOracleMockSOLPDA,
        authority,
        payer,
        systemProgram,
      }
    );

    const delphorOracleMockSOLData =
      await delphorOracleProgram.account.coinInfo.fetch(
        delphorOracleMockSOLPDA
      );

    checkData(
      mockSOL,
      delphorOracleMockSOLData.symbol,
      delphorOracleMockSOLData.coinGeckoPrice
    );
  });

  it("DelphorOracle create MockUSDC coin", async () => {
    [delphorOracleMockUSDCPDA] = await PublicKey.findProgramAddress(
      [mockUSDC.symbol],
      delphorOracleProgram.programId
    );

    await programCall(
      delphorOracleProgram,
      "createCoin",
      [mockUSDC.price, mockUSDC.price, mockUSDC.symbol],
      {
        coin: delphorOracleMockUSDCPDA,
        authority,
        payer,
        systemProgram,
      }
    );

    const delphorOracleMockUSDCData =
      await delphorOracleProgram.account.coinInfo.fetch(
        delphorOracleMockUSDCPDA
      );

    checkData(
      mockUSDC,
      delphorOracleMockUSDCData.symbol,
      delphorOracleMockUSDCData.coinGeckoPrice
    );
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
  

  it("DelphorOracle init coin", async () => {
    [delphorMockSOLPDA] = await PublicKey.findProgramAddress(
      [mockSOLMint.toBuffer()],
      delphorOracleAggregatorProgram.programId
    );

    await programCall(
      delphorOracleAggregatorProgram,
      "initCoin",
      [mockSOL.decimals, mockSOL.symbol],
      {
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythProductAccount: pythProductAccount,
        coinData: delphorMockSOLPDA,
        mint: mockSOLMint,
        authority,
        payer,
        systemProgram,
      }
    );

    const delphorMockSOLData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(
        delphorMockSOLPDA
      );

    assert.ok(delphorMockSOLData.symbol == mockSOL.symbol);
    assert.ok(delphorMockSOLData.mint.toBase58() == mockSOLMint.toBase58());
    assert.ok(
      delphorMockSOLData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockSOLData.decimals == mockSOL.decimals);
  });

  it("DelphorOracle update price", async () => {
    await programCall(delphorOracleAggregatorProgram, "updateCoinPrice", [], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      delphorOracle: delphorOracleMockSOLPDA,
      coinData: delphorMockSOLPDA,
      payer,
      systemProgram,
    });

    const delphorMockSOLData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(
        delphorMockSOLPDA
      );

    checkData(mockSOL, delphorMockSOLData.symbol, delphorMockSOLData.price);
  });

  it("DelphorOracle init mockUSDC coin", async () => {
    [delphorMockUSDCPDA] = await PublicKey.findProgramAddress(
      [mockUSDCMint.toBuffer()],
      delphorOracleAggregatorProgram.programId
    );

    await programCall(
      delphorOracleAggregatorProgram,
      "initCoin",
      [mockUSDC.decimals, mockUSDC.symbol],
      {
        switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
        pythProductAccount: pythProductAccount,
        coinData: delphorMockUSDCPDA,
        mint: mockUSDCMint,
        authority,
        payer,
        systemProgram,
      }
    );

    const delphorMockUSDCData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(
        delphorMockUSDCPDA
      );

    assert.ok(delphorMockUSDCData.symbol == mockUSDC.symbol);
    assert.ok(delphorMockUSDCData.mint.toBase58() == mockUSDCMint.toBase58());
    assert.ok(
      delphorMockUSDCData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockUSDCData.decimals == mockUSDC.decimals);
  });

  it("DelphorOracle update mockUSDC price", async () => {
    await programCall(delphorOracleAggregatorProgram, "updateCoinPrice", [], {
      switchboardOptimizedFeedAccount,
      pythPriceAccount,
      delphorOracle: delphorOracleMockUSDCPDA,
      coinData: delphorMockUSDCPDA,
      payer,
      systemProgram,
    });

    const delphorMockUSDCData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(
        delphorMockUSDCPDA
      );

    checkData(mockUSDC, delphorMockUSDCData.symbol, delphorMockUSDCData.price);
  });

  it("Initialize global state", async () => {
    [globalState] = await PublicKey.findProgramAddress(
      [adminAccount.toBuffer()],
      superLiquidityProgram.programId
    );

    await programCall(superLiquidityProgram, "initialize", [], {
      adminAccount: adminAccount,
      globalState,
      systemProgram,
    });
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
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        superLiquidityProgram.programId
      );

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

  it("Initialize alice mockSOL vault", async () => {
    [aliceMockSOLVault] =
      await PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockSOLMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await programCall(
      superLiquidityProgram,
      "initUserVault",
      [
        0,
        0,
        new BN(0),
        new BN(0),
        false,
        false,
        false,
        new BN(0),
      ],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockSOLMint,
        userVault: aliceMockSOLVault,
        systemProgram,
      },
      [alice]
    );

    let aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [aliceMockSOLVaultData.user, aliceMockSOLVaultData.mint],
        [alice.publicKey, mockSOLMint]
      )
    );
  });

  it("Initialize alice mockUSDC vault", async () => {
    // Associated account PDA - store user data
    [aliceMockUSDCVault] =
      await PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockUSDCMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await programCall(
      superLiquidityProgram,
      "initUserVault",
      [
        0,
        0,
        new BN(0),
        new BN(0),
        false,
        false,
        false,
        new BN(0),
      ],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockUSDCMint,
        userVault: aliceMockUSDCVault,
        systemProgram,
      },
      [alice]
    );

    let aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    assert.ok(
      checkEqualValues(
        [aliceMockUSDCVaultData.user, aliceMockUSDCVaultData.mint],
        [alice.publicKey, mockUSDCMint]
      )
    );
  });

  it("Initialize bob mockSOL vault", async () => {
    // Associated account PDA - store user data
    [bobMockSOLVault] = await PublicKey.findProgramAddress(
      [bob.publicKey.toBuffer(), mockSOLMint.toBuffer()],
      superLiquidityProgram.programId
    );

    await programCall(
      superLiquidityProgram,
      "initUserVault",
      [
        0,
        0,
        new BN(0),
        new BN(0),
        false,
        false,
        false,
        new BN(0),
      ],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockSOLMint,
        userVault: bobMockSOLVault,
        systemProgram,
      },
      [bob]
    );
  });

  it("Initialize bob mockUSDC vault", async () => {
    // Associated account PDA - store user data
    [bobMockUSDCVault] =
      await PublicKey.findProgramAddress(
        [bob.publicKey.toBuffer(), mockUSDCMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await programCall(
      superLiquidityProgram,
      "initUserVault",
      [
        0,
        0,
        new BN(0),
        new BN(0),
        false,
        false,
        false,
        new BN(0),
      ],
      {
        globalState,
        userAccount: bob.publicKey,
        mint: mockUSDCMint,
        userVault: bobMockUSDCVault,
        systemProgram,
      },
      [bob]
    );
  });

  it("Alice changes mockSOL fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(0);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
      },
      [alice]
    );

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.buyFee,
          aliceMockSOLVaultData.sellFee,
          aliceMockSOLVaultData.min,
          aliceMockSOLVaultData.max,
        ],
        [buyFee, sellFee, min, max]
      )
    );
  });

  it("Alice changes mockUSDC fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockUSDCVault,
        mint: mockUSDCMint,
      },
      [alice]
    );

    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockUSDCVaultData.buyFee,
          aliceMockUSDCVaultData.sellFee,
          aliceMockUSDCVaultData.min,
          aliceMockUSDCVaultData.max,
        ],
        [buyFee, sellFee, min, max]
      )
    );
  });

  it("Bob changes mockSOL fees, min and max", async () => {
    let sellFee = 1;
    let buyFee = 3;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: bob.publicKey,
        userVault: bobMockSOLVault,
        mint: mockSOLMint,
      },
      [bob]
    );

    const bobMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(bobMockSOLVault);

    assert.ok(
      checkEqualValues(
        [
          bobMockSOLVaultData.buyFee,
          bobMockSOLVaultData.sellFee,
          bobMockSOLVaultData.min,
          bobMockSOLVaultData.max,
        ],
        [buyFee, sellFee, min, max]
      )
    );
  });

  it("Bob changes mockUSDC fees, min and max", async () => {
    let sellFee = 1;
    let buyFee = 3;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: bob.publicKey,
        userVault: bobMockUSDCVault,
        mint: mockUSDCMint,
      },
      [bob]
    );

    const bobMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(bobMockUSDCVault);

    assert.ok(
      checkEqualValues(
        [
          bobMockUSDCVaultData.buyFee,
          bobMockUSDCVaultData.sellFee,
          bobMockUSDCVaultData.min,
          bobMockUSDCVaultData.max,
        ],
        [buyFee, sellFee, min, max]
      )
    );
  });

  it("Alice deposit mockSOL", async () => {
    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockSOL],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockSOLMint,
        getTokenFrom: alicemockSOL,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockSOLStore,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.amount,
          programMockSOLAccount.amount,
          aliceMockSOLAccount.amount,
        ],
        [
          depositAmountAliceMockSOL,
          depositAmountAliceMockSOL,
          mintMockSOLAmountToAlice.sub(depositAmountAliceMockSOL),
        ]
      )
    );
  });

  it("Alice deposit mockUSDC", async () => {
    await programCall(
      superLiquidityProgram,
      "deposit",
      [depositAmountAliceMockUSDC],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockUSDCVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockUSDCMint,
        getTokenFrom: alicemockUSDC,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockUSDCStore,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    aliceMockUSDCAccount = await getTokenAccount(provider, alicemockUSDC);
    programMockUSDCAccount = await getTokenAccount(provider, mockUSDCStore);
    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockUSDCVaultData.amount,
          programMockUSDCAccount.amount,
          aliceMockUSDCAccount.amount,
        ],
        [
          depositAmountAliceMockUSDC,
          depositAmountAliceMockUSDC,
          mintMockUSDCAmountToAlice.sub(depositAmountAliceMockUSDC),
        ]
      )
    );
  });

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
          userVaultTo: aliceMockSOLVault,
          tokenStoreAuthority: tokenStoreAuthority,
          mintSend: mockSOLMint,
          mintReceive: mockUSDCMint,
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

  it("Alice changes mockSOL fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        false,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
      },
      [alice]
    );

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.buyFee,
          aliceMockSOLVaultData.sellFee,
          aliceMockSOLVaultData.min,
          aliceMockSOLVaultData.max,
        ],
        [buyFee, sellFee, min, max]
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
          userVaultTo: aliceMockSOLVault,
          tokenStoreAuthority: tokenStoreAuthority,
          mintSend: mockSOLMint,
          mintReceive: mockUSDCMint,
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

  it("Alice changes mockSOL fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);

    await programCall(
      superLiquidityProgram,
      "updateUserVault",
      [
        sellFee,
        buyFee,
        min,
        max,
        true,
        true,
        true,
        new BN(0),
      ],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
      },
      [alice]
    );

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.buyFee,
          aliceMockSOLVaultData.sellFee,
          aliceMockSOLVaultData.min,
          aliceMockSOLVaultData.max,
        ],
        [buyFee, sellFee, min, max]
      )
    );
  });

  it("Bob swap mockSOL for mockUSDC", async () => {
    await programCall(
      superLiquidityProgram,
      "swap",
      [bobSwapAmountSOLForUSDC, bobSwapUSDCMinAmount, tokenStoreAuthorityBump],
      {
        getCoinData: delphorMockSOLPDA,
        sendCoinData: delphorMockUSDCPDA,
        userVaultFrom: aliceMockUSDCVault,
        userVaultTo: aliceMockSOLVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mintSend: mockSOLMint,
        mintReceive: mockUSDCMint,
        getTokenFrom: bobmockSOL,
        getTokenFromAuthority: bob.publicKey,
        sendTokenTo: bobmockUSDC,
        tokenStorePdaFrom: mockUSDCStore,
        tokenStorePdaTo: mockSOLStore,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [bob]
    );

    bobMockSOLAccount = await getTokenAccount(provider, bobmockSOL);
    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );
    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    finalAmount = new BN(
      (bobSwapAmountSOLForUSDC *
        Math.trunc(
          ((mockSOL.price * (10000 - aliceMockSOLVaultData.buyFee)) /
            10000 /
            ((mockUSDC.price * (10000 + aliceMockUSDCVaultData.sellFee)) /
              10000)) *
            10 ** 9
        )) /
        10 ** 9
    );

    bobMockUSDCAccount = await getTokenAccount(provider, bobmockUSDC);

    assert.ok(
      checkEqualValues(
        [
          aliceMockUSDCVaultData.amount,
          bobMockUSDCAccount.amount,
          aliceMockSOLVaultData.amount,
          programMockSOLAccount.amount,
          bobMockSOLAccount.amount,
        ],
        [
          depositAmountAliceMockUSDC.sub(finalAmount),
          finalAmount,
          depositAmountAliceMockSOL.add(bobSwapAmountSOLForUSDC),
          depositAmountAliceMockSOL.add(bobSwapAmountSOLForUSDC),
          mintMockSOLAmountToBob.sub(bobSwapAmountSOLForUSDC),
        ]
      )
    );
  });

  it("Alice withdraw SOL tokens from vault", async () => {
    let aliceSOLVaultAmount = depositAmountAliceMockSOL.add(
      bobSwapAmountSOLForUSDC
    );
    let aliceBeforeSOLBalance = (await getTokenAccount(provider, alicemockSOL))
      .amount;

    await programCall(
      superLiquidityProgram,
      "withdraw",
      [tokenStoreAuthorityBump, aliceSOLVaultAmount],
      {
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
        sendTokenTo: alicemockSOL,
        tokenStoreAuthority: tokenStoreAuthority,
        tokenStorePda: mockSOLStore,
        userAccount: alice.publicKey,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    let delphorMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.amount,
          delphorMockSOLAccount.amount,
          aliceMockSOLAccount.amount,
        ],
        [0, 0, aliceBeforeSOLBalance.add(aliceSOLVaultAmount)]
      )
    );
  });

  it("Alice withdraw USDC tokens from vault", async () => {
    let aliceUSDCVaultAmount = depositAmountAliceMockUSDC.sub(finalAmount);
    let aliceBeforeUSDCBalance = (
      await getTokenAccount(provider, alicemockUSDC)
    ).amount;

    await programCall(
      superLiquidityProgram,
      "withdraw",
      [tokenStoreAuthorityBump, aliceUSDCVaultAmount],
      {
        userVault: aliceMockUSDCVault,
        mint: mockUSDCMint,
        sendTokenTo: alicemockUSDC,
        tokenStoreAuthority: tokenStoreAuthority,
        tokenStorePda: mockUSDCStore,
        userAccount: alice.publicKey,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      [alice]
    );

    aliceMockUSDCAccount = await getTokenAccount(provider, alicemockUSDC);
    let delphorMockUSDCAccount = await getTokenAccount(provider, mockUSDCStore);
    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    assert.ok(
      checkEqualValues(
        [
          aliceMockUSDCVaultData.amount,
          delphorMockUSDCAccount.amount,
          aliceMockUSDCAccount.amount,
        ],
        [0, 0, aliceBeforeUSDCBalance.add(aliceUSDCVaultAmount)]
      )
    );
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  it("Proper liquidity provider selection swapping USDC for SOL", async () => {
    console.log("USDC price: ", mockUSDC.price.toString())
    console.log("SOL price: ", mockSOL.price.toString())

    let userList = []
    let generalParameters = {
      provider,
      adminAccount,
      globalState,
      systemProgram,
      superLiquidityProgram,
      tokenStoreAuthority
    }
    
    let initUserVaultSOLParams = [
      [Lamport(0.1), 30, 10, true, true],
      [Lamport(10), 30, 10, true, false],
      [Lamport(10), 30, 10, false, true],
      [Lamport(10), 20, 10, false, false],
    ]
    let solParams = {
      mint: mockSOLMint,
      store: mockSOLStore,
      initUserParams: initUserVaultSOLParams
    }

    let initUserVaultUSDCParams = [
      [Lamport(0.1), 30, 10, true, true],
      [Lamport(10), 30, 10, true, false],
      [Lamport(10), 30, 10, false, true],
      [Lamport(10), 20, 10, false, false],
    ]
    let usdcParams = {
      mint: mockUSDCMint,
      store: mockUSDCStore,
      initUserParams: initUserVaultUSDCParams
    }

    let params = {
      generalParameters,
      solParams,
      usdcParams
    }

    for(let i = 0; i < initUserVaultSOLParams.length; i++) {
      let user = await createLiquidityProviderUser(
        params,
        i
      )
      await sleep(10)
      userList.push(user)
    }

    let swappers = await selectSwappers(superLiquidityProgram, mockUSDCMint, mockSOLMint, Lamport(10))

    let solVaults = await superLiquidityProgram.account.userCoinVault.all([
      { memcmp: { offset: 41, bytes: mockSOLMint.toBase58() }}, 
    ]);

    

    let allVaults = await superLiquidityProgram.account.userCoinVault.all();
    console.log(
      "There is a total of",
      allVaults.length,
      " vaults, and",
      solVaults.length,
      " of them has SOL as mint."
    )
    // allVaults.map(vault => {
    //   console.log(JSON.stringify(vault))
    // })
    
    // const user2Mint = allVaults[4].account.mint.toBase58();
    // if(user2Mint == mockSOLMint.toBase58()) {
    //   console.log("MockSol");
    // } else if(user2Mint == mockUSDCMint.toBase58()) {
    //   console.log("MockUsdc");
    // }
    
  });

});
