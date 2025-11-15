import { generateJwt } from "@coinbase/cdp-sdk/auth";

/**
 * request USDC from CDP Faucet
 */
export async function requestFaucet(address, apiKeyId, apiKeySecret) {
  // generate JWT for auth
  const jwt = await generateJwt({
    apiKeyId: apiKeyId,
    apiKeySecret: apiKeySecret,
    requestMethod: "POST",
    requestHost: "api.cdp.coinbase.com",
    requestPath: "/platform/v2/evm/faucet",
    expiresIn: 120,
  });

  const response = await fetch('https://api.cdp.coinbase.com/platform/v2/evm/faucet', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      network: 'base-sepolia',
      address: address,
      token: 'usdc',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Faucet API error:", errorText);
    throw new Error(`Faucet request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.transactionHash;
}
