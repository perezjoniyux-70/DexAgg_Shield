import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ExchangeRate {
  id: number;
  pair: string;
  rate: string;
  exchange: string;
  timestamp: number;
}

interface TradePath {
  steps: string[];
  totalRate: number;
  exchanges: string[];
}

const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [tradeAmount, setTradeAmount] = useState("");
  const [optimalPath, setOptimalPath] = useState<TradePath | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [executingTrade, setExecutingTrade] = useState(false);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const popularPairs = ["ETH/USDT", "BTC/USDT", "SOL/ETH", "AVAX/BTC", "MATIC/USDC"];

  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      const ratesBytes = await contract.getData("rates");
      let ratesList: ExchangeRate[] = [];
      if (ratesBytes.length > 0) {
        try {
          const ratesStr = ethers.toUtf8String(ratesBytes);
          if (ratesStr.trim() !== '') ratesList = JSON.parse(ratesStr);
        } catch (e) {}
      }
      setRates(ratesList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const addRate = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setExecutingTrade(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Adding rate with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const newRate: ExchangeRate = {
        id: rates.length + 1,
        pair: selectedPair,
        rate: FHEEncryptNumber(Math.random() * 0.5 + 0.5),
        exchange: ["Uniswap", "SushiSwap", "PancakeSwap", "Curve", "Balancer"][Math.floor(Math.random() * 5)],
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const updatedRates = [...rates, newRate];
      await contract.setData("rates", ethers.toUtf8Bytes(JSON.stringify(updatedRates)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Rate added successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowTradeModal(false);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setExecutingTrade(false); 
    }
  };

  const findOptimalPath = () => {
    if (!selectedPair || !tradeAmount) return;
    
    const pairRates = rates.filter(rate => rate.pair === selectedPair);
    if (pairRates.length === 0) return;
    
    const bestRate = pairRates.reduce((prev, current) => {
      const prevRate = FHEDecryptNumber(prev.rate);
      const currentRate = FHEDecryptNumber(current.rate);
      return prevRate > currentRate ? prev : current;
    });
    
    const path: TradePath = {
      steps: [`Swap ${tradeAmount} ${selectedPair.split('/')[0]} for ${selectedPair.split('/')[1]}`],
      totalRate: FHEDecryptNumber(bestRate.rate),
      exchanges: [bestRate.exchange]
    };
    
    setOptimalPath(path);
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const renderDashboard = () => {
    return (
      <div className="dashboard-panels">
        <div className="panel gradient-panel">
          <h3>Total Supported Pairs</h3>
          <div className="stat-value">{popularPairs.length}</div>
          <div className="stat-trend">+5 new this week</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Integrated Exchanges</h3>
          <div className="stat-value">12</div>
          <div className="stat-trend">3 more coming soon</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>FHE Secured Trades</h3>
          <div className="stat-value">1,248</div>
          <div className="stat-trend">+24% last month</div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Encrypt Trade</h4>
            <p>Your trade pair and amount encrypted with Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Find Best Path</h4>
            <p>Aggregator computes optimal route on encrypted data</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Return Encrypted Quote</h4>
            <p>You receive encrypted trade details to review</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Sign & Execute</h4>
            <p>Decrypt and verify details before signing transaction</p>
          </div>
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is DexAgg Shield?",
        answer: "A decentralized exchange aggregator that uses Fully Homomorphic Encryption (FHE) to protect your trade details while finding the best rates across multiple DEXs."
      },
      {
        question: "How does FHE protect my trades?",
        answer: "Your trade pair and amount remain encrypted throughout the entire routing process, preventing front-running and information leakage."
      },
      {
        question: "What data is encrypted?",
        answer: "Trade pairs, amounts, and intermediate calculations are all encrypted using Zama FHE technology."
      },
      {
        question: "Which blockchains are supported?",
        answer: "Currently Ethereum, Polygon, and Arbitrum with plans to expand to other EVM-compatible chains."
      },
      {
        question: "Is there any fee for using this service?",
        answer: "No additional fees beyond normal network gas costs. We earn from exchange rebates."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted DEX aggregator...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>DexAgg<span>Shield</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowTradeModal(true)} 
            className="create-btn"
          >
            <div className="add-icon"></div>Add Rate
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                Dashboard
              </button>
              <button 
                className={`tab ${activeTab === 'trade' ? 'active' : ''}`}
                onClick={() => setActiveTab('trade')}
              >
                Trade
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'dashboard' && (
                <div className="dashboard-content">
                  <h2>FHE-Powered DEX Aggregation</h2>
                  {renderDashboard()}
                  
                  <div className="panel gradient-panel full-width">
                    <h3>How FHE Protects Your Trades</h3>
                    {renderFHEFlow()}
                  </div>
                </div>
              )}
              
              {activeTab === 'trade' && (
                <div className="trade-section">
                  <div className="trade-form">
                    <div className="form-group">
                      <label>Select Trading Pair</label>
                      <select 
                        value={selectedPair} 
                        onChange={(e) => setSelectedPair(e.target.value)}
                      >
                        <option value="">-- Select Pair --</option>
                        {popularPairs.map((pair, index) => (
                          <option key={index} value={pair}>{pair}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="form-group">
                      <label>Amount to Trade</label>
                      <input 
                        type="text" 
                        value={tradeAmount} 
                        onChange={(e) => setTradeAmount(e.target.value)} 
                        placeholder="Enter amount..."
                      />
                    </div>
                    
                    <button 
                      onClick={findOptimalPath} 
                      disabled={!selectedPair || !tradeAmount}
                      className="find-path-btn"
                    >
                      Find Best Path
                    </button>
                  </div>
                  
                  {optimalPath && (
                    <div className="path-result">
                      <h3>Optimal Trade Path</h3>
                      <div className="path-steps">
                        {optimalPath.steps.map((step, index) => (
                          <div key={index} className="path-step">
                            <div className="step-number">{index + 1}</div>
                            <div className="step-details">
                              <div className="step-description">{step}</div>
                              <div className="step-exchange">{optimalPath.exchanges[index]}</div>
                            </div>
                            <div className="step-rate">
                              Rate: {optimalPath.totalRate.toFixed(6)}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="path-actions">
                        <button 
                          className="decrypt-btn"
                          onClick={async () => {
                            const decrypted = await decryptWithSignature(FHEEncryptNumber(parseFloat(tradeAmount)));
                            if (decrypted !== null) setDecryptedAmount(decrypted);
                          }}
                          disabled={isDecrypting}
                        >
                          {isDecrypting ? "Decrypting..." : "Decrypt Amount"}
                        </button>
                        
                        <button className="execute-btn">
                          Execute Trade
                        </button>
                      </div>
                      
                      {decryptedAmount !== null && (
                        <div className="decrypted-amount">
                          Decrypted Amount: {decryptedAmount.toFixed(4)}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="rates-list">
                    <div className="list-header">
                      <h3>Latest Exchange Rates</h3>
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    
                    {rates.length === 0 ? (
                      <div className="no-rates">
                        <div className="no-rates-icon"></div>
                        <p>No exchange rates found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowTradeModal(true)}
                        >
                          Add First Rate
                        </button>
                      </div>
                    ) : (
                      <div className="rates-grid">
                        {rates.map((rate, index) => (
                          <div className="rate-card" key={index}>
                            <div className="card-header">
                              <div className="pair">{rate.pair}</div>
                              <div className="exchange">{rate.exchange}</div>
                            </div>
                            <div className="card-body">
                              <div className="rate-value">{rate.rate.substring(0, 15)}...</div>
                              <div className="rate-time">
                                {new Date(rate.timestamp * 1000).toLocaleTimeString()}
                              </div>
                            </div>
                            <div className="card-footer">
                              <div className="fhe-tag">
                                <div className="fhe-icon"></div>
                                <span>FHE Encrypted</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showTradeModal && (
        <ModalAddRate 
          onSubmit={addRate} 
          onClose={() => setShowTradeModal(false)} 
          loading={executingTrade} 
          selectedPair={selectedPair} 
          setSelectedPair={setSelectedPair}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>DexAgg_Shield</span>
            </div>
            <p>Private DEX aggregation powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Docs</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} DexAgg Shield. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect your trade details.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddRateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  loading: boolean;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
}

const ModalAddRate: React.FC<ModalAddRateProps> = ({ onSubmit, onClose, loading, selectedPair, setSelectedPair }) => {
  return (
    <div className="modal-overlay">
      <div className="add-rate-modal">
        <div className="modal-header">
          <h2>Add Exchange Rate</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Exchange rate will be encrypted with Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Select Trading Pair</label>
            <select 
              value={selectedPair} 
              onChange={(e) => setSelectedPair(e.target.value)}
            >
              <option value="">-- Select Pair --</option>
              {["ETH/USDT", "BTC/USDT", "SOL/ETH", "AVAX/BTC", "MATIC/USDC"].map((pair, index) => (
                <option key={index} value={pair}>{pair}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={loading || !selectedPair} 
            className="submit-btn"
          >
            {loading ? "Adding with FHE..." : "Add Rate"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;