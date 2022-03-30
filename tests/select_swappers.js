const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const {
  programCall,
  checkEqualValues,
  expectProgramCallRevert,
} = require("./utils");
const assert = require("assert");
const { expect } = require("chai");
const { selectSwappers } = require("./utils/swap");

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
    aggregatorGlobalAccount,
    finalAmount;

  let sellFee = 100,
    buyFee = 300,
    min = new anchor.BN(1 * 10 ** 9),
    max = new anchor.BN(10 * 10 ** 9);

  function Lamport(value) {
    return new BN(value * 10 ** 9);
  }

  let mintMockSOLAmountToAlice = Lamport(100);
  let mintMockSOLAmountToBob = Lamport(50);
  let mintMockUSDCAmountToAlice = Lamport(17500);
  let depositAmountAliceMockSOL = Lamport(7);
  let depositAmountAliceMockUSDC = Lamport(500);
  let bobSwapAmountSOLForUSDC = Lamport(2);
  let bobSwapUSDCMinAmount = Lamport(250);

  let pythProductAccount = systemProgram;
  let pythPriceAccount = systemProgram;
  let switchboardOptimizedFeedAccount = systemProgram;

  const minUSers = 1;
  const maxUSers = 20;
  const totalUsers = Math.floor(Math.random() * maxUSers + minUSers);
  const maxTransferTransactions = 20;
  const users = Array.from({ length: totalUsers }, (e) =>
    anchor.web3.Keypair.generate()
  );
  const positionMockSOL = 0;
  const positionMockUSDC = 1;
  const minMint = 1;
  const maxMint = 10000;
  const tokens = [
    { price: Lamport(150), symbol: "SOL", decimals: 9 },
    {
      price: Lamport(1),
      symbol: "USDC",
      decimals: 9,
    },
  ];
  const totalTokens = tokens.length;
  const mints = new Array(totalTokens);
  const oracleTokensPDAs = new Array(totalTokens);
  const tokenStores = new Array(totalTokens);
  const usersTokenAccounts = Array.from(
    { length: totalUsers },
    (e) => new Array(totalTokens)
  );
  const usersLP = new Array(totalUsers);

  it("Create mints accounts and mint tokens", async () => {
    for (let i = 0; i < totalTokens; i++) {
      mints[i] = await createMint(provider, adminAccount);
      const mint = mints[i];
      for (let j = 0; j < totalUsers; j++) {
        let user = users[j].publicKey;

        usersTokenAccounts[j][i] = await createAssociatedTokenAccount(
          provider,
          mint,
          user
        );

        let userTokenAccount = usersTokenAccounts[j][i];

        expect(userTokenAccount.toBase58()).eq(
          (await getAssociatedTokenAccount(mint, user)).toBase58()
        );

        const amount = Lamport(Math.floor(Math.random() * maxMint + minMint));

        await mintToAccount(
          provider,
          mint,
          userTokenAccount,
          amount,
          adminAccount
        );

        let userTokenData = await getTokenAccount(provider, userTokenAccount);
        expect(userTokenData.amount.toString()).equal(amount.toString());
      }
    }
  });

  it("DelphorOracle create coins", async () => {
    for (let i = 0; i < totalTokens; i++) {
      const token = tokens[i];
      [oracleTokensPDAs[i]] = await PublicKey.findProgramAddress(
        [token.symbol],
        delphorOracleProgram.programId
      );

      await programCall(
        delphorOracleProgram,
        "createCoin",
        [token.price, token.price, token.price, token.symbol],
        {
          coin: oracleTokensPDAs[i],
          authority,
          payer,
          systemProgram,
        }
      );

      const pdaData = await delphorOracleProgram.account.coinInfo.fetch(
        oracleTokensPDAs[i]
      );

      assert.ok(
        checkEqualValues(
          [token.price, adminAccount, token.symbol],
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

  it("DelphorAggregator add tokens", async () => {
    for (let i = 0; i < totalTokens; i++) {
      const token = tokens[i];
      const mint = mints[i];

      await programCall(
        delphorAggregatorProgram,
        "addToken",
        [token.decimals, token.symbol],
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

      let tokenAggData = globalAccount.tokens[i];
      expect(globalAccount.tokens.length).eq(i + 1);
      expect(Number(tokenAggData.price)).eq(0);
      expect(tokenAggData.symbol).eq(token.symbol);
      expect(Number(tokenAggData.lastUpdateTimestamp)).eq(0);
      expect(tokenAggData.mint.toBase58()).eq(mint.toBase58());
      expect(tokenAggData.decimals).eq(token.decimals);
      expect(tokenAggData.pythPriceAccount.toBase58()).eq(
        pythProductAccount.toBase58()
      );
      expect(tokenAggData.switchboardOptimizedFeedAccount.toBase58()).eq(
        switchboardOptimizedFeedAccount.toBase58()
      );
    }
  });

  it("DelphorAggregator update prices", async () => {
    for (let i = 0; i < totalTokens; i++) {
      const mint = mints[i];
      const token = tokens[i];

      await programCall(delphorAggregatorProgram, "updateTokenPrice", [i], {
        switchboardOptimizedFeedAccount,
        pythPriceAccount,
        delphorOracle: oracleTokensPDAs[i],
        globalAccount: aggregatorGlobalAccount,
        authority,
        mint,
      });

      const globalAccount =
        await delphorAggregatorProgram.account.globalAccount.fetch(
          aggregatorGlobalAccount
        );

      expect(globalAccount.tokens[i].price.toString()).eq(
        token.price.toString()
      );
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

  it("Initialize token stores", async () => {
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        superLiquidityProgram.programId
      );

    for (let i = 0; i < totalTokens; i++) {
      const mint = mints[i];

      tokenStores[i] = await createAssociatedTokenAccount(
        provider,
        mint,
        tokenStoreAuthority
      );

      expect(tokenStores[i].toBase58()).eq(
        (await getAssociatedTokenAccount(mint, tokenStoreAuthority)).toBase58()
      );
    }
  });

  it("Add tokens to globalState", async () => {
    for (let i = 0; i < totalTokens; i++) {
      const mint = mints[i];

      await programCall(superLiquidityProgram, "addToken", [], {
        adminAccount,
        globalState,
        mint,
      });

      let globalStateData =
        await superLiquidityProgram.account.globalState.fetch(globalState);

      expect(globalStateData.tokens.length).eq(i + 1);
      expect(globalStateData.tokens[i].toBase58()).eq(mint.toBase58());
    }
  });

  it("Transfer lamport to users", async () => {
    let len = totalUsers;
    let transaction = new anchor.web3.Transaction();
    while (len--) {
      transaction.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: adminAccount,
          toPubkey: users[len].publicKey,
          lamports: anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      if (len == 0 || len % maxTransferTransactions == 0) {
        transaction.feePayer = adminAccount;
        let blockhashObj = await provider.connection.getRecentBlockhash();
        transaction.recentBlockhash = blockhashObj.blockhash;
        let signed = await provider.wallet.signTransaction(transaction);
        let signature = await provider.connection.sendRawTransaction(
          signed.serialize()
        );

        await provider.connection.confirmTransaction(signature, "finalized");
        transaction = new anchor.web3.Transaction();
      }
    }

    len = totalUsers;
    while (len--) {
      let balance = await getBalance(users[len].publicKey);
      expect(balance).to.eq(anchor.web3.LAMPORTS_PER_SOL);
    }
  });

  it("Initialize and update liquidity provider vaults", async () => {
    for (let i = 0; i < totalUsers; i++) {
      const user = users[i];
      let bump;

      [usersLP[i], bump] = await PublicKey.findProgramAddress(
        [user.publicKey.toBuffer(), Buffer.from("liquidity_provider")],
        superLiquidityProgram.programId
      );

      await programCall(
        superLiquidityProgram,
        "initUserLiquidityProvider",
        [],
        {
          userAccount: user.publicKey,
          userVault: usersLP[i],
          systemProgram,
        },
        [user]
      );

      let userLPData = await superLiquidityProgram.account.userVault.fetch(
        usersLP[i]
      );

      userLPData.vaults.forEach((vault) => {
        Object.values(vault).forEach((propertie) => {
          expect(Number(propertie)).eq(0);
        });
      });

      expect(userLPData.bump).eq(bump);
      expect(userLPData.user.toBase58()).eq(user.publicKey.toBase58());
      expect(Object.getOwnPropertyNames(userLPData.vaultType).toString()).eq(
        "liquidityProvider"
      );
      expect(userLPData.vaults.length).eq(50);

      for (let j = 0; j < totalTokens; j++) {
        const mint = mints[j];

        await programCall(
          superLiquidityProgram,
          "updateUserLiquidityProvider",
          [j, buyFee, sellFee, min, max, true, true, true, new BN(0)],
          {
            globalState,
            userAccount: user.publicKey,
            mint,
            userVault: usersLP[i],
          },
          [user]
        );

        userLPData = (
          await superLiquidityProgram.account.userVault.fetch(usersLP[i])
        ).vaults[j];

        expect(userLPData.buyFee).eq(buyFee);
        expect(userLPData.sellFee).eq(sellFee);
        expect(userLPData.min.toString()).eq(min.toString());
        expect(userLPData.max.toString()).eq(max.toString());
        expect(userLPData.receiveStatus).eq(true);
        expect(userLPData.provideStatus).eq(true);
        expect(userLPData.limitPriceStatus).eq(true);
        expect(Number(userLPData.limitPrice)).eq(0);
      }
    }
  });

  it("Alice deposit mockSOL in liquidity provider", async () => {
    for (let i = 0; i < totalUsers; i++) {
      const user = users[i];
      const userLP = usersLP[i];

      for (let j = 0; j < totalTokens; j++) {
        const mint = mints[j];
        const userTokenAccount = usersTokenAccounts[i][j];
        const tokenStore = tokenStores[j];

        const userBeforeBalance = (
          await getTokenAccount(provider, userTokenAccount)
        ).amount;
        const delphorBeforeBalance = (
          await getTokenAccount(provider, tokenStore)
        ).amount;
        const userLPBeforeBalance = (
          await superLiquidityProgram.account.userVault.fetch(userLP)
        ).vaults[j].amount;

        await programCall(
          superLiquidityProgram,
          "deposit",
          [userBeforeBalance, j],
          {
            globalState,
            userAccount: user.publicKey,
            userVault: userLP,
            tokenStoreAuthority: tokenStoreAuthority,
            mint,
            getTokenFrom: userTokenAccount,
            getTokenFromAuthority: user.publicKey,
            tokenStorePda: tokenStore,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          [user]
        );

        const userCurrentBalance = (
          await getTokenAccount(provider, userTokenAccount)
        ).amount;
        const delphorCurrentBalance = (
          await getTokenAccount(provider, tokenStore)
        ).amount;
        const userLPCurrentBalance = (
          await superLiquidityProgram.account.userVault.fetch(userLP)
        ).vaults[j].amount;

        expect(Number(userCurrentBalance)).eq(0);
        expect(userLPCurrentBalance.toString()).eq(
          userLPBeforeBalance.add(userBeforeBalance).toString()
        );
        expect(delphorCurrentBalance.toString()).eq(
          delphorBeforeBalance.add(userBeforeBalance).toString()
        );
      }
    }
  });

  return;

  xit("Initialize alice portfolio manager vault", async () => {
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

  xit("Alice update mockSOL portfolio manager vault", async () => {
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

    const vaults = await selectSwappers(
      superLiquidityProgram,
      positionMockUSDC,
      positionMockSOL,
      mockUSDC.price,
      bobSwapAmountSOLForUSDC,
      bobSwapUSDCMinAmount
    );

    vaults.map((e) => {
      console.log(e.toBase58());
    });
    console.log(aliceLP.toBase58());

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
});
