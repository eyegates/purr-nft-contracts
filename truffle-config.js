const HDWalletProvider = require("@truffle/hdwallet-provider");
require("dotenv").config();

module.exports = {
  plugins: ["truffle-plugin-verify"],
  api_keys: {
    bscscan: `${process.env.BSCSCANAPIKEY}`,
  },
  networks: {
    development: {
      host: "127.0.0.1", // Localhost (default: none)
      port: 7545, // Standard Ethereum port (default: none)
      network_id: "*", // Any network (default: none)
    },
    bsctest: {
      provider: () =>
        new HDWalletProvider(
          `${process.env.PRIVATE_KEY}`,
          `https://data-seed-prebsc-1-s1.binance.org:8545/`
        ),
      network_id: 97,
      gas: 5500000,
      confirmations: 1,
      timeoutBlocks: 200,
      skipDyRun: true,
    },
    bscmain: {
      provider: () =>
        new HDWalletProvider(
          `${process.env.PRIVATE_KEY}`,
          `https://speedy-nodes-nyc.moralis.io/${process.env.PROVIDER_KEY}/bsc/mainnet`
        ),
      network_id: 56,
      confirmations: 1,
      timeoutBlocks: 200,
      skipDyRun: true,
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.4", // Fetch exact version from solc-bin (default: truffle's version)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled: false to enabled: true
  //
  // Note: if you migrated your contracts prior to enabling this field in your Truffle project and want
  // those previously migrated contracts available in the .db directory, you will need to run the following:
  // $ truffle migrate --reset --compile-all

  db: {
    enabled: false,
  },
};
