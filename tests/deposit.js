const anchor = require("@project-serum/anchor");
const assert = require("assert");

const {
  TOKEN_PROGRAM_ID,
  getTokenAccount,
  createMint,
  createTokenAccount,
  mintToAccount,
} = require("./utils");

describe("deposit", () => {
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SuperLiquidity;

  let programSigner;
  let usdcMint,
    userUsdc,
    usdcStore,
    userData,
    tokenStoreAuthority,
    coinVault,
    coinVaultBump,
    tokenStoreAuthorityBump;
  let amount;

  it("Create test tokens", async () => {
    // Create USDC mint
    usdcMint = await createMint(
      program.provider,
      program.provider.wallet.PublicKey
    );

    userUsdc = await createTokenAccount(
      program.provider,
      usdcMint,
      program.provider.wallet.publicKey
    );

    // Associated account PDA - store user data
    [coinVault, coinVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [program.provider.wallet.publicKey.toBuffer(), usdcMint.toBuffer()],
      program.programId
    );

    amount = new anchor.BN(5 * 10 ** 6);
    // Create user and program token accounts
    await mintToAccount(
      program.provider,
      usdcMint,
      userUsdc,
      amount,
      program.provider.wallet.publicKey
    );

    let userUsdcData = await getTokenAccount(program.provider, userUsdc);
    assert.ok(userUsdcData.amount.eq(amount));

    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        program.programId
      );

    usdcStore = await createTokenAccount(
      program.provider,
      usdcMint,
      tokenStoreAuthority
    );
  });

  // TODO: Initialize coinVault in the program
  it("Deposit tokens", async () => {
    await program.rpc.deposit(amount, {
      accounts: {
        coinVault: coinVault,
        getTokenFrom: userUsdc,
        getTokenFromAuthority: program.provider.wallet.publicKey,
        tokenStorePda: usdcStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
  });
});
