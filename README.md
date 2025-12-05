# FHE-powered Decentralized Exchange Aggregator

DexAgg_Shield is a groundbreaking decentralized exchange (DEX) aggregator leveraging **Zama's Fully Homomorphic Encryption (FHE) technology**. It provides users with the ability to execute trades while keeping their transaction pairs and amounts confidential, enhancing transaction privacy and security in the DeFi landscape.

## Understanding the Problem

In the rapidly evolving world of decentralized finance, users often seek the best trading routes across multiple exchanges to optimize their transactions. However, during this search, users' sensitive trading data may become exposed, leading to potential manipulation or exploitation by malicious entities. Traditional DEX aggregators often compromise user privacy by handling clear-text data, thus defeating the purpose of decentralized finance and compelling users to sacrifice either privacy or efficiency.

## How FHE Complements Us

The DexAgg_Shield addresses this privacy concern by utilizing **Zama's open-source libraries**, such as **Concrete** and **TFHE-rs**, which enable operations on encrypted data without revealing it. This means that while DexAgg_Shield performs path-finding algorithms to identify optimal trading routes across various DEXs, it does this using encrypted transaction data, ensuring that neither the server nor third parties can access users’ trading strategies.

## Core Features

- 🔒 **Encrypted Transaction Requests**: Users’ trading pairs and amounts are encrypted using FHE, ensuring confidentiality.
- ⚙️ **Path Optimization Algorithms**: The aggregator computes optimal trading paths using encrypted data, bypassing the need to handle clear-text information.
- 🔄 **Decentralized**: Maintains the decentralized ethos of blockchain, providing user autonomy without sacrificing privacy.
- 📊 **Multi-Exchange Price Comparison**: Enables users to visualize pricing across multiple exchanges securely.
- ✅ **End-to-End Privacy Protection**: Guarantees privacy from user request to trade execution.

## Technology Stack

- **Zama SDK (Concrete, TFHE-rs, Zama FHE SDK)**: Core component for implementing FHE in trading logic.
- **Ethereum**: Smart contract platform for executing trades.
- **Node.js**: Back-end environment for the application.
- **Hardhat/Foundry**: Framework for compiling, deploying, and testing smart contracts.
- **React**: Frontend framework for building the user interface.

## Directory Structure

Here’s a quick overview of the project’s directory structure:

```
DexAgg_Shield/
├── contracts/
│   └── DexAgg_Shield.sol
├── src/
│   ├── index.js
│   ├── aggregator.js
│   └── utils.js
├── tests/
│   └── aggregator.test.js
├── package.json
└── README.md
```

## Installation Guide

To set up the DexAgg_Shield project on your local environment, follow these steps:

1. Make sure you have **Node.js** and **Hardhat/Foundry** installed on your machine.

2. Navigate to the project directory using your terminal.

3. Run the following command to install dependencies:

   ```bash
   npm install
   ```

   This command will fetch all required libraries, including Zama's FHE libraries.

### Important Note

**Do not use `git clone` or any repository URLs for setup. Ensure you have the project files available locally.**

## Build & Run Guide

Once the installation is complete, you can build and run the project with the following commands:

1. **Compile the Smart Contract**:

   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:

   ```bash
   npx hardhat test
   ```

3. **Start the Application**:

   ```bash
   npx hardhat run scripts/deploy.js
   ```

## Code Example

Here's a simple example of how the DexAgg_Shield could be utilized in code to find an optimal trading path:

```javascript
const { encryptTransaction, findOptimalPath } = require('./aggregator');

// Example user transaction
const userTransaction = {
    pair: 'ETH/DAI',
    amount: 10
};

// Encrypt user transaction before sending it to the aggregator
const encryptedTransaction = encryptTransaction(userTransaction);

// Find the optimal path using encrypted data
const optimalPath = findOptimalPath(encryptedTransaction);

console.log("Optimal Trading Path:", optimalPath);
```

In this snippet, the `encryptTransaction` function prepares sensitive data for secure processing, while `findOptimalPath` executes the necessary algorithms on encrypted inputs.

## Acknowledgements

### Powered by Zama

We extend our heartfelt thanks to the Zama team for their visionary work in advancing **Fully Homomorphic Encryption** technology. Their commitment to open-source tools has enabled the creation of confidential blockchain applications that protect user privacy in the DeFi ecosystem. Together, we continue to innovate and elevate the standards of privacy and security in decentralized finance.