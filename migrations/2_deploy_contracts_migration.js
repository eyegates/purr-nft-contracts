const NFTToken = artifacts.require("NFTToken");
const NFTMarket = artifacts.require("NFTMarket");
const Token = artifacts.require("GoldToken");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");

module.exports = async function (deployer, network) {
  if (network === "development") {
    await deployer.deploy(Token, web3.utils.toWei("1000000000", "ether"));
  }
  if (process.env.UPGRADE === "false") {
    const instance = await deployProxy(
      NFTMarket,
      [process.env.FEE_ADDRESS, process.env.DEFAULT_FEE],
      { deployer }
    );
    await deployer.deploy(NFTToken, instance.address);
    console.log("deployed", instance.address);
  }
};
