const anchor = require("@project-serum/anchor");
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

describe("deposit", () => {
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SuperLiquidity;
  const provider = program.provider;
  const adminAccount = provider.wallet.publicKey;
  const alice = anchor.web3.Keypair.generate();
  const attacker = anchor.web3.Keypair.generate();

  let mockSOLMint,
    alicemockSOL,
    mockSOLStore,
    tokenStoreAuthorityBump,
    tokenStoreAuthority,
    aliceMockSOLVault,
    aliceMockSOLVaultBump,
    globalState,
    globalStateBump,
    aliceMockSOLAccount,
    programMockSOLAccount,
    amount;

  it("Airdrop lamports to alice", async function () {
    let balance = await getBalance(alice.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(alice.publicKey);
    balance = await getBalance(alice.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL);
  });

  it("Airdrop lamports to attacker", async function () {
    let balance = await getBalance(attacker.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(attacker.publicKey);
    balance = await getBalance(attacker.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL);
  });

  it("Create and mint test tokens", async () => {
    // Create MockSOL Mint
    mockSOLMint = await createMint(provider, adminAccount);

    alicemockSOL = await createAssociatedTokenAccount(
      provider,
      mockSOLMint,
      alice.publicKey
    );

    assert.ok(
      alicemockSOL.toBase58() ==
        (await getAssociatedTokenAccount(mockSOLMint, alice.publicKey)).toBase58()
    );

    attackerMockSOL = await createAssociatedTokenAccount(
      provider,
      mockSOLMint,
      attacker.publicKey
    );

    assert.ok(
      attackerMockSOL.toBase58() ==
        (
          await getAssociatedTokenAccount(mockSOLMint, attacker.publicKey)
        ).toBase58()
    );

    amount = new anchor.BN(5 * 10 ** 6);
    // Create user and program token accounts
    await mintToAccount(provider, mockSOLMint, alicemockSOL, amount, adminAccount);

    let aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    assert.ok(aliceMockSOLAccount.amount.eq(amount));
  });

  it("Initialize global state", async () => {
    [globalState, globalStateBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [adminAccount.toBuffer()],
        program.programId
      );

    await program.rpc.initialize(globalStateBump, {
      accounts: {
        adminAccount: adminAccount,
        globalState: globalState,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  });

  it("Initialize token store", async () => {
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        program.programId
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

  it("Initialize vault", async () => {
    // Associated account PDA - store user data
    [aliceMockSOLVault, aliceMockSOLVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockSOLMint.toBuffer()],
        program.programId
      );

    await program.rpc.initUserVault(aliceMockSOLVaultBump, 0, 0, {
      accounts: {
        globalState: globalState,
        userAccount: alice.publicKey,
        mint: mockSOLMint,
        userVault: aliceMockSOLVault,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [alice],
    });
  });

  it("Deposit tokens", async () => {
    await program.rpc.deposit(amount, {
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
    assert.ok(aliceMockSOLAccount.amount.eq(new anchor.BN(0)));

    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    assert.ok(programMockSOLAccount.amount.eq(amount));

    const aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );
    assert.ok(aliceMockSOLVaultData.amount.eq(amount));
  });

  it("Attacker can't withdraw tokens from alice vault", async () => {
    try {
      await program.rpc.withdraw(tokenStoreAuthorityBump, amount, {
        accounts: {
          vaultUser: alice.publicKey,
          userVault: aliceMockSOLVault,
          mint: mockSOLMint,
          sendTokenTo: attackerMockSOL,
          tokenStoreAuthority: tokenStoreAuthority,
          tokenStorePda: mockSOLStore,
          userAccount: attacker.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [attacker],
      });

      attackerMockSOLAccount = await getTokenAccount(provider, attackerMockSOL);
      assert.ok(attackerMockSOLAccount.amount.eq(amount));

      programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
      assert.ok(programMockSOLAccount.amount.eq(new anchor.BN(0)));

      console.log("Attack success");
    } catch {}

    attackerMockSOLAccount = await getTokenAccount(provider, attackerMockSOL);
    assert.ok(attackerMockSOLAccount.amount.eq(new anchor.BN(0)));

    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    assert.ok(programMockSOLAccount.amount.eq(amount));
  });

  it("Withdraw tokens", async () => {
    await program.rpc.withdraw(tokenStoreAuthorityBump, amount, {
      accounts: {
        vaultUser: alice.publicKey,
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
        sendTokenTo: alicemockSOL,
        tokenStoreAuthority: tokenStoreAuthority,
        tokenStorePda: mockSOLStore,
        userAccount: alice.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [alice],
    });

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    assert.ok(aliceMockSOLAccount.amount.eq(amount));

    programMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    assert.ok(programMockSOLAccount.amount.eq(new anchor.BN(0)));

    const aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );
    assert.ok(aliceMockSOLVaultData.amount.eq(new anchor.BN(0)));
  });

  it("User changes fees, min and max", async () => {
    let sellFee = 1;
    let buyFee = 3;
    let min = new anchor.BN(5);
    let max = new anchor.BN(7);
    await program.rpc.updateUserVault(sellFee, buyFee, min, max, {
      accounts: {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        mint: mockSOLMint,
      },
      signers: [alice],
    });

    const aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );
    
    assert.ok(aliceMockSOLVaultData.buyFee == buyFee);
    assert.ok(aliceMockSOLVaultData.sellFee == sellFee);
    assert.ok(aliceMockSOLVaultData.min.eq(min));
    assert.ok(aliceMockSOLVaultData.max.eq(max));
    
  });

  it("Get all the vaults", async () => {
    let accounts = await program.account.userCoinVault.all();
    console.log("🚀 ~ file: swap.js ~ line 840 ~ it ~ accounts", accounts);
    console.log("🚀 ~ file: swap.js ~ line 784 ~ it ~ accounts", accounts[0].publicKey.toBase58())
    console.log("🚀 ~ file: swap.js ~ line 784 ~ it ~ accounts", accounts[0].account.user.toBase58())
    console.log("🚀 ~ file: swap.js ~ line 784 ~ it ~ accounts", accounts[0].account.mint.toBase58())
  });
});
