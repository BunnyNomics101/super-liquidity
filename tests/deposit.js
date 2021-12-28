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

    it("Create test tokens", async() => {

    })
})