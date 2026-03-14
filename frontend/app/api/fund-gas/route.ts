import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseEther, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const FUND_AMOUNT = parseEther('0.001'); // enough for ~20,000 transactions on Base
const MIN_BALANCE = parseEther('0.0005'); // don't re-fund if they already have some

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const fundingKey = process.env.GAS_FUNDER_PRIVATE_KEY;
    if (!fundingKey) {
      return NextResponse.json({ error: 'Funder not configured' }, { status: 500 });
    }

    const account = privateKeyToAccount(`0x${fundingKey.replace('0x', '')}`);
    const client = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });

    // Check recipient balance first
    const { createPublicClient } = await import('viem');
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const balance = await publicClient.getBalance({ address: address as `0x${string}` });
    if (balance >= MIN_BALANCE) {
      return NextResponse.json({ message: 'Already funded', balance: balance.toString() });
    }

    const hash = await client.sendTransaction({
      to: address as `0x${string}`,
      value: FUND_AMOUNT,
    });

    return NextResponse.json({ hash, funded: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
