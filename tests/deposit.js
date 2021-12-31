const anchor = require("@project-serum/anchor");
const assert = require("assert");

const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new anchor.web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function createAssociatedTokenAccountInstruction(associatedProgramId,
  programId, mint, associatedAccount, owner, payer) {
  const data = Buffer.alloc(0);
  let keys = [{
      pubkey: payer,
      isSigner: true,
      isWritable: true
  }, {
      pubkey: associatedAccount,
      isSigner: false,
      isWritable: true
  }, {
      pubkey: owner,
      isSigner: false,
      isWritable: false
  }, {
      pubkey: mint,
      isSigner: false,
      isWritable: false
  }, {
      pubkey: anchor.web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false
  }, {
      pubkey: programId,
      isSigner: false,
      isWritable: false
  }, {
      pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false
  }];
  return new anchor.web3.TransactionInstruction({
      keys,
      programId: associatedProgramId,
      data
  });
}

// TODO: Refactoring

const {
  getTokenAccount,
  createMint,
  createTokenAccount,
  mintToAccount,
} = require("./utils");

async function getAssociatedTokenAccount(mint, owner) {
  return anchor.utils.token.associatedAddress({ mint: mint, owner: owner });
}

async function createAssociatedTokenAccount(
  provider,
  mint,
  owner
) {
  let associated = await getAssociatedTokenAccount(mint, owner);

  try {
    let tokenAccountInfo = await getTokenAccount(provider, associated, mint);
    return associated; //if the account exists
  } catch {
    const tx = new anchor.web3.Transaction();

    tx.add(
      await createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        associated,
        owner,
        provider.wallet.publicKey
      )
    );

    await provider.send(tx, []);
  }
  return associated;
}

describe("deposit", () => {
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SuperLiquidity;

  let programSigner;
  let usdcMint,
    userUsdc,
    usdcStore,
    userData,
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
      program.provider,
      program.provider.wallet.PublicKey
    );

    userUsdc = await createTokenAccount(
      program.provider,
      usdcMint,
      program.provider.wallet.publicKey
    );

    // Associated account PDA - store user data
    [userVault, userVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
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

    /*
    usdcStore = await createTokenAccount(
      program.provider,
      usdcMint,
      tokenStoreAuthority
    );
    */
  });

  it("Initialize global state", async () => {
    [globalState, globalStateBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [program.provider.wallet.publicKey.toBuffer()],
        program.programId
      );

    await program.rpc.initialize(globalStateBump, {
      accounts: {
        adminAccount: program.provider.wallet.publicKey,
        globalState: globalState,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  });

  it("Initialize token store", async () => {
    /*
    [usdcStore, usdcStoreBump] = await anchor.web3.PublicKey.findProgramAddress(
      [globalState.toBuffer(), usdcMint.toBuffer()],
      program.programId
    );
    */

    usdcStore = await createAssociatedTokenAccount(
      program.provider,
      usdcMint,
      tokenStoreAuthority
    );

    /*
    await program.rpc.initTokenStore(usdcStoreBump, {
      accounts: {
        globalState: globalState,
        adminAccount: program.provider.wallet.publicKey,
        mint: usdcMint,
        tokenStoreAuthority: tokenStoreAuthority,
        tokenStore: usdcStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    */
  });

  it("Initialize vault", async () => {
    await program.rpc.initUserVault(userVaultBump, 0, 0, {
      accounts: {
        globalState: globalState,
        userAccount: program.provider.wallet.publicKey,
        mint: usdcMint,
        userVault: userVault,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  });

  it("Deposit tokens", async () => {
    await program.rpc.deposit(0, amount, {
      accounts: {
        globalState: globalState,
        userVault: userVault,
        tokenStoreAuthority: tokenStoreAuthority,
        mint: usdcMint,
        getTokenFrom: userUsdc,
        getTokenFromAuthority: program.provider.wallet.publicKey,
        tokenStorePda: usdcStore,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });

    userUsdcData = await getTokenAccount(program.provider, userUsdc);
    assert.ok(userUsdcData.amount.eq(new anchor.BN(0)));

    programUsdcData = await getTokenAccount(program.provider, usdcStore);
    assert.ok(programUsdcData.amount.eq(amount));
  });
});
