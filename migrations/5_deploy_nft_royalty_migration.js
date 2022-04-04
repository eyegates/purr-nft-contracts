const NFTRoyaltyToken = artifacts.require("NFTRoyaltyToken");

module.exports = async function (deployer) {
  await deployer.deploy(
    NFTRoyaltyToken,
    "0xE691460649e8CfB725917c3D681727566c578d15"
  );
};
