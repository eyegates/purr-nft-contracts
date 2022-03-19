// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTToken is ERC721URIStorage {
    address contractAddress;

    constructor(address marketplaceAddress) ERC721("PurrNFT", "PNFT") {
        contractAddress = marketplaceAddress;
    }

    function createToken(uint256 tokenID, string memory tokenURI) public {
        _mint(msg.sender, tokenID);
        _setTokenURI(tokenID, tokenURI);
        setApprovalForAll(contractAddress, true);
    }
} 