// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract NFTRoyaltyToken is ERC721URIStorage, ERC2981 {
    address contractAddress;

    constructor(address marketplaceAddress) ERC721("PurrNFT", "PNFT") {
        contractAddress = marketplaceAddress;
    }

    function createToken(
        uint256 tokenID,
        string memory tokenURI,
        uint96 royaltyFraction,
        address receiver
    ) public {
        _mint(msg.sender, tokenID);
        _setTokenURI(tokenID, tokenURI);
        setApprovalForAll(contractAddress, true);
        if (royaltyFraction > 0)
            _setTokenRoyalty(tokenID, receiver, royaltyFraction);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
