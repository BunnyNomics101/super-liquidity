const anchor = require("@project-serum/anchor");
const PublicKey = require("@solana/web3.js").PublicKey;
const assert = require("assert");
const { programCall, checkEqualValues } = require("./utils");

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
  const systemProgram = anchor.web3.SystemProgram.programId;

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
    delphorMockSOLAccount,
    amount;

  it("Airdrop lamports to alice", async function () {
    let balance = await getBalance(alice.publicKey);
    assert.ok(balance == 0);
    await airdropLamports(alice.publicKey);
    balance = await getBalance(alice.publicKey);
    assert.ok(balance == anchor.web3.LAMPORTS_PER_SOL);
  });

  it("Create mockSOL token", async () => {
    mockSOLMint = await createMint(provider, adminAccount);
  });

  it("Mint mockSOL tokens to alice", async () => {
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

    amount = new anchor.BN(5 * 10 ** 6);

    await mintToAccount(
      provider,
      mockSOLMint,
      alicemockSOL,
      amount,
      adminAccount
    );

    aliceMockSOLAccount = await getTokenAccount(provider, alicemockSOL);
    assert.ok(aliceMockSOLAccount.amount.eq(amount));
  });

  it("Initialize global state", async () => {
    [globalState, globalStateBump] = await PublicKey.findProgramAddress(
      [adminAccount.toBuffer()],
      program.programId
    );

    await programCall(program, "initialize", [globalStateBump], {
      adminAccount,
      globalState,
      systemProgram,
    });
  });

  it("Initialize mockSOL token store", async () => {
    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await PublicKey.findProgramAddress(
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

  it("Initialize alice mockSOL vault", async () => {
    [aliceMockSOLVault, aliceMockSOLVaultBump] =
      await PublicKey.findProgramAddress(
        [alice.publicKey.toBuffer(), mockSOLMint.toBuffer()],
        program.programId
      );

    await programCall(
      program,
      "initUserVault",
      [aliceMockSOLVaultBump, 0, 0, []],
      {
        globalState,
        userAccount: alice.publicKey,
        mint: mockSOLMint,
        userVault: aliceMockSOLVault,
        systemProgram,
      },
      [alice]
    );

    let aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );

    assert.ok(
      checkEqualValues(
        [aliceMockSOLVaultData.user, aliceMockSOLVaultData.mint],
        [alice.publicKey, mockSOLMint]
      )
    );
  });

  it("Alice deposit mockSOL", async () => {
    await programCall(
      program,
      "deposit",
      [amount],
      {
        userAccount: alice.publicKey,
        userVault: aliceMockSOLVault,
        tokenStoreAuthority,
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
    delphorMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    const aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.amount,
          delphorMockSOLAccount.amount,
          aliceMockSOLAccount.amount,
        ],
        [amount, amount, 0]
      )
    );
  });

  it("Withdraw tokens", async () => {
    await programCall(
      program,
      "withdraw",
      [tokenStoreAuthorityBump, amount],
      {
        vaultUser: alice.publicKey,
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
    delphorMockSOLAccount = await getTokenAccount(provider, mockSOLStore);
    const aliceMockSOLVaultData = await program.account.userCoinVault.fetch(
      aliceMockSOLVault
    );

    assert.ok(
      checkEqualValues(
        [
          aliceMockSOLVaultData.amount,
          delphorMockSOLAccount.amount,
          aliceMockSOLAccount.amount,
        ],
        [0, 0, amount]
      )
    );
  });
});
