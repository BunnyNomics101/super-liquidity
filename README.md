# super-liquidity
delphor-finance super-liquidity backend

### To deploy:
solana program deploy ./target/deploy/<PROGRAM>.so --program-id <PROGRAM-ID>

### To run the feeder:
First you need a .secret file with the privatekey of the authorized wallet for the delphor-oracle
```
tsc
cd dist
node feeder.js
```