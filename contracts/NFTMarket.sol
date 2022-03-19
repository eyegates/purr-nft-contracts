// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity 0.8.4;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract NFTMarket is Initializable, OwnableUpgradeable, PausableUpgradeable {
    struct MarketItem {
        uint256 itemId;
        address nftContract;
        uint256 tokenId;
        address offeror;
        address owner;
        uint256 price;
        address currency;
        bool isAuction;
        bool isPublisher;
        uint256 minimumOffer;
        uint256 duration;
        address bidder;
        uint256 lockedBid;
        address invitedBidder;
    }

    struct ContentOrder {
        address to;
        uint256 price;
        address creator;
        uint256 OrderEnds;
        uint256 tokenId;
        address nftContract;
        address currency;
    }

    struct Plan {
        address owner;
        uint256 price;
        address creator;
        uint256 endDate;
        address currency;
        uint256 timestamp;
    }

    using Counters for Counters.Counter;
    Counters.Counter private _itemIds;
    Counters.Counter private _itemsSold;
    Counters.Counter private _itemsRemoved;

    address public feeAddress;
    event FeeAddressUpdated(address oldAddress, address newAddress);
    uint32 public defaultFee;
    event DefaultFeeUpdated(uint32 oldFee, uint32 newFee);
    mapping(uint256 => MarketItem) private idToMarketItem;
    mapping(uint256 => uint256) private tokenIdToItemId;
    mapping(address => Plan[]) private registrations;
    event MarketItemCreated(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address offeror,
        address owner,
        uint256 price,
        address currency,
        bool isAuction,
        bool isPublisher,
        uint256 minimumOffer,
        uint256 duration
    );
    event MarketItemRemoved(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId
    );
    event MarketItemSold(address owner, address buyer, uint256 tokenId);

    /// @notice A token is offered for sale by owner; or such an offer is revoked
    /// @param  tokenId       which token
    /// @param  offeror       the token owner that is selling
    /// @param  minimumOffer  the amount (in Wei) that is the minimum to accept; or zero to indicate no offer
    /// @param  invitedBidder the exclusive invited buyer for this offer; or the zero address if not exclusive
    event OfferUpdated(
        uint256 indexed tokenId,
        address offeror,
        uint256 minimumOffer,
        address invitedBidder
    );

    /// @notice A new highest bid is committed for a token; or such a bid is revoked
    /// @param  tokenId   which token
    /// @param  bidder    the party that committed Ether to bid
    /// @param  lockedBid the amount (in Wei) that the bidder has committed
    event BidUpdated(
        uint256 indexed tokenId,
        address bidder,
        uint256 lockedBid
    );

    /// @notice A token is traded on the marketplace (this implies any offer for the token is revoked)
    /// @param  tokenId which token
    /// @param  value   the sale price
    /// @param  offeror the party that previously owned the token
    /// @param  bidder  the party that now owns the token
    event Traded(
        uint256 indexed tokenId,
        uint256 value,
        address indexed offeror,
        address indexed bidder
    );

    event Registered(
        address owner,
        uint256 price,
        address creator,
        uint256 endDate,
        address currency
    );

    function initialize(address _feeAddress, uint32 _defaultFee)
        public
        virtual
        initializer
    {
        __Ownable_init();
        __Pausable_init();

        feeAddress = _feeAddress;
        defaultFee = _defaultFee;
    }

    function getMarketItem(uint256 tokenId)
        public
        view
        onlyMarketItem(tokenId)
        returns (MarketItem memory)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        return idToMarketItem[itemId];
    }

    function register(
        uint256 price,
        address creator,
        uint256 endDate,
        address currency
    ) public whenNotPaused {
        require(
            endDate > 0 && endDate > block.timestamp,
            "Registration should have valid end date"
        );
        require(price > 0, "Price should be greater than 0");

        address owner = msg.sender;
        // compute fee amount
        uint256 fee = (price * defaultFee) / 10000;
        //compute owner sale amount
        uint256 amount = price - fee;

        // Transfer the owner amount
        IERC20(currency).transferFrom(owner, creator, amount);
        // Transfer the fee amount
        IERC20(currency).transferFrom(owner, feeAddress, fee);

        registrations[owner].push(
            Plan(owner, price, creator, endDate, currency, 0)
        );
        emit Registered(owner, price, creator, endDate, currency);
    }

    function fetchMyRegistrations() public view returns (Plan[] memory) {
        uint256 totalItemCount = registrations[msg.sender].length;
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (registrations[msg.sender][i].endDate > block.timestamp) {
                itemCount += 1;
            }
        }

        Plan[] memory items = new Plan[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (registrations[msg.sender][i].endDate > block.timestamp) {
                Plan storage currentItem = registrations[msg.sender][i];
                items[currentIndex] = currentItem;
                items[currentIndex].timestamp = block.timestamp;
                currentIndex += 1;
            }
        }
        return items;
    }

    function createMarketItem(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        address currency,
        bool isAuction,
        bool isPublisher,
        uint256 minimumOffer,
        uint256 duration
    ) external whenNotPaused {
        require(price > 0, "Price must be at least 1 wei");
        require(
            msg.sender == IERC721(nftContract).ownerOf(tokenId),
            "Only the token owner can offer"
        );

        _itemIds.increment();
        uint256 itemId = _itemIds.current();
        tokenIdToItemId[tokenId] = itemId;
        idToMarketItem[itemId] = MarketItem(
            itemId,
            nftContract,
            tokenId,
            msg.sender,
            address(0),
            price,
            currency,
            isAuction,
            isPublisher,
            minimumOffer,
            duration,
            address(0),
            0,
            address(0)
        );

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit MarketItemCreated(
            itemId,
            nftContract,
            tokenId,
            msg.sender,
            address(0),
            price,
            currency,
            isAuction,
            isPublisher,
            minimumOffer,
            duration
        );

        if (isAuction) {
            require(
                minimumOffer > 0,
                "createMarketItem: minimum offer must be at least 1 wei"
            );
            emit OfferUpdated(tokenId, msg.sender, minimumOffer, address(0));
        }
    }

    function removeMarketItem(uint256 tokenId, address nftContract)
        public
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        require(
            idToMarketItem[itemId].offeror == msg.sender,
            "removeMarketItem : you are not the offeror of the NFT"
        );
        require(
            idToMarketItem[itemId].lockedBid <= 0 &&
                idToMarketItem[itemId].bidder == address(0),
            "An auction on this NFT is running and has active bid. Cancel the auction before removing this item from the market"
        );
        idToMarketItem[itemId].owner = msg.sender;
        idToMarketItem[itemId].offeror = address(0);
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);
        _itemsRemoved.increment();
        emit MarketItemRemoved(itemId, nftContract, tokenId);
    }

    function createMarketSale(uint256 tokenId)
        public
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        uint256 price = idToMarketItem[itemId].price;
        address offeror = idToMarketItem[itemId].offeror;
        address currency = idToMarketItem[itemId].currency;
        address nftContract = idToMarketItem[itemId].nftContract;
        address buyer = msg.sender;

        // compute fee amount
        uint256 fee = (price * defaultFee) / 10000;
        //compute owner sale amount
        uint256 amount = price - fee;

        // Transfer the owner amount
        IERC20(currency).transferFrom(buyer, offeror, amount);
        // Transfer the fee amount
        IERC20(currency).transferFrom(buyer, feeAddress, fee);

        // transfer the NFT to the buyer
        IERC721(nftContract).transferFrom(address(this), buyer, tokenId);
        idToMarketItem[itemId].owner = buyer;
        idToMarketItem[itemId].offeror = address(0);
        idToMarketItem[itemId].minimumOffer = 0;
        idToMarketItem[itemId].invitedBidder = address(0);
        _itemsSold.increment();

        emit MarketItemSold(offeror, buyer, tokenId);
    }

    function closeAuction(uint256 tokenId)
        public
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        require(
            block.timestamp > idToMarketItem[itemId].duration,
            "closeAuction: Auction period is running"
        );
        require(
            msg.sender == idToMarketItem[itemId].offeror,
            "closeAuction: Only offeror can cancel and auction for a token he owns"
        );
        require(
            idToMarketItem[itemId].bidder != address(0),
            "closeAuction: This auction has no bid."
        );
        uint256 highestBid = idToMarketItem[itemId].lockedBid;
        address offeror = idToMarketItem[itemId].offeror;
        address bidder = idToMarketItem[itemId].bidder;

        _doTrade(itemId, highestBid, offeror, bidder);
        _setBid(itemId, address(0), 0);
        _itemsSold.increment();
        emit MarketItemSold(offeror, bidder, tokenId);
    }

    /// @dev Collect fee for owner & offeror and transfer underlying asset. The Traded event emits before the
    ///      ERC721.Transfer event so that somebody observing the events and seeing the latter will recognize the
    ///      context of the former. The bid is NOT cleaned up generally in this function because a circumstance exists
    ///      where an existing bid persists after a trade. See "context 3" above.
    function _doTrade(
        uint256 itemId,
        uint256 value,
        address offeror,
        address bidder
    ) private {
        // Divvy up proceeds
        uint256 feeAmount = (value * defaultFee) / 10000; // reverts on overflow
        uint256 bidderAmount = value - feeAmount;
        IERC20(idToMarketItem[itemId].currency).transfer(feeAddress, feeAmount);
        IERC20(idToMarketItem[itemId].currency).transfer(offeror, bidderAmount);

        emit Traded(idToMarketItem[itemId].tokenId, value, offeror, bidder);
        idToMarketItem[itemId].offeror = address(0);
        idToMarketItem[itemId].minimumOffer = 0;
        idToMarketItem[itemId].invitedBidder = address(0);
        idToMarketItem[itemId].owner = bidder;
        IERC721(idToMarketItem[itemId].nftContract).transferFrom(
            address(this),
            bidder,
            idToMarketItem[itemId].tokenId
        );
    }

    function fetchMarketItems() public view returns (MarketItem[] memory) {
        uint256 itemCount = _itemIds.current();
        uint256 unsoldItemCount = _itemIds.current() -
            _itemsSold.current() -
            _itemsRemoved.current();
        uint256 currentIndex = 0;

        MarketItem[] memory items = new MarketItem[](unsoldItemCount);
        for (uint256 i = 0; i < itemCount; i++) {
            if (idToMarketItem[i + 1].owner == address(0)) {
                uint256 currentId = idToMarketItem[i + 1].itemId;
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }

        return items;
    }

    function fetchMyListedNFTs() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (idToMarketItem[i + 1].offeror == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (idToMarketItem[i + 1].offeror == msg.sender) {
                uint256 currentId = idToMarketItem[i + 1].itemId;
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }

        return items;
    }

    function fetchMyNFTs() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (idToMarketItem[i + 1].owner == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (idToMarketItem[i + 1].owner == msg.sender) {
                uint256 currentId = idToMarketItem[i + 1].itemId;
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }

        return items;
    }

    function cancelAuction(uint256 tokenId)
        public
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        require(
            block.timestamp <= idToMarketItem[itemId].duration,
            "cancelAuction: Auction period is over for this NFT"
        );
        require(
            msg.sender == idToMarketItem[itemId].offeror,
            "cancelAuction: Only offeror can cancel and auction for a token he owns"
        );

        address bidder = idToMarketItem[itemId].bidder;
        uint256 lockedBid = idToMarketItem[itemId].lockedBid;
        address currency = idToMarketItem[itemId].currency;

        if (bidder != address(0)) {
            // Refund the current bidder
            IERC20(currency).transfer(bidder, lockedBid);
        }
        _setOffer(itemId, address(0), 0, address(0));
    }

    /// @notice An bidder may revoke their bid
    /// @param  tokenId which token
    function revokeBid(uint256 tokenId)
        external
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        require(
            block.timestamp <= idToMarketItem[itemId].duration,
            "revoke Bid: Auction period is over for this NFT"
        );
        require(
            msg.sender == idToMarketItem[itemId].bidder,
            "revoke Bid: Only the bidder may revoke their bid"
        );
        address currency = idToMarketItem[itemId].currency;
        address existingBidder = idToMarketItem[itemId].bidder;
        uint256 existingLockedBid = idToMarketItem[itemId].lockedBid;
        IERC20(currency).transfer(existingBidder, existingLockedBid);
        _setBid(itemId, address(0), 0);
    }

    /// @notice Anyone may commit more than the existing bid for a token.
    /// @param  tokenId which token
    function bid(uint256 tokenId, uint256 amount)
        external
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        uint256 existingLockedBid = idToMarketItem[itemId].lockedBid;
        uint256 minimumOffer = idToMarketItem[itemId].minimumOffer;
        require(
            idToMarketItem[itemId].isAuction,
            "bid: this NFT is not auctionable"
        );
        require(
            block.timestamp <= idToMarketItem[itemId].duration,
            "bid: Auction period is over for this NFT"
        );
        require(amount >= minimumOffer, "Bid too low");
        require(amount > existingLockedBid, "Bid lower than the highest bid");
        address existingBidder = idToMarketItem[itemId].bidder;
        address currency = idToMarketItem[itemId].currency;

        IERC20(currency).transferFrom(msg.sender, address(this), amount);
        if (existingBidder != address(0)) {
            IERC20(currency).transfer(existingBidder, existingLockedBid);
        }
        _setBid(itemId, msg.sender, amount);
    }

    /// @notice Anyone may add more value to their existing bid
    /// @param  tokenId which token
    function bidIncrease(uint256 tokenId, uint256 amount)
        external
        whenNotPaused
        onlyMarketItem(tokenId)
    {
        uint256 itemId = tokenIdToItemId[tokenId];
        require(
            block.timestamp <= idToMarketItem[itemId].duration,
            "bid Increase: Auction period is over for this NFT"
        );
        require(amount > 0, "bidIncrease: Must send value to increase bid");
        require(
            msg.sender == idToMarketItem[itemId].bidder,
            "bidIncrease: You are not current bidder"
        );
        uint256 newBidAmount = idToMarketItem[itemId].lockedBid + amount;
        address currency = idToMarketItem[itemId].currency;

        IERC20(currency).transferFrom(msg.sender, address(this), amount);
        idToMarketItem[itemId].lockedBid = newBidAmount;
        _setBid(itemId, msg.sender, newBidAmount);
    }

    /// @notice The owner can set the fee portion
    /// @param  newFeePortion the transaction fee (in basis points) as a portion of the sale price
    function setFeePortion(uint32 newFeePortion) external onlyOwner {
        require(newFeePortion >= 0, "Exceeded maximum fee portion of 10%");
        defaultFee = newFeePortion;
    }

    /// @dev Set and emit new offer
    function _setOffer(
        uint256 itemId,
        address offeror,
        uint256 minimumOffer,
        address invitedBidder
    ) private {
        idToMarketItem[itemId].offeror = offeror;
        idToMarketItem[itemId].minimumOffer = minimumOffer;
        idToMarketItem[itemId].invitedBidder = invitedBidder;
        emit OfferUpdated(
            idToMarketItem[itemId].tokenId,
            offeror,
            minimumOffer,
            invitedBidder
        );
    }

    /// @dev Set and emit new bid
    function _setBid(
        uint256 itemId,
        address bidder,
        uint256 lockedBid
    ) private {
        idToMarketItem[itemId].bidder = bidder;
        idToMarketItem[itemId].lockedBid = lockedBid;
        emit BidUpdated(idToMarketItem[itemId].tokenId, bidder, lockedBid);
    }

    modifier onlyMarketItem(uint256 tokenId) {
        require(
            tokenIdToItemId[tokenId] > 0,
            "TokenId not found in the market"
        );
        _;
    }
}
