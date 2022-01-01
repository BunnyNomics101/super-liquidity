const anchor = require("@project-serum/anchor");
const assert = require("assert");

const {
  TOKEN_PROGRAM_ID,
  getTokenAccount,
  createMint,
  createTokenAccount,
  mintToAccount,
  createAssociatedTokenAccount
} = require("./utils");

/*
const {
  clusterApiUrl,
  Connection
} = require('@solana/web3.js');

// Create connection
function createConnection(url = clusterApiUrl('devnet')) {
  return new Connection(url);
}

const connection = createConnection();

// Get balance
async function getBalance(connection, publicKey) {
  return connection.getBalance(publicKey);
}
*/

describe("deposit", () => {
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SuperLiquidity;
  const provider = program.provider;
  const adminAccount = provider.wallet.publicKey;
  const alice = anchor.web3.Keypair.generate().publicKey;

  /*
  it("Check alice balance", async function() {
    const balance = await getBalance(connection, adminAccount);
    console.log('Balance:', balance);
  })
  */

  let usdcMint,
    userUsdc,
    usdcStore,
    tokenStoreAuthority,
    userVault,
    userVaultBump,
    tokenStoreAuthorityBump,
    globalState,
    globalStateBump;
  let amount;

  it("Create test tokens", async () => {
    // Create USDC mint
    usdcMint = await createMint(
      provider,
      adminAccount
    );

    userUsdc = await createTokenAccount(
      provider,
      usdcMint,
      alice
    );

    amount = new anchor.BN(5 * 10 ** 6);
    // Create user and program token accounts
    await mintToAccount(
      provider,
      usdcMint,
      userUsdc,
      amount,
      adminAccount
    );

    let userUsdcData = await getTokenAccount(provider, userUsdc);
    assert.ok(userUsdcData.amount.eq(amount));

    [tokenStoreAuthority, tokenStoreAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("store_auth")],
        program.programId
      );
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
    usdcStore = await createAssociatedTokenAccount(
      provider,
      usdcMint,
      tokenStoreAuthority
    );
  });

  it("Initialize vault", async () => {
    // Associated account PDA - store user data
    [userVault, userVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [alice.toBuffer(), usdcMint.toBuffer()],
      program.programId
    );

    await program.rpc.initUserVault(userVaultBump, 0, 0, {
      accounts: {
        globalState: globalState,
        userAccount: alice,
        mint: usdcMint,
        userVault: userVault,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  });

  xit("Deposit tokens", async () => {
    await program.rpc.deposit(0, amount, {
      accounts: {
        globalState: globalState,
        userVault: userVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: usdcMint,
        getTokenFrom: userUsdc,
        getTokenFromAuthority: alice,
        tokenStorePda: usdcStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });

    userUsdcData = await getTokenAccount(provider, userUsdc);
    assert.ok(userUsdcData.amount.eq(new anchor.BN(0)));

    programUsdcData = await getTokenAccount(provider, usdcStore);
    assert.ok(programUsdcData.amount.eq(amount));
  });
});
