const anchor = require('@project-serum/anchor');
const assert = require('assert');

const {
	TOKEN_PROGRAM_ID,
	getTokenAccount,
	createMint,
	createTokenAccount,
	mintToAccount,
} = require("./utils");

describe('deposit', () => {
    anchor.setProvider(anchor.Provider.env());

    const program = anchor.workspace.SuperLiquidity;

    let programSigner; 
    let usdcMint, userUsdc, vaultUsdc, userData;
    let amount;

    it("Create test tokens", async() => {
        // Create USDC mint
        usdcMint = await createMint(program.provider, program.provider.wallet.PublicKey);

        /*
        // program signer PDA - sign transactions for the program
        const [_programSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
            [usdcMint.toBuffer()],
            program.programId
        )
        programSigner = _programSigner;
        */

        userUsdc = await createTokenAccount(program.provider, usdcMint, program.provider.wallet.publicKey);

        // Associated account PDA - store user data
        /*
        userData = await anchor.web3.PublicKey.findProgramAddress(
            [userUsdc.toBase58()],
            program.programId);
        */
        userData = await program.account.userCoinVault.associatedAddress(
            program.provider.wallet.publicKey,
            usdcMint);

        amount = new anchor.BN(5 * 10 ** 6)
        // Create user and program token accounts
        await mintToAccount(program.provider, usdcMint, userUsdc, amount,
                            program.provider.wallet.publicKey);

        let userUsdcData = await getTokenAccount(program.provider, userUsdc);
        assert.ok(userUsdcData.amount.eq(amount));

        vaultUsdc = await createTokenAccount(program.provider, usdcMint, program.programId);
    
        /*
        msolMint = await createMint(program.provider, programSigner);
        usermSol = await createTokenAccount(program.provider, msolMint, program.provider.wallet.publicKey);
        */
    })

    // TODO: Make deposits work.
    // Current error: "Error: 3007: The given account is owned by a different program than expected"
    xit("Deposit tokens", async() => {
        await program.rpc.deposit(amount, {
            accounts: {
                coinVault: vaultUsdc,
                getTokenFrom: userUsdc,
                getTokenFromAuthority: program.provider.wallet.publicKey,
                tokenStorePda: userData,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY, 
            },
        })
    })
})