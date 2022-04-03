const NFTToken = artifacts.require("NFTToken");
const NFTMarket = artifacts.require("NFTMarket");
const Token = artifacts.require("GoldToken");
const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const { BN, constants, time } = require("@openzeppelin/test-helpers");

require("chai").use(require("chai-as-promised")).should();
const { ZERO_ADDRESS } = constants;
const setMarket = async (feeAddress, feePercentage) =>
  await deployProxy(NFTMarket, [feeAddress, feePercentage]);

const prepareMarketItem = async (
  nftToken,
  tokenId,
  price,
  currency,
  auction,
  publisher,
  minimumOffer,
  duration,
  minter
) => {
  await nftToken.createToken(tokenId, "http://tokenuri", { from: minter });

  return {
    nft: nftToken,
    tokenId,
    price,
    currency,
    auction,
    publisher,
    minimumOffer,
    duration,
  };
};

contract(
  "NFTMarket",
  async ([
    deployer,
    nftOwner,
    user,
    bidder,
    anotherBidder,
    feeAddress,
    nofunds,
    author1,
    author2,
    author3,
  ]) => {
    describe("deployment", () => {
      let market;
      beforeEach(async () => {
        market = await setMarket(feeAddress, 1250);
      });

      describe("Proxy", () => {
        it("has a feeAddress", async () => {
          const fee = await market.feeAddress();
          fee.should.equal(feeAddress);
        });

        it("has a default fee percentage", async () => {
          const feePercentage = await market.defaultFee();
          feePercentage.toString().should.equal("1250");
        });
      });
    });

    describe("Create and remove Market Item", () => {
      let market;
      let marketItem;
      let result;
      let nftContract;
      let token;
      const price = web3.utils.toWei("1", "ether");
      let tokenId = Date.now();

      before(async () => {
        token = await Token.deployed();
        await token.transfer(user, web3.utils.toWei("100", "ether"), {
          from: deployer,
        });
        await token.transfer(bidder, web3.utils.toWei("100", "ether"), {
          from: deployer,
        });
        await token.transfer(anotherBidder, web3.utils.toWei("100", "ether"), {
          from: deployer,
        });
        market = await setMarket(feeAddress, 1250);
        await token.approve(
          market.address,
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          { from: user }
        );
        await token.approve(
          market.address,
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          { from: bidder }
        );
        await token.approve(
          market.address,
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          { from: anotherBidder }
        );
        nftContract = await NFTToken.new(market.address);
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          false,
          true,
          0,
          0,
          nftOwner
        );

        result = await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );
      });

      it("emit MarketItemCreated event", () => {
        result.logs[0].event.should.equal("MarketItemCreated");
        result.logs[0].args.nftContract.should.equal(marketItem.nft.address);
        result.logs[0].args.tokenId
          .toString()
          .should.equal(marketItem.tokenId.toString());
        result.logs[0].args.offeror.should.equal(nftOwner);
        result.logs[0].args.owner.should.equal(ZERO_ADDRESS);
        result.logs[0].args.price
          .toString()
          .should.equal(marketItem.price.toString());
        result.logs[0].args.currency.should.equal(marketItem.currency);
        result.logs[0].args.isAuction.should.equal(marketItem.auction);
        result.logs[0].args.minimumOffer
          .toString()
          .should.equal(marketItem.minimumOffer.toString());
        result.logs[0].args.duration
          .toString()
          .should.equal(marketItem.duration.toString());
      });

      it("tranfers ownership to the market place smart contract", async () => {
        const owner = await nftContract.ownerOf(marketItem.tokenId);
        owner.should.equal(market.address);
      });

      it("can retrieve a market item with its token id", async () => {
        const item = await market.getMarketItem(tokenId);
        item.tokenId.toString().should.equal(tokenId.toString());
      });

      it("rejects when token id does not exist", async () => {
        await market
          .getMarketItem(1234)
          .should.be.rejectedWith("TokenId not found in the market");
      });

      it("returns market items", async () => {
        result = await market.fetchMarketItems();
        result.length.should.equal(1);
      });

      it("can remove a market item with its token id", async () => {
        await market
          .removeMarketItem(tokenId, nftContract.address, { from: user })
          .should.be.rejectedWith(
            "removeMarketItem : you are not the offeror of the NFT"
          );
        result = await market.removeMarketItem(tokenId, nftContract.address, {
          from: nftOwner,
        });

        result.logs[0].event.should.equal("MarketItemRemoved");
        result.logs[0].args.nftContract.should.equal(nftContract.address);
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());

        result = await market.fetchMarketItems();
        result.length.should.equal(0);

        result = await market.fetchMyListedNFTs({ from: nftOwner });
        result.length.should.equal(0);

        result = await market.fetchMyNFTs({ from: nftOwner });
        result.length.should.equal(1);

        const owner = await nftContract.ownerOf(marketItem.tokenId);
        owner.should.equal(nftOwner);

        result = await market.getMarketItem(tokenId);
        result.tokenId.toString().should.equal(tokenId.toString());
        result.owner.should.equal(nftOwner);
      });

      it("creates a sale and transfer funds and nft to the receipients", async () => {
        result = await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        const userBalanceBeforeSale = await token.balanceOf(user);
        const feeBalanceBeforeSale = await token.balanceOf(feeAddress);
        const ownerBalanceBeforeSale = await token.balanceOf(nftOwner);

        await market
          .bid(tokenId, web3.utils.toWei("0.2", "ether"), { from: bidder })
          .should.be.rejectedWith("bid: this NFT is not auctionable");
        await market.createMarketSale(tokenId, { from: nofunds }).should.be
          .rejected;
        result = await market.createMarketSale(tokenId, { from: user });
        result.logs[0].event.should.equal("MarketItemSold");
        result.logs[0].args.owner.should.equal(nftOwner);
        result.logs[0].args.buyer.should.equal(user);
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());

        const owner = await nftContract.ownerOf(tokenId);
        owner.should.equal(user);

        let fee = new BN(price).mul(new BN(1250)).div(new BN(10000));
        let amount = new BN(price).sub(fee);
        let expectedUserBalance = new BN(userBalanceBeforeSale)
          .sub(amount)
          .sub(fee);
        let expectedFeeBalance = new BN(feeBalanceBeforeSale).add(fee);
        let expectedOwnerBalance = new BN(ownerBalanceBeforeSale).add(amount);
        const ownerBalanceAfterSale = await token.balanceOf(nftOwner);
        const userBalanceAfterSale = await token.balanceOf(user);
        const feeBalanceAfterSale = await token.balanceOf(feeAddress);

        feeBalanceAfterSale
          .toString()
          .should.equal(expectedFeeBalance.toString());
        userBalanceAfterSale
          .toString()
          .should.equal(expectedUserBalance.toString());
        ownerBalanceAfterSale
          .toString()
          .should.equal(expectedOwnerBalance.toString());

        const myNfts = await market.fetchMyNFTs({ from: user });
        myNfts.length.should.equal(1);
        myNfts[0].tokenId.should.equal(tokenId.toString());
      });

      it("creates an auction marketItem and emit MarketItemCreated + OfferUpdated events", async () => {
        tokenId = Date.now();
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(5));
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          duration,
          nftOwner
        );
        await market
          .createMarketItem(
            marketItem.nft.address,
            marketItem.tokenId,
            marketItem.price,
            marketItem.currency,
            marketItem.auction,
            marketItem.publisher,
            0,
            marketItem.duration,
            { from: nftOwner }
          )
          .should.be.rejectedWith(
            "createMarketItem: minimum offer must be at least 1 wei"
          );
        result = await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        result.logs[0].event.should.equal("MarketItemCreated");
        result.logs[0].args.nftContract.should.equal(marketItem.nft.address);
        result.logs[0].args.tokenId
          .toString()
          .should.equal(marketItem.tokenId.toString());
        result.logs[0].args.offeror.should.equal(nftOwner);
        result.logs[0].args.owner.should.equal(ZERO_ADDRESS);
        result.logs[0].args.price
          .toString()
          .should.equal(marketItem.price.toString());
        result.logs[0].args.currency.should.equal(marketItem.currency);
        result.logs[0].args.isAuction.should.equal(marketItem.auction);
        result.logs[0].args.minimumOffer
          .toString()
          .should.equal(marketItem.minimumOffer.toString());
        result.logs[0].args.duration
          .toString()
          .should.equal(marketItem.duration.toString());

        result.logs[1].event.should.equal("OfferUpdated");
        result.logs[1].args.tokenId
          .toString()
          .should.equal(marketItem.tokenId.toString());
        result.logs[1].args.offeror.should.equal(nftOwner);
        result.logs[1].args.minimumOffer
          .toString()
          .should.equal(marketItem.minimumOffer.toString());
        result.logs[1].args.invitedBidder.toString().should.equal(ZERO_ADDRESS);
      });

      it("rejects bid lower than minimum offer", async () => {
        await market
          .bid(tokenId, web3.utils.toWei("0.09", "ether"), { from: bidder })
          .should.be.rejectedWith("Bid too low");
      });

      it("accept bid when amount higher than minimum offer and highest bid", async () => {
        const bid = web3.utils.toWei("0.2", "ether");
        const bidderBalanceBefore = await token.balanceOf(bidder);
        result = await market.bid(tokenId, bid, { from: bidder });
        const marketBalance = await token.balanceOf(market.address);
        const bidderBalanceAfter = await token.balanceOf(bidder);
        const expextedBidderBalance = new BN(bidderBalanceBefore).sub(
          new BN(bid)
        );
        marketBalance.toString().should.equal(bid.toString());
        bidderBalanceAfter
          .toString()
          .should.equal(expextedBidderBalance.toString());

        result.logs[0].event.should.equal("BidUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.bidder.should.equal(bidder);
        result.logs[0].args.lockedBid.toString().should.equal(bid.toString());
      });

      it("accepts bid when highest bidder bids more and refund the previous bid amount", async () => {
        const previousBid = new BN(web3.utils.toWei("0.2", "ether"));
        const bid = new BN(web3.utils.toWei("0.3", "ether"));
        const bidderBalanceBefore = await token.balanceOf(bidder);
        await market
          .bid(tokenId, previousBid, { from: bidder })
          .should.be.rejectedWith("Bid lower than the highest bid");
        result = await market.bid(tokenId, bid, { from: bidder });
        const marketBalance = await token.balanceOf(market.address);
        const bidderBalanceAfter = await token.balanceOf(bidder);
        const expextedBidderBalance = new BN(bidderBalanceBefore)
          .add(previousBid)
          .sub(bid);
        marketBalance.toString().should.equal(bid.toString());
        bidderBalanceAfter
          .toString()
          .should.equal(expextedBidderBalance.toString());

        result.logs[0].event.should.equal("BidUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.bidder.should.equal(bidder);
        result.logs[0].args.lockedBid.toString().should.equal(bid.toString());
      });

      it("reverts when removing a market item with an active bid", async () => {
        result = await market
          .removeMarketItem(tokenId, nftContract.address, { from: nftOwner })
          .should.be.rejectedWith(
            "An auction on this NFT is running and has active bid. Cancel the auction before removing this item from the market"
          );
      });

      it("accepts bid when bidder bids more than highest bidder and refund the highest bid amount to the old highest bidder", async () => {
        const highestBid = new BN(web3.utils.toWei("0.3", "ether"));
        const bid = new BN(web3.utils.toWei("0.4", "ether"));
        const bidderBalanceBefore = await token.balanceOf(bidder);
        let anotherBidderBalanceBefore = await token.balanceOf(anotherBidder);
        result = await market.bid(tokenId, bid, { from: anotherBidder });
        let marketBalance = await token.balanceOf(market.address);
        let anotherBidderBalanceAfter = await token.balanceOf(anotherBidder);
        const bidderBalanceAfter = await token.balanceOf(bidder);
        let expextedAnotherBidderBalance = new BN(
          anotherBidderBalanceBefore
        ).sub(bid);
        const expextedBidderBalance = new BN(bidderBalanceBefore).add(
          highestBid
        );
        marketBalance.toString().should.equal(bid.toString());
        bidderBalanceAfter
          .toString()
          .should.equal(expextedBidderBalance.toString());
        anotherBidderBalanceAfter
          .toString()
          .should.equal(expextedAnotherBidderBalance.toString());

        result.logs[0].event.should.equal("BidUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.bidder.should.equal(anotherBidder);
        result.logs[0].args.lockedBid.toString().should.equal(bid.toString());

        await market
          .revokeBid(tokenId, { from: bidder })
          .should.be.rejectedWith(
            "revoke Bid: Only the bidder may revoke their bid"
          );
        anotherBidderBalanceBefore = await token.balanceOf(anotherBidder);
        result = await market.revokeBid(tokenId, { from: anotherBidder });
        marketBalance = await token.balanceOf(market.address);
        anotherBidderBalanceAfter = await token.balanceOf(anotherBidder);
        expextedAnotherBidderBalance = new BN(anotherBidderBalanceBefore).add(
          bid
        );
        anotherBidderBalanceAfter
          .toString()
          .should.equal(expextedAnotherBidderBalance.toString());
        marketBalance.toString().should.equal("0");

        result.logs[0].event.should.equal("BidUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.bidder.should.equal(ZERO_ADDRESS);
        result.logs[0].args.lockedBid.toString().should.equal("0");

        const bidIncrease = new BN(web3.utils.toWei("0.1", "ether"));
        const lockedBid = bid.add(bidIncrease);
        await market.bid(tokenId, bid, { from: anotherBidder }).should.be
          .fulfilled;
        anotherBidderBalanceBefore = await token.balanceOf(anotherBidder);
        const marketBalanceBefore = await token.balanceOf(market.address);

        market
          .bidIncrease(tokenId, bidIncrease, { from: bidder })
          .should.be.rejectedWith("bidIncrease: You are not current bidder");
        market
          .bidIncrease(tokenId, 0, { from: anotherBidder })
          .should.be.rejectedWith(
            "bidIncrease: Must send value to increase bid"
          );

        result = await market.bidIncrease(tokenId, bidIncrease, {
          from: anotherBidder,
        });
        anotherBidderBalanceAfter = await token.balanceOf(anotherBidder);
        marketBalance = await token.balanceOf(market.address);
        expextedAnotherBidderBalance = new BN(anotherBidderBalanceBefore).sub(
          bidIncrease
        );
        const expectedMarketBalance = new BN(marketBalanceBefore).add(
          bidIncrease
        );
        anotherBidderBalanceAfter
          .toString()
          .should.equal(expextedAnotherBidderBalance.toString());
        marketBalance.toString().should.equal(expectedMarketBalance.toString());

        result.logs[0].event.should.equal("BidUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.bidder.should.equal(anotherBidder);
        result.logs[0].args.lockedBid
          .toString()
          .should.equal(lockedBid.toString());
      });

      it("reverts when auction period is elapsed", async () => {
        // const promise = new Promise((resolve) => setTimeout(resolve, 4000));
        // await promise;
        await time.increase(time.duration.minutes(6));

        await market
          .bid(tokenId, web3.utils.toWei("0.5", "ether"), {
            from: anotherBidder,
          })
          .should.be.rejectedWith("bid: Auction period is over for this NFT");
        await market
          .bidIncrease(tokenId, web3.utils.toWei("0.5", "ether"), {
            from: anotherBidder,
          })
          .should.be.rejectedWith(
            "bid Increase: Auction period is over for this NFT"
          );
        await market
          .revokeBid(tokenId, { from: anotherBidder })
          .should.be.rejectedWith(
            "revoke Bid: Auction period is over for this NFT"
          );
      });

      it("cancels an auction", async () => {
        tokenId = Date.now();
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(5));
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          duration,
          nftOwner
        );
        await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        await market
          .cancelAuction(tokenId, { from: user })
          .should.be.rejectedWith(
            "cancelAuction: Only offeror can cancel and auction for a token he owns"
          );

        const bid = new BN(web3.utils.toWei("0.2", "ether"));
        await market.bid(tokenId, bid, { from: bidder });
        const bidderBalanceBefore = await token.balanceOf(bidder);
        const marketBalanceBefore = await token.balanceOf(market.address);

        result = await market.cancelAuction(tokenId, { from: nftOwner });

        const bidderBalanceAfter = await token.balanceOf(bidder);
        const expextedBidderBalance = new BN(bidderBalanceBefore).add(bid);
        const marketBalanceAfter = await token.balanceOf(market.address);
        const expectedMarketBalance = new BN(marketBalanceBefore).sub(bid);
        marketBalanceAfter
          .toString()
          .should.equal(expectedMarketBalance.toString());
        bidderBalanceAfter
          .toString()
          .should.equal(expextedBidderBalance.toString());

        result.logs[0].event.should.equal("OfferUpdated");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.offeror.should.equal(ZERO_ADDRESS);
        result.logs[0].args.minimumOffer.toString().should.equal("0");
        result.logs[0].args.invitedBidder.toString().should.equal(ZERO_ADDRESS);
      });

      it("cancel auction reverts when auction period is elapsed", async () => {
        tokenId = Date.now();
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          0,
          nftOwner
        );
        await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        await market
          .cancelAuction(tokenId, { from: nftOwner })
          .should.be.rejectedWith(
            "cancelAuction: Auction period is over for this NFT"
          );
      });

      it("closes an auction reverts when auction is running", async () => {
        tokenId = Date.now();
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(5));
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          duration,
          nftOwner
        );
        market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        // Close auction without bids on it
        await market
          .closeAuction(tokenId, { from: nftOwner })
          .should.be.rejectedWith("closeAuction: Auction period is running");
      });

      it("closes an auction reverts when auction has no bid or non offeror tries to close", async () => {
        tokenId = Date.now();
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(-2));
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          duration,
          nftOwner
        );
        market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        // Close auction without bids on it
        await market
          .closeAuction(tokenId, { from: nftOwner })
          .should.be.rejectedWith("closeAuction: This auction has no bid.");
        await market
          .closeAuction(tokenId, { from: user })
          .should.be.rejectedWith(
            "closeAuction: Only offeror can cancel and auction for a token he owns"
          );
      });

      it("closes an auction transfer funds to fee address and offeror, transfer nft to bidder and emit events", async () => {
        const bid = web3.utils.toWei("0.2", "ether");
        tokenId = Date.now();
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(5));
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          true,
          true,
          web3.utils.toWei("0.1", "ether"),
          duration,
          nftOwner
        );
        market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        const offerorBalanceBefore = await token.balanceOf(nftOwner);
        const bidderBalanceBefore = await token.balanceOf(bidder);
        const feeBalanceBefore = await token.balanceOf(feeAddress);
        await market.bid(tokenId, bid, { from: bidder });
        let owner = await nftContract.ownerOf(tokenId);
        owner.should.equal(market.address);
        const marketBalanceBefore = await token.balanceOf(market.address);

        await time.increase(time.duration.minutes(6));
        // Clause auction without bids on it
        result = await market.closeAuction(tokenId, { from: nftOwner });

        owner = await nftContract.ownerOf(tokenId);
        owner.should.equal(bidder);
        let fee = new BN(bid).mul(new BN(1250)).div(new BN(10000));

        const bidderBalanceAfter = await token.balanceOf(bidder);
        const feeBalanceAfter = await token.balanceOf(feeAddress);
        const marketBalanceAfter = await token.balanceOf(market.address);
        const offerorBalanceAfter = await token.balanceOf(nftOwner);
        const expectedFeeBalance = new BN(feeBalanceBefore).add(fee);
        const expectedbidderBalanceAfter = new BN(bidderBalanceBefore).sub(
          new BN(bid)
        );
        const expectedMarketBalanceAfter = new BN(marketBalanceBefore).sub(
          new BN(bid)
        );
        const expectedOfferorBalanceAfter = new BN(offerorBalanceBefore)
          .add(new BN(bid))
          .sub(fee);
        feeBalanceAfter.toString().should.equal(expectedFeeBalance.toString());
        bidderBalanceAfter
          .toString()
          .should.equal(expectedbidderBalanceAfter.toString());
        marketBalanceAfter
          .toString()
          .should.equal(expectedMarketBalanceAfter.toString());
        offerorBalanceAfter
          .toString()
          .should.equal(expectedOfferorBalanceAfter.toString());

        result.logs[0].event.should.equal("Traded");
        result.logs[0].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[0].args.value.toString().should.equal(bid.toString());
        result.logs[0].args.offeror.should.equal(nftOwner);
        result.logs[0].args.bidder.should.equal(bidder);

        result.logs[1].event.should.equal("BidUpdated");
        result.logs[1].args.tokenId.toString().should.equal(tokenId.toString());
        result.logs[1].args.bidder.should.equal(ZERO_ADDRESS);
        result.logs[1].args.lockedBid.toString().should.equal("0");

        result.logs[2].event.should.equal("MarketItemSold");
        result.logs[2].args.owner.should.equal(nftOwner);
        result.logs[2].args.buyer.should.equal(bidder);
        result.logs[2].args.tokenId.toString().should.equal(tokenId.toString());
      });

      it("register to a content creator and transfer funds", async () => {
        const feeBalanceBefore = await token.balanceOf(feeAddress);
        const userBalanceBefore = await token.balanceOf(user);
        const registrationPrice = new BN(web3.utils.toWei("0.5", "ether"));
        let fee = registrationPrice.mul(new BN(1250)).div(new BN(10000));
        const latest = await time.latest();
        let duration = latest.add(time.duration.minutes(5));
        let oldduration = latest.add(time.duration.minutes(-5));
        await market
          .register(0, author1, duration, token.address, {
            from: user,
          })
          .should.be.rejectedWith("Price should be greater than 0");
        result = await market
          .register(registrationPrice, author1, 0, token.address, {
            from: user,
          })
          .should.be.rejectedWith("Registration should have valid end date");
        result = await market
          .register(registrationPrice, author1, oldduration, token.address, {
            from: user,
          })
          .should.be.rejectedWith("Registration should have valid end date");
        result = await market.register(
          registrationPrice,
          author1,
          duration,
          token.address,
          { from: user }
        );

        result.logs[0].event.should.equal("Registered");
        result.logs[0].args.owner.should.equal(user);
        result.logs[0].args.price
          .toString()
          .should.equal(registrationPrice.toString());
        result.logs[0].args.creator.should.equal(author1);
        result.logs[0].args.currency.should.equal(token.address);

        const feeBalanceAfter = await token.balanceOf(feeAddress);
        const userBalanceAfter = await token.balanceOf(user);
        const expectedFeeBalance = new BN(feeBalanceBefore).add(fee);
        const expectedUserBalance = new BN(userBalanceBefore).sub(
          registrationPrice
        );

        feeBalanceAfter.toString().should.equal(expectedFeeBalance.toString());
        userBalanceAfter
          .toString()
          .should.equal(expectedUserBalance.toString());

        let registrations = await market.fetchMyRegistrations({ from: user });
        registrations.length.should.equal(1);
        registrations[0].owner.should.equal(user);
        registrations[0].creator.should.equal(author1);

        await time.increase(time.duration.minutes(10));
        registrations = await market.fetchMyRegistrations({ from: user });
        registrations.length.should.equal(0);
      });

      it("tip a creator and transfer funds", async () => {
        const feeBalanceBefore = await token.balanceOf(feeAddress);
        const userBalanceBefore = await token.balanceOf(user);
        const tipAmount = new BN(web3.utils.toWei("1", "ether"));
        let fee = tipAmount.mul(new BN(1250)).div(new BN(10000));

        await market
          .tip(0, author1, token.address, {
            from: user,
          })
          .should.be.rejectedWith("Tip: amount should be greater than 0");
        result = await market.tip(tipAmount, author1, token.address, {
          from: user,
        });

        result.logs[0].event.should.equal("Tiped");
        result.logs[0].args.donator.should.equal(user);
        result.logs[0].args.amount
          .toString()
          .should.equal(tipAmount.toString());
        result.logs[0].args.creator.should.equal(author1);
        result.logs[0].args.currency.should.equal(token.address);

        const feeBalanceAfter = await token.balanceOf(feeAddress);
        const userBalanceAfter = await token.balanceOf(user);
        const expectedFeeBalance = new BN(feeBalanceBefore).add(fee);
        const expectedUserBalance = new BN(userBalanceBefore).sub(tipAmount);

        feeBalanceAfter.toString().should.equal(expectedFeeBalance.toString());
        userBalanceAfter
          .toString()
          .should.equal(expectedUserBalance.toString());
      });

      it("creates a market item", async () => {
        const tokenId = 1234567890;

        let marketItems = await market.fetchMarketItems();
        let listedItems = await market.fetchMyListedNFTs({ from: nftOwner });
        let mynfts = await market.fetchMyNFTs({ from: nftOwner });

        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          false,
          true,
          0,
          0,
          nftOwner
        );

        result = await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        const item = await market.getMarketItem(marketItem.tokenId);
        item.tokenId.toString().should.equal(marketItem.tokenId.toString());

        await market.removeMarketItem(marketItem.tokenId, nftContract.address, {
          from: nftOwner,
        });

        result = await market.fetchMarketItems();
        result.length.should.equal(marketItems.length);

        result = await market.fetchMyListedNFTs({ from: nftOwner });
        result.length.should.equal(listedItems.length);

        result = await market.fetchMyNFTs({ from: nftOwner });
        result.length.should.equal(mynfts.length + 1);

        marketItems = await market.fetchMarketItems();
        listedItems = await market.fetchMyListedNFTs({ from: nftOwner });
        mynfts = await market.fetchMyNFTs({ from: nftOwner });

        await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        result = await market.fetchMarketItems();
        result.length.should.equal(marketItems.length + 1);

        result = await market.fetchMyListedNFTs({ from: nftOwner });
        result.length.should.equal(listedItems.length + 1);

        result = await market.fetchMyNFTs({ from: nftOwner });
        result.length.should.equal(mynfts.length - 1);
      });

      it("creates a private market item", async () => {
        const tokenId = 1234567892;

        const userBalanceBeforeSale = await token.balanceOf(bidder);
        const feeBalanceBeforeSale = await token.balanceOf(feeAddress);
        const ownerBalanceBeforeSale = await token.balanceOf(nftOwner);

        let myPrivatenfts = await market.fetchMyPrivateNFTs({ from: bidder });
        let myPrivatemarkets = await market.fetchMyPrivateMarketItems({
          from: bidder,
        });

        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          false,
          true,
          0,
          0,
          nftOwner
        );

        result = await market.createPrivateMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          bidder,
          { from: nftOwner }
        );

        const item = await market.getPrivateMarketItem(marketItem.tokenId);
        item.tokenId.toString().should.equal(marketItem.tokenId.toString());

        result = await market.fetchMyPrivateNFTs({ from: nftOwner });
        result.length.should.equal(myPrivatenfts.length);

        result = await market.fetchMyPrivateMarketItems({
          from: bidder,
        });
        result.length.should.equal(myPrivatemarkets.length + 1);

        result = await market.createPrivateMarketSale(marketItem.tokenId, {
          from: bidder,
        });

        const owner = await nftContract.ownerOf(marketItem.tokenId);
        owner.should.equal(bidder);

        let fee = new BN(marketItem.price).mul(new BN(1250)).div(new BN(10000));
        let amount = new BN(marketItem.price).sub(fee);
        let expectedUserBalance = new BN(userBalanceBeforeSale)
          .sub(amount)
          .sub(fee);
        let expectedFeeBalance = new BN(feeBalanceBeforeSale).add(fee);
        let expectedOwnerBalance = new BN(ownerBalanceBeforeSale).add(amount);
        const ownerBalanceAfterSale = await token.balanceOf(nftOwner);
        const userBalanceAfterSale = await token.balanceOf(bidder);
        const feeBalanceAfterSale = await token.balanceOf(feeAddress);

        feeBalanceAfterSale
          .toString()
          .should.equal(expectedFeeBalance.toString());
        userBalanceAfterSale
          .toString()
          .should.equal(expectedUserBalance.toString());
        ownerBalanceAfterSale
          .toString()
          .should.equal(expectedOwnerBalance.toString());

        const myNfts = await market.fetchMyPrivateNFTs({ from: bidder });
        myNfts.length.should.equal(1);
        myNfts[0].tokenId.should.equal(marketItem.tokenId.toString());

        result = await market.fetchMyPrivateMarketItems({ from: nftOwner });
        result.length.should.equal(myPrivatemarkets.length);
      });

      it("creates a sale and buyer re-sale nft", async () => {
        tokenId = Date.now();
        marketItem = await prepareMarketItem(
          nftContract,
          tokenId,
          price,
          token.address,
          false,
          true,
          0,
          0,
          nftOwner
        );

        result = await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: nftOwner }
        );

        result = await market.createMarketSale(marketItem.tokenId, {
          from: user,
        });

        const owner = await nftContract.ownerOf(marketItem.tokenId);
        owner.should.equal(user);

        let marketItems = await market.fetchMarketItems();
        let listedItems = await market.fetchMyListedNFTs({ from: user });
        let mynfts = await market.fetchMyNFTs({ from: user });

        await nftContract.setApprovalForAll(market.address, true, {
          from: user,
        });

        result = await market.createMarketItem(
          marketItem.nft.address,
          tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: user }
        );

        result = await market.getMarketItem(marketItem.tokenId);
        result.tokenId.toString().should.equal(tokenId.toString());

        await market.removeMarketItem(marketItem.tokenId, nftContract.address, {
          from: user,
        });

        result = await market.fetchMarketItems();
        result.length.should.equal(marketItems.length);

        result = await market.fetchMyListedNFTs({ from: user });
        result.length.should.equal(listedItems.length);

        result = await market.fetchMyNFTs({ from: user });
        result.length.should.equal(mynfts.length);

        marketItems = await market.fetchMarketItems();
        listedItems = await market.fetchMyListedNFTs({ from: user });
        mynfts = await market.fetchMyNFTs({ from: user });

        await market.createMarketItem(
          marketItem.nft.address,
          marketItem.tokenId,
          marketItem.price,
          marketItem.currency,
          marketItem.auction,
          marketItem.publisher,
          marketItem.minimumOffer,
          marketItem.duration,
          { from: user }
        );

        result = await market.fetchMarketItems();
        result.length.should.equal(marketItems.length + 1);

        result = await market.fetchMyListedNFTs({ from: user });
        result.length.should.equal(listedItems.length + 1);

        result = await market.fetchMyNFTs({ from: user });
        result.length.should.equal(mynfts.length - 1);
      });
    });
  }
);
