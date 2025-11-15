import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";
import dotenv from "dotenv";
import { requestFaucet } from "./faucet.js";
import { getTokenBalances } from "./balances.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// parse JSON bodies
app.use(express.json());

// wallet address that will receive payments for the API
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "0xYourWalletAddress";

// enable CORS for local development
app.use(cors());

// apply x402 payment middleware
app.use(paymentMiddleware(
  RECEIVER_WALLET,
  {
    // configure the x402-enabled endpoint
    "GET /motivate": {
      // price in USDC (0.01 USDC)
      price: "$0.01",
      // using Base Sepolia testnet
      network: "base-sepolia",
      // metadata about the endpoint for better discovery
      config: {
        description: "get a motivational quote to inspire your day",
        outputSchema: {
          type: "object",
          properties: {
            quote: { type: "string", description: "an inspirational quote" },
            timestamp: { type: "string", description: "when the quote was generated" }
          }
        }
      }
    }
  },
  facilitator // use CDP's hosted facilitator (requires CDP_API_KEY and CDP_API_KEY_PRIVATE_KEY env vars)
));

// the x402-enabled endpoint - this is ALL the code you need!
app.get("/motivate", (req, res) => {
  res.json({
    quote: "Work hard - have fun - make history.",
    timestamp: new Date().toISOString(),
    paid: true
  });
});

// health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "x402 demo server is running" });
});

// balance endpoint; uses CDP Token Balances API
app.get("/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ error: "address required" });
    }

    const apiKeyId = process.env.CDP_API_KEY_ID;
    const privateKey = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !privateKey) {
      return res.status(500).json({ error: "server not configured with CDP API credentials" });
    }

    const usdcBalance = await getTokenBalances(address, "base-sepolia", apiKeyId, privateKey);
    
    res.json({ 
      balance: usdcBalance,
      address: address,
      network: "base-sepolia",
      token: "USDC"
    });
  } catch (error) {
    console.error("Balance error:", error);
    res.status(500).json({ 
      error: error.message || "failed to fetch balance"
    });
  }
});

// Faucet endpoint; uses CDP Faucet API with server's CDP API key
app.post("/faucet", async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: "address required" });
    }

    const apiKeyId = process.env.CDP_API_KEY_ID;
    const privateKey = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !privateKey) {
      return res.status(500).json({ error: "server not configured with CDP API credentials" });
    }

    console.log(`requesting faucet for address: ${address}`);
    const txHash = await requestFaucet(address, apiKeyId, privateKey);
    
    console.log(`Faucet successful! Transaction: ${txHash}`);
    res.json({ 
      success: true, 
      transactionHash: txHash,
      message: "USDC will arrive shortly"
    });
  } catch (error) {
    console.error("Faucet error:", error);
    res.status(500).json({ 
      error: error.message || "Faucet request failed",
      details: "may be hitting rate limits; try again in a few min"
    });
  }
});

app.listen(PORT, () => {
  console.log(`x402 demo server running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`   • GET  /health           - health check (public)`);
  console.log(`   • GET  /balance/:address - USDC balance via CDP Token Balances API (public)`);
  console.log(`   • POST /faucet           - request test USDC via CDP Faucet API (public)`);
  console.log(`   • GET  /motivate         - motivational quote (requires 0.01 USDC payment)`);
  console.log(`\nCDP products in use:`);
  console.log(`   • CDP x402 Facilitator - payment verification & settlement`);
  console.log(`   • CDP Faucet API       - test USDC distribution`);
  console.log(`   • CDP Token Balances   - real-time balance checking`);
  console.log(`\nreceiving payments at: ${RECEIVER_WALLET}`);
  console.log(`Price: 0.01 USDC on Base Sepolia`);
});

