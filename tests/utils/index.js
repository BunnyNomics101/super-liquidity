// TODO: use the `@solana/spl-token` package instead of utils here.

const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { Connection } = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

async function getTokenAccount(provider, addr) {
  return await serumCmn.getTokenAccount(provider, addr);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkEqualValues(localValue, storedValue) {
  let result = localValue.length == storedValue.length;
  if (result) {
    for (let x = 0; x < localValue.length; x++) {
      if (localValue[x].toString() != storedValue[x].toString()) {
        return false;
      }
    }
  }
  return result;
}

async function createMint(provider, authority) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = anchor.web3.Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.send(tx, [mint]);

  return mint.publicKey;
}

const oldConsoleLog = console.log;
const oldConsoleError = console.error;

function pauseConsole() {
  console.log = function () {
    const _noop = "";
  };
  console.error = function () {
    const _noop = "";
  };
}

function resumeConsole() {
  console.log = oldConsoleLog;
  console.error = oldConsoleError;
}

function checkError(error, errorExpected = undefined) {
  let result = false;
  resumeConsole();
  if (error.msg) {
    if (errorExpected) {
      result = error.msg == errorExpected;
      if (!result) {
        console.log("Errors don't match");
      }
    } else {
      console.log(error.msg);
    }
  } else {
    console.log("No msg error");
    console.log(error);
  }

  return result;
}

async function programCall(program, f, params, accounts, signers = []) {
  let tx;
  pauseConsole();

  if (signers.length == 0) {
    tx = await program.rpc[f](...params, {
      accounts,
    }).catch((err) => {
      checkError(err);
    });
  } else {
    tx = await program.rpc[f](...params, {
      accounts,
      signers,
    }).catch((err) => {
      checkError(err);
    });
  }

  resumeConsole();
  return tx;
}

async function expectProgramCallRevert(
  program,
  f,
  params,
  accounts,
  errorExpected,
  signers = []
) {
  let errorResult;
  pauseConsole();
  if (signers.length == 0) {
    errorResult = await program.rpc[f](...params, {
      accounts,
    }).catch((err) => {
      return checkError(err, errorExpected);
    });
  } else {
    errorResult = await program.rpc[f](...params, {
      accounts,
      signers,
    }).catch((err) => {
      return checkError(err, errorExpected);
    });
  }

  resumeConsole();
  return errorResult;
}

async function createMintInstructions(provider, authority, mint) {
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint,
      decimals: 6,
      mintAuthority: authority,
    }),
  ];
}

async function mintToAccount(
  provider,
  mint,
  destination,
  amount,
  mintAuthority
) {
  // mint authority is the provider
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createMintToAccountInstrs(
      mint,
      destination,
      amount,
      mintAuthority
    ))
  );
  await provider.send(tx, []);
  return;
}

async function createMintToAccountInstrs(
  mint,
  destination,
  amount,
  mintAuthority
) {
  return [
    TokenInstructions.mintTo({
      mint,
      destination: destination,
      amount: amount,
      mintAuthority: mintAuthority,
    }),
  ];
}

function createAssociatedTokenAccountInstruction(
  associatedProgramId,
  programId,
  mint,
  associatedAccount,
  owner,
  payer
) {
  const data = Buffer.alloc(0);
  let keys = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: owner,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: anchor.web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new anchor.web3.TransactionInstruction({
    keys,
    programId: associatedProgramId,
    data,
  });
}

async function getAssociatedTokenAccount(mint, owner) {
  return anchor.utils.token.associatedAddress({ mint: mint, owner: owner });
}

async function createAssociatedTokenAccount(provider, mint, owner) {
  let associated = await getAssociatedTokenAccount(mint, owner);

  try {
    let tokenAccountInfo = await getTokenAccount(provider, associated);
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

// Create connection
function createConnection(url = "http://127.0.0.1:8899") {
  return new Connection(url);
}

const connection = createConnection();

// Get balance
async function getBalance(publicKey) {
  return connection.getBalance(publicKey);
}

async function airdropLamports(publicKey) {
  let airdropTx = await connection.requestAirdrop(
    publicKey,
    anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropTx);
}

module.exports = {
  TOKEN_PROGRAM_ID,
  getTokenAccount,
  createMint,
  mintToAccount,
  createAssociatedTokenAccount,
  getBalance,
  airdropLamports,
  getAssociatedTokenAccount,
  programCall,
  expectProgramCallRevert,
  sleep,
  checkEqualValues,
};
