const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
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

describe("swap", () => {
  const provider = anchor.Provider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const superLiquidityProgram = anchor.workspace.SuperLiquidity;
  const delphorOracleProgram = anchor.workspace.DelphorOracle;
  const delphorOracleAggregatorProgram = anchor.workspace.DelphorOracleAggregator;
  const adminAccount = provider.wallet.publicKey;
  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();

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
    aliceMockSOLVaultBump,
    bobMockSOLVault,
    bobMockSOLVaultBump,
    aliceMockUSDCVault,
    aliceMockUSDCVaultBump,
    bobMockUSDCVault,
    bobMockUSDCVaultBump,
    globalState,
    globalStateBump,
    aliceMockSOLAccount,
    bobMockSOLAccount,
    programMockSOLAccount,
    aliceMockUSDCAccount,
    bobMockUSDCAccount,
    programMockUSDCAccount,
    delphorMockUSDCPDA,
    delphorMockSOLPDA,
    delphorOracleMockSOLPDAbump,
    delphorOracleMockSOLPDA,
    delphorOracleMockUSDCPDA,
    delphorOracleMockUSDCPDAbump;

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

  let pythProductAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  let pythPriceAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  let switchboardOptimizedFeedAccount = new anchor.web3.PublicKey(
    "11111111111111111111111111111111"
  );

  /*
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
  */

  it("Airdrop lamports to alice", async function () {
    let balance = await getBalance(alice.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(alice.publicKey);
    balance = await getBalance(alice.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL);
  });

  it("Airdrop lamports to bob", async function () {
    let balance = await getBalance(bob.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(bob.publicKey);
    balance = await getBalance(bob.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL);
  });

  it("DelphorOracle create MockSOL coin", async () => {
    [delphorOracleMockSOLPDA, delphorOracleMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOL.symbol],
        delphorOracleProgram.programId
      );

    await delphorOracleProgram.rpc.createCoin(
      mockSOL.price,
      mockSOL.price,
      delphorOracleMockSOLPDAbump,
      mockSOL.symbol,
      {
        accounts: {
          coin: delphorOracleMockSOLPDA,
          authority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const delphorOracleMockSOLData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockSOLPDA
    );

    checkData(
      mockSOL,
      delphorOracleMockSOLData.symbol,
      delphorOracleMockSOLData.coinGeckoPrice
    );
  });

  it("DelphorOracle create MockUSDC coin", async () => {
    [delphorOracleMockUSDCPDA, delphorOracleMockUSDCPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockUSDC.symbol],
        delphorOracleProgram.programId
      );

    await delphorOracleProgram.rpc.createCoin(
      mockUSDC.price,
      mockUSDC.price,
      delphorOracleMockUSDCPDAbump,
      mockUSDC.symbol,
      {
        accounts: {
          coin: delphorOracleMockUSDCPDA,
          authority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const delphorOracleMockUSDCData = await delphorOracleProgram.account.coinInfo.fetch(
      delphorOracleMockUSDCPDA
    );

    checkData(
      mockUSDC,
      delphorOracleMockUSDCData.symbol,
      delphorOracleMockUSDCData.coinGeckoPrice
    );
  });

  it("Create MockSOL and mint test tokens", async () => {
    // Create MockSOL Mint
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

    // Create user and program token accounts
    await mintToAccount(
      provider,
      mockSOLMint,
      alicemockSOL,
      mintMockSOLAmountToAlice,
      adminAccount
    );

    let aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
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

    // Create user and program token accounts
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
    // Create MockUSDC Mint
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

    // Create user and program token accounts
    await mintToAccount(
      provider,
      mockUSDCMint,
      alicemockUSDC,
      mintMockUSDCAmountToAlice,
      adminAccount
    );

    let aliceMockUSDCAccount = await getTokenAccount(provider, alicemockUSDC);
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
    [delphorMockSOLPDA, delphorMockSOLPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockSOLMint.toBuffer()],
        delphorOracleAggregatorProgram.programId
      );

    await delphorOracleAggregatorProgram.rpc.initCoin(
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
      await delphorOracleAggregatorProgram.account.coinData.fetch(delphorMockSOLPDA);

    assert.ok(delphorMockSOLData.symbol == mockSOL.symbol);
    assert.ok(delphorMockSOLData.mint.toBase58() == mockSOLMint.toBase58());
    assert.ok(
      delphorMockSOLData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockSOLData.decimals == mockSOL.decimals);
  });

  it("DelphorOracle update price", async () => {
    await delphorOracleAggregatorProgram.rpc.updateCoinPrice({
      accounts: {
        switchboardOptimizedFeedAccount,
        pythPriceAccount,
        coinOracle3: delphorOracleMockSOLPDA,
        coinData: delphorMockSOLPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockSOLData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(delphorMockSOLPDA);

    checkData(mockSOL, delphorMockSOLData.symbol, delphorMockSOLData.price);
  });

  it("DelphorOracle init mockUSDC coin", async () => {
    [delphorMockUSDCPDA, delphorMockUSDCPDAbump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mockUSDCMint.toBuffer()],
        delphorOracleAggregatorProgram.programId
      );

    await delphorOracleAggregatorProgram.rpc.initCoin(
      delphorMockUSDCPDAbump,
      mockUSDC.decimals,
      mockUSDC.symbol,
      {
        accounts: {
          switchboardOptimizedFeedAccount: switchboardOptimizedFeedAccount,
          pythProductAccount: pythProductAccount,
          coinData: delphorMockUSDCPDA,
          mint: mockUSDCMint,
          authority: adminAccount,
          payer: adminAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const delphorMockUSDCData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(delphorMockUSDCPDA);

    assert.ok(delphorMockUSDCData.symbol == mockUSDC.symbol);
    assert.ok(delphorMockUSDCData.mint.toBase58() == mockUSDCMint.toBase58());
    assert.ok(
      delphorMockUSDCData.authority.toBase58() == adminAccount.toBase58()
    );
    assert.ok(delphorMockUSDCData.decimals == mockUSDC.decimals);
  });

  it("DelphorOracle update mockUSDC price", async () => {
    await delphorOracleAggregatorProgram.rpc.updateCoinPrice({
      accounts: {
        switchboardOptimizedFeedAccount,
        pythPriceAccount,
        coinOracle3: delphorOracleMockUSDCPDA,
        coinData: delphorMockUSDCPDA,
        payer: adminAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const delphorMockUSDCData =
      await delphorOracleAggregatorProgram.account.coinData.fetch(delphorMockUSDCPDA);

    checkData(mockUSDC, delphorMockUSDCData.symbol, delphorMockUSDCData.price);
  });

  it("Initialize global state", async () => {
    [globalState, globalStateBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [adminAccount.toBuffer()],
        superLiquidityProgram.programId
      );

    await superLiquidityProgram.rpc.initialize(globalStateBump, {
      accounts: {
        adminAccount: adminAccount,
        globalState: globalState,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  });

  it("Initialize MockSOL token store", async () => {
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
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
      await anchor.web3.PublicKey.findProgramAddress(
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
    // Associated account PDA - store user data
    [aliceMockSOLVault, aliceMockSOLVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockSOLMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await superLiquidityProgram.rpc.initUserVault(
      aliceMockSOLVaultBump,
      0,
      0,
      [],
      {
        accounts: {
          globalState: globalState,
          userAccount: alice.publicKey,
          mint: mockSOLMint,
          userVault: aliceMockSOLVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [alice],
      }
    );
  });

  it("Initialize alice mockUSDC vault", async () => {
    // Associated account PDA - store user data
    [aliceMockUSDCVault, aliceMockUSDCVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockUSDCMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await superLiquidityProgram.rpc.initUserVault(
      aliceMockUSDCVaultBump,
      0,
      0,
      [],
      {
        accounts: {
          globalState: globalState,
          userAccount: alice.publicKey,
          mint: mockUSDCMint,
          userVault: aliceMockUSDCVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [alice],
      }
    );
  });

  it("Initialize bob mockSOL vault", async () => {
    // Associated account PDA - store user data
    [bobMockSOLVault, bobMockSOLVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [bob.publicKey.toBuffer(), mockSOLMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await superLiquidityProgram.rpc.initUserVault(
      bobMockSOLVaultBump,
      0,
      0,
      [],
      {
        accounts: {
          globalState: globalState,
          userAccount: bob.publicKey,
          mint: mockSOLMint,
          userVault: bobMockSOLVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [bob],
      }
    );
  });

  it("Initialize bob mockUSDC vault", async () => {
    // Associated account PDA - store user data
    [bobMockUSDCVault, bobMockUSDCVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [bob.publicKey.toBuffer(), mockUSDCMint.toBuffer()],
        superLiquidityProgram.programId
      );

    await superLiquidityProgram.rpc.initUserVault(
      bobMockUSDCVaultBump,
      0,
      0,
      [],
      {
        accounts: {
          globalState: globalState,
          userAccount: bob.publicKey,
          mint: mockUSDCMint,
          userVault: bobMockUSDCVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [bob],
      }
    );
  });

  it("Alice changes mockSOL fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);
    await superLiquidityProgram.rpc.updateUserVault(
      sellFee,
      buyFee,
      min,
      max,
      [mockSOLMint, mockUSDCMint],
      {
        accounts: {
          userAccount: alice.publicKey,
          userVault: aliceMockSOLVault,
          mint: mockSOLMint,
        },
        signers: [alice],
      }
    );

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );

    assert.ok(aliceMockSOLVaultData.buyFee == buyFee);
    assert.ok(aliceMockSOLVaultData.sellFee == sellFee);
    assert.ok(aliceMockSOLVaultData.min.eq(min));
    assert.ok(aliceMockSOLVaultData.max.eq(max));
  });

  it("Alice changes mockUSDC fees, min and max", async () => {
    let sellFee = 100;
    let buyFee = 300;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);
    await superLiquidityProgram.rpc.updateUserVault(
      sellFee,
      buyFee,
      min,
      max,
      [mockSOLMint, mockUSDCMint],
      {
        accounts: {
          userAccount: alice.publicKey,
          userVault: aliceMockUSDCVault,
          mint: mockUSDCMint,
        },
        signers: [alice],
      }
    );

    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    assert.ok(aliceMockUSDCVaultData.buyFee == buyFee);
    assert.ok(aliceMockUSDCVaultData.sellFee == sellFee);
    assert.ok(aliceMockUSDCVaultData.min.eq(min));
    assert.ok(aliceMockUSDCVaultData.max.eq(max));
  });

  it("Bob changes mockSOL fees, min and max", async () => {
    let sellFee = 1;
    let buyFee = 3;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);
    await superLiquidityProgram.rpc.updateUserVault(
      sellFee,
      buyFee,
      min,
      max,
      [mockSOLMint, mockUSDCMint],
      {
        accounts: {
          userAccount: bob.publicKey,
          userVault: bobMockSOLVault,
          mint: mockSOLMint,
        },
        signers: [bob],
      }
    );

    const bobMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(bobMockSOLVault);

    assert.ok(bobMockSOLVaultData.buyFee == buyFee);
    assert.ok(bobMockSOLVaultData.sellFee == sellFee);
    assert.ok(bobMockSOLVaultData.min.eq(min));
    assert.ok(bobMockSOLVaultData.max.eq(max));
  });

  it("Bob changes mockUSDC fees, min and max", async () => {
    let sellFee = 1;
    let buyFee = 3;
    let min = new anchor.BN(1 * 10 ** 9);
    let max = new anchor.BN(10 * 10 ** 9);
    await superLiquidityProgram.rpc.updateUserVault(
      sellFee,
      buyFee,
      min,
      max,
      [mockSOLMint, mockUSDCMint],
      {
        accounts: {
          userAccount: bob.publicKey,
          userVault: bobMockUSDCVault,
          mint: mockUSDCMint,
        },
        signers: [bob],
      }
    );

    const bobMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(bobMockUSDCVault);

    assert.ok(bobMockUSDCVaultData.buyFee == buyFee);
    assert.ok(bobMockUSDCVaultData.sellFee == sellFee);
    assert.ok(bobMockUSDCVaultData.min.eq(min));
    assert.ok(bobMockUSDCVaultData.max.eq(max));
  });

  it("Alice deposit mockSOL", async () => {
    await superLiquidityProgram.rpc.deposit(depositAmountAliceMockSOL, {
      accounts: {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockSOLMint,
        getTokenFrom: alicemockSOL,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockSOLStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [alice],
    });

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    assert.ok(
      aliceMockSOLAccount.amount.eq(
        mintMockSOLAmountToAlice.sub(depositAmountAliceMockSOL)
      )
    );

    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    assert.ok(programMockSOLAccount.amount.eq(depositAmountAliceMockSOL));

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );
    assert.ok(aliceMockSOLVaultData.amount.eq(depositAmountAliceMockSOL));
  });

  it("Alice deposit mockUSDC", async () => {
    await superLiquidityProgram.rpc.deposit(depositAmountAliceMockUSDC, {
      accounts: {
        userAccount: alice.publicKey,
        userVault: aliceMockUSDCVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: mockUSDCMint,
        getTokenFrom: alicemockUSDC,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: mockUSDCStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [alice],
    });

    aliceMockUSDCAccount = await getTokenAccount(provider, alicemockUSDC);
    assert.ok(
      aliceMockUSDCAccount.amount.eq(
        mintMockUSDCAmountToAlice.sub(depositAmountAliceMockUSDC)
      )
    );

    programMockUSDCAccount = await getTokenAccount(provider, mockUSDCStore);
    assert.ok(programMockUSDCAccount.amount.eq(depositAmountAliceMockUSDC));

    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );
    assert.ok(aliceMockUSDCVaultData.amount.eq(depositAmountAliceMockUSDC));
  });

  it("Bob swap mockSOL for mockUSDC", async () => {
    await superLiquidityProgram.rpc.swap(
      bobSwapAmountSOLForUSDC,
      bobSwapUSDCMinAmount,
      tokenStoreAuthorityBump,
      {
        accounts: {
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
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [bob],
      }
    );

    bobMockSOLAccount = await getTokenAccount(provider, bobmockSOL);
    assert.ok(
      bobMockSOLAccount.amount.eq(
        mintMockSOLAmountToBob.sub(bobSwapAmountSOLForUSDC)
      )
    );

    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    assert.ok(
      programMockSOLAccount.amount.eq(
        depositAmountAliceMockSOL.add(bobSwapAmountSOLForUSDC)
      )
    );

    const aliceMockSOLVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockSOLVault
      );
    assert.ok(
      aliceMockSOLVaultData.amount.eq(
        depositAmountAliceMockSOL.add(bobSwapAmountSOLForUSDC)
      )
    );

    const aliceMockUSDCVaultData =
      await superLiquidityProgram.account.userCoinVault.fetch(
        aliceMockUSDCVault
      );

    let finalAmount = new BN(
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
    assert.ok(bobMockUSDCAccount.amount.eq(finalAmount));

    assert.ok(
      aliceMockUSDCVaultData.amount.eq(
        depositAmountAliceMockUSDC.sub(finalAmount)
      )
    );
  });
});
