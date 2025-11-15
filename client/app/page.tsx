"use client";

import { useState, useEffect } from "react";
import { 
  useCurrentUser,
  useIsSignedIn,
  useSignInWithEmail,
  useVerifyEmailOTP,
  useSignInWithSms,
  useVerifySmsOTP,
  useSignInWithOAuth,
  useSignOut
} from "@coinbase/cdp-hooks";
import { toViemAccount } from "@coinbase/cdp-core";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ApiResponse {
  quote: string;
  timestamp: string;
  paid: boolean;
}

interface PaymentResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
}

export default function Home() {
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const { signOut } = useSignOut();
  
  const [quote, setQuote] = useState<string>("");
  const [paymentInfo, setPaymentInfo] = useState<PaymentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [showAuthMethods, setShowAuthMethods] = useState(false);
  const [authStep, setAuthStep] = useState<"method" | "email" | "sms" | "otp">("method");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState("");
  const [authType, setAuthType] = useState<"email" | "sms">("email");
  const [faucetSuccess, setFaucetSuccess] = useState<string>("");

  const address = currentUser?.evmAccounts?.[0];

  // fetch balance when connected
  useEffect(() => {
    if (address) {
      fetchBalance();
    }
  }, [address]);

  const fetchBalance = async () => {
    if (!address) return;
    
    try {
      const response = await fetch(`${API_URL}/balance/${address}`);
      
      if (!response.ok) {
        throw new Error("failed to fetch balance");
      }
      
      const data = await response.json();
      setBalance(data.balance);
      console.log(`balance updated: ${data.balance} USDC for ${address}`);
    } catch (err) {
      console.error("error fetching balance:", err);
    }
  };

  // handle email sign in
  const handleEmailSignIn = async () => {
    if (!emailOrPhone) return;
    
    setLoading(true);
    setError("");
    
    try {
      const result = await signInWithEmail({ email: emailOrPhone });
      setFlowId(result.flowId);
      setAuthType("email");
      setAuthStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send email");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handle mobile SMS sign in
  const handleSmsSignIn = async () => {
    if (!emailOrPhone) return;
    
    setLoading(true);
    setError("");
    
    try {
      const result = await signInWithSms({ phoneNumber: emailOrPhone });
      setFlowId(result.flowId);
      setAuthType("sms");
      setAuthStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send SMS");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // verify OTP
  const handleVerifyOtp = async () => {
    if (!otp || !flowId) return;
    
    setLoading(true);
    setError("");
    
    try {
      if (authType === "email") {
        await verifyEmailOTP({ flowId, otp });
      } else {
        await verifySmsOTP({ flowId, otp });
      }
      // user now authenticated; reset state
      setShowAuthMethods(false);
      setAuthStep("method");
      setEmailOrPhone("");
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to verify OTP");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handle OAuth sign in
  const handleOAuthSignIn = async (provider: "google" | "x") => {
    setLoading(true);
    setError("");
    
    try {
      await signInWithOAuth(provider);
      setShowAuthMethods(false);
      setAuthStep("method");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to sign in");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Faucet USDC using backend endpoint
  const handleFaucet = async () => {
    if (!address) return;
    
    setLoading(true);
    setError("");
    setFaucetSuccess("");
    
    try {
      const response = await fetch(`${API_URL}/faucet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: address,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Faucet request failed");
      }
      
      setFaucetSuccess(data.transactionHash);
      
      // refresh balance multiple times to catch the update
      setTimeout(fetchBalance, 2000);
      setTimeout(fetchBalance, 5000);
      setTimeout(fetchBalance, 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to request faucet funds");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // call the x402-enabled API endpoint
  const handleCallApi = async () => {
    if (!address || !currentUser) return;
    
    setLoading(true);
    setError("");
    setQuote("");
    setPaymentInfo(null);
    
    try {
      // convert CDP Embedded Wallet to viem account
      const evmAddress = currentUser.evmAccounts?.[0];
      if (!evmAddress) {
        throw new Error("no EVM account found");
      }
      
      const viemAccount = await toViemAccount(evmAddress as `0x${string}`);
      const walletClient = createWalletClient({
        account: viemAccount,
        chain: baseSepolia,
        transport: http(),
      });
      
      // wrap fetch with x402 payment handling
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);
      
      // make the paid request
      const response = await fetchWithPayment(`${API_URL}/motivate`, {
        method: "GET",
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data: ApiResponse = await response.json();
      setQuote(data.quote);
      
      const paymentResponseHeader = response.headers.get("x-payment-response");
      if (paymentResponseHeader) {
        const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
        setPaymentInfo(paymentResponse);
      }
      
      setTimeout(fetchBalance, 2000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to call API");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>x402 demo</h1>
        <p>monetize APIs with crypto - simple and instant</p>
      </div>

      <div className="wallet-section">
        <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>sign in</h2>
        
        {!isSignedIn ? (
          <>
            {!showAuthMethods ? (
              <button 
                className="button button-primary"
                onClick={() => setShowAuthMethods(true)}
                disabled={loading}
              >
                sign in
              </button>
            ) : authStep === "method" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button
                  className="button button-primary"
                  onClick={() => setAuthStep("email")}
                  disabled={loading}
                >
                  email
                </button>
                <button
                  className="button button-primary"
                  onClick={() => setAuthStep("sms")}
                  disabled={loading}
                >
                  mobile
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleOAuthSignIn("google")}
                  disabled={loading}
                >
                  google
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleOAuthSignIn("x")}
                  disabled={loading}
                >
                  X
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setShowAuthMethods(false)}
                  disabled={loading}
                >
                  cancel
                </button>
              </div>
            ) : authStep === "email" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="email"
                  placeholder="enter your email"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleEmailSignIn}
                  disabled={loading || !emailOrPhone}
                >
                  {loading ? "sending..." : "send OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); }}
                  disabled={loading}
                >
                  back
                </button>
              </div>
            ) : authStep === "sms" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="tel"
                  placeholder="Enter phone (+1234567890)"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleSmsSignIn}
                  disabled={loading || !emailOrPhone}
                >
                  {loading ? "sending..." : "send OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); }}
                  disabled={loading}
                >
                  Back
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
                  enter the 6-digit code sent to {emailOrPhone}
                </p>
                <input
                  type="text"
                  placeholder="Enter OTP code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleVerifyOtp}
                  disabled={loading || !otp}
                >
                  {loading ? "verifying..." : "verify OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); setOtp(""); }}
                  disabled={loading}
                >
                  back
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="wallet-info">
            <p>connected:</p>
            <div className="address">{address}</div>
            <p style={{ marginTop: "16px" }}>USDC balance:</p>
            <div className="balance">{balance} USDC</div>
            <button 
              className="button button-secondary" 
              onClick={() => signOut()}
              style={{ marginTop: "16px" }}
            >
              sign out
            </button>
          </div>
        )}
      </div>

      {isSignedIn && (
        <>
          <div className="action-section">
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>get testnet USDC</h2>
            <button
              className="button button-secondary"
              onClick={handleFaucet}
              disabled={loading}
            >
              {loading ? "requesting..." : "request Faucet (free testnet USDC)"}
            </button>
            <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
              get free USDC on Base Sepolia for testing (1 USDC per request)
            </p>
            {faucetSuccess && (
              <div style={{ 
                marginTop: "12px", 
                padding: "12px", 
                background: "#d4edda", 
                border: "1px solid #c3e6cb",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#155724"
              }}>
                <strong>✅ Faucet successful!</strong>
                <div style={{ marginTop: "8px", fontSize: "12px", fontFamily: "monospace" }}>
                  <a 
                    href={`https://sepolia.basescan.org/tx/${faucetSuccess}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#155724", textDecoration: "underline" }}
                  >
                    view transaction on Basescan →
                  </a>
                </div>
                <p style={{ marginTop: "8px", fontSize: "13px" }}>
                  USDC will arrive in a few seconds - your balance will update automatically
                </p>
              </div>
            )}
          </div>

          <div className="action-section">
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>call x402-enabled API</h2>
            <button
              className="button button-primary"
              onClick={handleCallApi}
              disabled={loading || parseFloat(balance) < 0.01}
            >
              {loading ? "processing..." : "Get Motivational Quote (0.01 USDC)"}
            </button>
            {parseFloat(balance) < 0.01 && (
              <div className="info-box">
                you need at least 0.01 USDC to call the API - use the faucet above!
              </div>
            )}
          </div>

          {error && (
            <div className="error">
              <strong>error:</strong> {error}
            </div>
          )}

          {quote && (
            <div className="response-section">
              <h3>API response:</h3>
              <div className="quote-display">"{quote}"</div>
              
              {paymentInfo && (
                <div className="payment-info">
                  <p><strong>payment status:</strong> {paymentInfo.success ? "✅ Successful" : "❌ Failed"}</p>
                  {paymentInfo.transaction && (
                    <>
                      <p><strong>transaction:</strong></p>
                      <div className="tx-hash">
                        <a 
                          href={`https://sepolia.basescan.org/tx/${paymentInfo.transaction}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {paymentInfo.transaction}
                        </a>
                      </div>
                    </>
                  )}
                  <p><strong>network:</strong> {paymentInfo.network}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="steps">
        <h3>how x402 works:</h3>
        <ol>
          <li>
            <strong>user clicks "Get Motivational Quote"</strong>
          </li>
          
          <li>
            <strong>client makes request to <code>/motivate</code> endpoint</strong>
            <pre style={{ fontSize: "12px", background: "white", padding: "8px", borderRadius: "4px", marginTop: "8px", overflow: "auto" }}>
{`GET http://localhost:3001/motivate`}
            </pre>
          </li>
          
          <li>
            <strong>server responds with <code>402 Payment Required</code></strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view 402 response →</summary>
              <pre style={{ fontSize: "11px", background: "white", padding: "8px", borderRadius: "4px", marginTop: "8px", overflow: "auto" }}>
{`HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "scheme": "exact",
  "network": "base-sepolia",
  "maxAmountRequired": "10000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0xYourReceiverAddress",
  "resource": "http://localhost:3001/motivate",
  "description": "Get a motivational quote",
  "extra": {
    "gasLimit": "200000"
  }
}`}
              </pre>
            </details>
          </li>
          
          <li>
            <strong>client creates and signs payment transaction</strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view technical details →</summary>
              <div style={{ fontSize: "13px", marginTop: "8px", lineHeight: "1.6" }}>
                <p>Uses <strong>EIP-3009 transferWithAuthorization</strong>:</p>
                <ul style={{ marginLeft: "20px", marginTop: "8px" }}>
                  <li>creates USDC transfer authorization (0.01 USDC = 10,000 units)</li>
                  <li>sets <code>from</code> (your wallet) and <code>to</code> (receiver)</li>
                  <li>adds <code>validBefore</code> timestamp (expiration)</li>
                  <li>generates unique <code>nonce</code> (prevents replay attacks)</li>
                  <li>signs with your CDP Embedded Wallet private key</li>
                  <li>no gas needed - facilitator sponsors the transaction</li>
                </ul>
              </div>
            </details>
          </li>
          
          <li>
            <strong>client retries request with <code>X-PAYMENT</code> header</strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view payment header →</summary>
              <pre style={{ fontSize: "11px", background: "white", padding: "8px", borderRadius: "4px", marginTop: "8px", overflow: "auto" }}>
{`GET http://localhost:3001/motivate
X-PAYMENT: base64_encoded_json

Decoded X-PAYMENT:
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0xabc123...",
    "authorization": {
      "from": "0xYourWalletAddress",
      "to": "0x036CbD...USDC",
      "value": "10000",
      "validAfter": "0",
      "validBefore": "1731362400",
      "nonce": "0xdef456..."
    }
  }
}`}
              </pre>
            </details>
          </li>
          
          <li>
            <strong>server verifies payment using CDP facilitator</strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view facilitator call →</summary>
              <pre style={{ fontSize: "11px", background: "white", padding: "8px", borderRadius: "4px", marginTop: "8px", overflow: "auto" }}>
{`POST https://api.cdp.coinbase.com/platform/v2/x402/verify
Authorization: Bearer <JWT_from_CDP_API_KEY>
Content-Type: application/json

{
  "x402Version": 1,
  "paymentPayload": { /* X-PAYMENT data */ },
  "paymentRequirements": { /* from 402 response */ }
}

Response:
{
  "isValid": true,
  "payer": "0xYourWalletAddress"
}`}
              </pre>
              <p style={{ fontSize: "13px", marginTop: "8px" }}>
                the server uses its CDP API key to authenticate with the facilitator, which verifies the signature and checks that the payment matches requirements
              </p>
            </details>
          </li>
          
          <li>
            <strong>Facilitator settles payment on Base Sepolia</strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view settlement →</summary>
              <div style={{ fontSize: "13px", marginTop: "8px", lineHeight: "1.6" }}>
                <p>Facilitator calls USDC contract's <code>transferWithAuthorization</code>:</p>
                <ul style={{ marginLeft: "20px", marginTop: "8px" }}>
                  <li>submits your signed authorization to the blockchain</li>
                  <li>Facilitator pays the gas fees (not you!)</li>
                  <li>USDC transfers from your wallet to receiver</li>
                  <li>transaction confirms on Base</li>
                  <li>returns transaction hash to server</li>
                </ul>
              </div>
            </details>
          </li>
          
          <li>
            <strong>server returns the protected content</strong>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", color: "#0052ff" }}>view response →</summary>
              <pre style={{ fontSize: "11px", background: "white", padding: "8px", borderRadius: "4px", marginTop: "8px", overflow: "auto" }}>
{`HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: base64_encoded_json

{
  "quote": "Work hard, have fun, make history.",
  "timestamp": "2025-11-11T21:45:00.000Z",
  "paid": true
}

Decoded X-PAYMENT-RESPONSE:
{
  "success": true,
  "transaction": "0x789abc...",
  "network": "base-sepolia",
  "payer": "0xYourWalletAddress"
}`}
              </pre>
            </details>
          </li>
          
          <li>
            <strong>user sees the quote and payment confirmation</strong>
            <p style={{ fontSize: "13px", marginTop: "8px" }}>
              click the transaction hash to view it on Basescan and see the actual onchain payment
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
