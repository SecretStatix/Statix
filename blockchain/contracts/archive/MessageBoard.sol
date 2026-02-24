// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MessageBoard {
    struct Message {
        address sender;
        address recipient;
        string content;
        uint256 timestamp;
    }

    // All messages ever sent
    Message[] public allMessages;

    // Mapping: address => array of message indices they received
    mapping(address => uint256[]) private _inbox;

    // Mapping: address => array of message indices they sent
    mapping(address => uint256[]) private _sent;

    event MessageSent(
        uint256 indexed messageId,
        address indexed sender,
        address indexed recipient,
        string content,
        uint256 timestamp
    );

    /// @notice Send a message to a recipient. The content is stored on-chain as-is.
    function sendMessage(address _to, string calldata _content) external {
        require(_to != address(0), "Cannot send to zero address");
        require(bytes(_content).length > 0, "Message cannot be empty");

        uint256 messageId = allMessages.length;

        allMessages.push(Message({
            sender: msg.sender,
            recipient: _to,
            content: _content,
            timestamp: block.timestamp
        }));

        _inbox[_to].push(messageId);
        _sent[msg.sender].push(messageId);

        emit MessageSent(messageId, msg.sender, _to, _content, block.timestamp);
    }

    /// @notice Get total number of messages
    function totalMessages() external view returns (uint256) {
        return allMessages.length;
    }

    /// @notice Get all message IDs received by an address
    function getInbox(address _user) external view returns (uint256[] memory) {
        return _inbox[_user];
    }

    /// @notice Get all message IDs sent by an address
    function getSent(address _user) external view returns (uint256[] memory) {
        return _sent[_user];
    }

    /// @notice Read a specific message by its ID
    function getMessage(uint256 _messageId) external view returns (
        address sender,
        address recipient,
        string memory content,
        uint256 timestamp
    ) {
        require(_messageId < allMessages.length, "Message does not exist");
        Message storage m = allMessages[_messageId];
        return (m.sender, m.recipient, m.content, m.timestamp);
    }
}
