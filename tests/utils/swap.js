const anchor = require("@project-serum/anchor");
const BN = require("@project-serum/anchor").BN;
const PublicKey = require("@solana/web3.js").PublicKey;
const {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getTokenAccount,
  getAssociatedTokenAccount,
  programCall,
  createMint,
  mintToAccount,
  getBalance,
  airdropLamports,
} = require("./index");

async function createLiquidityProviderUserForToken(
  generalParameters,
  tokenData,
  user,
  index
) {
  let newUserMockToken = await createAssociatedTokenAccount(
    generalParameters.provider,
    tokenData.mint,
    user.publicKey
  );

  const userInitParams = tokenData.initUserParams[index];
  const mintAmount = userInitParams[0];

  // console.log("Provider", generalParameters.provider)
  // console.log("Mint:", tokenData.mint)
  // console.log("newUserMockToken", newUserMockToken)
  // console.log("amount", mintAmount)
  // console.log("adminAccount", generalParameters.adminAccount)
  await mintToAccount(
    generalParameters.provider,
    tokenData.mint,
    newUserMockToken,
    mintAmount,
    generalParameters.adminAccount
  );

  let userMockTokenVault = await initializeUserVault(
    generalParameters,
    tokenData,
    user,
    index
  );

  const userMockToken = await createAssociatedTokenAccount(
    generalParameters.provider,
    tokenData.mint,
    user.publicKey
  );

  await depositAmount(
    generalParameters,
    tokenData,
    mintAmount,
    user,
    userMockTokenVault,
    userMockToken
  );
}

async function createLiquidityProviderUser(parameters, index) {
  let newUser = anchor.web3.Keypair.generate();
  await airdropLamports(newUser.publicKey);
  await createLiquidityProviderUserForToken(
    parameters.generalParameters,
    parameters.solParams,
    newUser,
    index
  );
  await createLiquidityProviderUserForToken(
    parameters.generalParameters,
    parameters.usdcParams,
    newUser,
    index
  );

  // mintMockSOLAmount = amountsAndFees[0]
  // buyFee = amountsAndFees[1]
  // sellFee = amountsAndFees[2]

  // let newUsermockSOL = await createAssociatedTokenAccount(
  //   parameters.provider,
  //   parameters.mockSOLMint,
  //   newUser.publicKey
  // );

  // let newUsermockUSDC = await createAssociatedTokenAccount(
  //   parameters.provider,
  //   parameters.mockUSDCMint,
  //   newUser.publicKey
  // );

  // await mintToAccount(
  //   parameters.provider,
  //   parameters.mockSOLMint,
  //   newUsermockSOL,
  //   mintMockSOLAmount,
  //   parameters.adminAccount
  // );

  // await mintToAccount(
  //   parameters.provider,
  //   parameters.mockUSDCMint,
  //   newUsermockUSDC,
  //   mintMockSOLAmount,
  //   parameters.adminAccount
  // );

  // let userMockTokenVault, userMockVaultBump
  // [userMockTokenVault, userMockVaultBump] = await initializeUserVault(parameters, newUser, amountsAndFees)

  // userMockSOL = await createAssociatedTokenAccount(
  //   parameters.provider,
  //   parameters.mockSOLMint,
  //   newUser.publicKey
  // );

  // await depositAmount(
  //   parameters,
  //   mintMockSOLAmount,
  //   newUser,
  //   userMockTokenVault,
  //   userMockSOL,

  // )
  // user = {key: newUser, mockSol: newUsermockSOL}
  user = { key: newUser };
  return user;
}

async function initializeUserVault(generalParameters, tokenData, user, index) {
  const userInitParams = tokenData.initUserParams[index];
  const buyFee = userInitParams[1];
  const sellFee = userInitParams[2];
  const receiveStatus = userInitParams[3];
  const provideStatus = userInitParams[4];

  let userMockTokenVault;
  [userMockTokenVault] = await PublicKey.findProgramAddress(
    [user.publicKey.toBuffer(), tokenData.mint.toBuffer()],
    generalParameters.superLiquidityProgram.programId
  );
  console.log("mockTokenVault", userMockTokenVault);
  await programCall(
    generalParameters.superLiquidityProgram,
    "initUserVault",
    [
      buyFee,
      sellFee,
      new BN(0),
      new BN(0),
      receiveStatus,
      provideStatus,
      false,
      new BN(0),
    ],
    {
      globalState: generalParameters.globalState,
      userAccount: user.publicKey,
      mint: tokenData.mint,
      userVault: userMockTokenVault,
      systemProgram: generalParameters.systemProgram,
    },
    [user]
  );
  return userMockTokenVault;
}

async function depositAmount(
  generalParameters,
  tokenData,
  depositAmount,
  user,
  userVault,
  userMockToken
) {
  await programCall(
    generalParameters.superLiquidityProgram,
    "deposit",
    [depositAmount],
    {
      userAccount: user.publicKey,
      userVault: userVault,
      tokenStoreAuthority: generalParameters.tokenStoreAuthority,
      mint: tokenData.mint,
      getTokenFrom: userMockToken,
      getTokenFromAuthority: user.publicKey,
      tokenStorePda: tokenData.store,
      systemProgram: generalParameters.systemProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    [user]
  );
}

async function selectSwappers(
  superLiquidityProgram,
  mintBuyPosition,
  mintSellPosition,
  tokenBuyPrice,
  amount,
  desiredAmount
) {
  let mintVaults = await superLiquidityProgram.account.userVault.all();
  // console.log("desiredAmount: ", desiredAmount / 10 ** 9);

  console.log("1.", mintVaults.length);
  mintVaults = mintVaults.filter((vault, index) => {
    let mintBuyVault = vault.account.vaults[mintBuyPosition];
    let mintSellVault = vault.account.vaults[mintSellPosition];

    // console.log("mintBuyVault.amount: ", mintBuyVault.amount / 10 ** 9);
    // console.log("mintSellVault.amount: ", mintSellVault.amount / 10 ** 9);
    // console.log(mintSellVault.receiveStatus);
    // console.log(mintBuyVault.provideStatus);
    // console.log(
    //   !mintBuyVault.limitPriceStatus ||
    //     tokenBuyPrice.gt(mintBuyVault.limitPrice)
    // );
    // console.log(mintSellVault.amount.add(amount).lte(mintSellVault.max));
    // console.log(mintBuyVault.amount.gte(desiredAmount));
    // console.log(mintBuyVault.amount.sub(desiredAmount).gte(mintBuyVault.min));

    return (
      mintSellVault.receiveStatus &&
      mintBuyVault.provideStatus &&
      (!mintBuyVault.limitPriceStatus ||
        tokenBuyPrice.gt(mintBuyVault.limitPrice)) &&
      mintSellVault.amount.add(amount).lte(mintSellVault.max) &&
      mintBuyVault.amount.gte(desiredAmount) &&
      mintBuyVault.amount.sub(desiredAmount).gte(mintBuyVault.min)
    );
  });

  console.log("2.", mintVaults.length);

  // console.log("S1:")
  // mintVaults.map(vault => {
  //   console.log("Base58", vault.account.user.toBase58())
  //   console.log("Amount", vault.account.amount)
  //   console.log("Timestamp", vault.account.timestamp)
  //   console.log("Fee", vault.account.buyFee + vault.account.sellFee)
  // })

  mintVaults = sort(mintVaults, mintSellPosition);

  // console.log("S2:")
  // mintVaults.map(vault => {
  //   console.log("Base58", vault.account.user.toBase58())
  //   console.log("Amount", vault.account.amount)
  //   console.log("Timestamp", vault.account.timestamp)
  //   console.log("Fee", vault.account.buyFee + vault.account.sellFee)
  // })

  // console.log("1.", mintVaults.length)
  // const parts = new anchor.BN(10)
  // let sum = new anchor.BN(0)
  // mintVaults = mintVaults.filter(vault => {
  //   let result = true
  //   result &= vault.account.amount - amount.div(parts) >= vault.account.min

  //   if(result) {
  //     let userPart = vault.account.amount - vault.account.min
  //     sum = sum.add(userPart)
  //   }
  //   return result
  // })
  // console.log("2.", mintVaults.length)

  return mintVaults.map((vault) => vault.publicKey);
}

function sort(mintVaults, mintSellPosition) {
  mintVaults.sort(function (accVault1, accVault2) {
    const vault1 = accVault1.account.vaults[mintSellPosition];
    const vault2 = accVault2.account.vaults[mintSellPosition];
    const vault1Fee = vault1.buyFee + vault1.sellFee;
    const vault2Fee = vault2.buyFee + vault2.sellFee;
    if (vault1Fee !== vault2Fee) {
      // The user with less fee should be first
      return vault1Fee - vault2Fee;
    }
    const amountWeight = new anchor.BN(1);
    const timeWeight = new anchor.BN(1);
    const now = new anchor.BN(new Date().getTime() / 1000); // In seconds
    const user1Score =
      vault1.amount * amountWeight + (now - vault1.timestamp) * timeWeight;
    const user2Score =
      vault2.amount * amountWeight + (now - vault2.timestamp) * timeWeight;
    // The user with higher score should be first
    return user2Score - user1Score;
  });
  return mintVaults;
}

module.exports = {
  createLiquidityProviderUser,
  initializeUserVault,
  selectSwappers,
};
