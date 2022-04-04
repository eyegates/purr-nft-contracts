const NFTMarket = artifacts.require("NFTMarket");
const { upgradeProxy } = require("@openzeppelin/truffle-upgrades");

module.exports = async function (deployer) {
  if (process.env.UPGRADE === "true") {
    const existing = await NFTMarket.deployed();
    const instance = await upgradeProxy(
      "0x1482B44Fd7450f54Ff646e6b8AC5f35605a94f00",
      NFTMarket,
      { deployer }
    );
    console.log("Upgraded", instance.address);
  }
};
