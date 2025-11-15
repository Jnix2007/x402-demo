import { generateJwt } from "@coinbase/cdp-sdk/auth";

/**
 * get token balances for an address using CDP Token Balances API
 */
export async function getTokenBalances(address, network, apiKeyId, apiKeySecret) {
  // generate JWT for auth
  const jwt = await generateJwt({
    apiKeyId: apiKeyId,
    apiKeySecret: apiKeySecret,
    requestMethod: "GET",
    requestHost: "api.cdp.coinbase.com",
    requestPath: `/platform/v2/evm/token-balances/${network}/${address}`,
    expiresIn: 120,
  });

  const response = await fetch(
    `https://api.cdp.coinbase.com/platform/v2/evm/token-balances/${network}/${address}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token Balances API error:", errorText);
    throw new Error(`failed to fetch balances: ${response.status}`);
  }

  const data = await response.json();
  
  // find USDC balance on Base Sepolia
  const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e".toLowerCase();
  const usdcBalance = data.balances?.find(
    b => b.token.contractAddress.toLowerCase() === usdcAddress
  );
  
  if (usdcBalance) {
    // convert to decimal format
    const amount = BigInt(usdcBalance.amount.amount);
    const decimals = usdcBalance.amount.decimals;
    const divisor = BigInt(10 ** decimals);
    const balance = Number(amount) / Number(divisor);
    return balance.toString();
  }
  
  return "0";
}

