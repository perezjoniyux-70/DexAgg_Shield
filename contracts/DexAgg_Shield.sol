pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DexAggShieldFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 30;
    bool public paused;
    uint256 public currentBatchId = 1;
    bool public batchOpen = false;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted data storage (example structure)
    struct EncryptedTradeRequest {
        euint32 tokenA; // Encrypted token A identifier
        euint32 tokenB; // Encrypted token B identifier
        euint32 amount; // Encrypted amount
    }
    mapping(uint256 => EncryptedTradeRequest) public encryptedRequests; // batchId => request
    mapping(uint256 => euint32) public encryptedBestPaths; // batchId => encrypted best path identifier

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSecondsSet(uint256 indexed oldCooldown, uint256 indexed newCooldown);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event TradeRequestSubmitted(address indexed provider, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 bestPath);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsSet(oldCooldown, newCooldown);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert Paused(); // Cannot unpause if not paused
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) revert InvalidBatch(); // Cannot open if already open
        batchOpen = true;
        currentBatchId++;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert InvalidBatch(); // Cannot close if not open
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitEncryptedTradeRequest(
        euint32 _tokenA,
        euint32 _tokenB,
        euint32 _amount
    ) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (!batchOpen) revert BatchNotOpen();

        lastSubmissionTime[msg.sender] = block.timestamp;

        encryptedRequests[currentBatchId] = EncryptedTradeRequest(_tokenA, _tokenB, _amount);
        emit TradeRequestSubmitted(msg.sender, currentBatchId);

        // Placeholder for actual aggregation logic:
        // This example just sets a dummy "best path" value.
        // A real implementation would use FHE.add, FHE.mul, etc. on encrypted data.
        encryptedBestPaths[currentBatchId] = _tokenA; // Dummy logic
    }

    function requestDecryptionForBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (batchId != currentBatchId) revert InvalidBatch(); // Example: only allow decryption for current batch

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 bestPathEncrypted = encryptedBestPaths[batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = bestPathEncrypted.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext(batchId, stateHash, false);

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild cts in the exact same order as during requestDecryptionForBatch
        // For this example, we need to retrieve the encryptedBestPaths for the batchId stored in the context
        uint256 batchId = decryptionContexts[requestId].batchId;
        euint32 bestPathEncrypted = encryptedBestPaths[batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = bestPathEncrypted.toBytes32();

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode cleartexts in the same order as cts
        // cleartexts is abi.encodePacked(uint256, uint256, ...) for each euint32
        // For a single euint32, it's 32 bytes
        uint256 bestPath = abi.decode(cleartexts, (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, bestPath);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32[3] memory arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            if (!arr[i].isInitialized()) {
                arr[i] = FHE.asEuint32(0);
            }
        }
    }

    function _requireInitialized(euint32[3] memory arr) internal pure {
        for (uint i = 0; i < arr.length; i++) {
            if (!arr[i].isInitialized()) {
                revert("FHE: euint32 not initialized");
            }
        }
    }
}