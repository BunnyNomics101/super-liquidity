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

  let usdcMint,
    aliceUsdc,
    usdcStore,
    tokenStoreAuthorityBump,
    tokenStoreAuthority,
    aliceUsdcVault,
    aliceUsdcVaultBump,
    globalState,
    globalStateBump,
    aliceUsdcAccount,
    programUsdcAccount,
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
    // Create USDC mint
    usdcMint = await createMint(provider, adminAccount);

    aliceUsdc = await createAssociatedTokenAccount(
      provider,
      usdcMint,
      alice.publicKey
    );

    assert.ok(
      aliceUsdc.toBase58() ==
        (await getAssociatedTokenAccount(usdcMint, alice.publicKey)).toBase58()
    );

    attackerUsdc = await createAssociatedTokenAccount(
      provider,
      usdcMint,
      attacker.publicKey
    );

    assert.ok(
      attackerUsdc.toBase58() ==
        (
          await getAssociatedTokenAccount(usdcMint, attacker.publicKey)
        ).toBase58()
    );

    amount = new anchor.BN(5 * 10 ** 6);
    // Create user and program token accounts
    await mintToAccount(provider, usdcMint, aliceUsdc, amount, adminAccount);

    let aliceUsdcAccount = await getTokenAccount(provider, aliceUsdc);
    assert.ok(aliceUsdcAccount.amount.eq(amount));
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

    usdcStore = await createAssociatedTokenAccount(
      provider,
      usdcMint,
      tokenStoreAuthority
    );

    assert.ok(
      usdcStore.toBase58() ==
        (
          await getAssociatedTokenAccount(usdcMint, tokenStoreAuthority)
        ).toBase58()
    );
  });

  it("Initialize vault", async () => {
    // Associated account PDA - store user data
    [aliceUsdcVault, aliceUsdcVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), usdcMint.toBuffer()],
        program.programId
      );

    await program.rpc.initUserVault(aliceUsdcVaultBump, 0, 0, {
      accounts: {
        globalState: globalState,
        userAccount: alice.publicKey,
        mint: usdcMint,
        userVault: aliceUsdcVault,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [alice],
    });
  });

  it("Deposit tokens", async () => {
    await program.rpc.deposit(amount, {
      accounts: {
        userVault: aliceUsdcVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: usdcMint,
        getTokenFrom: aliceUsdc,
        getTokenFromAuthority: alice.publicKey,
        tokenStorePda: usdcStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [alice],
    });

    aliceUsdcAccount = await getTokenAccount(provider, aliceUsdc);
    assert.ok(aliceUsdcAccount.amount.eq(new anchor.BN(0)));

    programUsdcAccount = await getTokenAccount(provider, usdcStore);
    assert.ok(programUsdcAccount.amount.eq(amount));

    const aliceUsdcVaultData = await program.account.userCoinVault.fetch(
      aliceUsdcVault
    );
    assert.ok(aliceUsdcVaultData.amount.eq(amount));
  });

  it("Attacker can't withdraw tokens from alice vault", async () => {
    try {
      await program.rpc.withdraw(tokenStoreAuthorityBump, amount, {
        accounts: {
          userVault: aliceUsdcVault,
          mint: usdcMint,
          sendTokenTo: attackerUsdc,
          tokenStoreAuthority: tokenStoreAuthority,
          tokenStorePda: usdcStore,
          userAccount: attacker.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [attacker],
      });

      attackerUsdcAccount = await getTokenAccount(provider, attackerUsdc);
      assert.ok(attackerUsdcAccount.amount.eq(amount));

      programUsdcAccount = await getTokenAccount(provider, usdcStore);
      assert.ok(programUsdcAccount.amount.eq(new anchor.BN(0)));

      console.log("Attack success");
    } catch {}

    attackerUsdcAccount = await getTokenAccount(provider, attackerUsdc);
    assert.ok(attackerUsdcAccount.amount.eq(new anchor.BN(0)));

    programUsdcAccount = await getTokenAccount(provider, usdcStore);
    assert.ok(programUsdcAccount.amount.eq(amount));
  });

  it("Withdraw tokens", async () => {
    await program.rpc.withdraw(tokenStoreAuthorityBump, amount, {
      accounts: {
        userVault: aliceUsdcVault,
        mint: usdcMint,
        sendTokenTo: aliceUsdc,
        tokenStoreAuthority: tokenStoreAuthority,
        tokenStorePda: usdcStore,
        userAccount: alice.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [alice],
    });

    aliceUsdcAccount = await getTokenAccount(provider, aliceUsdc);
    assert.ok(aliceUsdcAccount.amount.eq(amount));

    programUsdcAccount = await getTokenAccount(provider, usdcStore);
    assert.ok(programUsdcAccount.amount.eq(new anchor.BN(0)));

    const aliceUsdcVaultData = await program.account.userCoinVault.fetch(
      aliceUsdcVault
    );
    assert.ok(aliceUsdcVaultData.amount.eq(new anchor.BN(0)));
  });
});
