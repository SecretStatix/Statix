'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { baseSepolia, hardhat } from 'viem/chains';
import { http } from 'wagmi';
import { statixChain } from '@/lib/chain-config';

// Must match Privy `supportedChains` — see https://docs.privy.io/guide/react/wallets/usage/wagmi
// Include transports for both possible chain ids so the `statixChain` union type satisfies wagmi.
const wagmiConfig = createConfig({
  chains: [statixChain],
  transports: {
    [baseSepolia.id]: http(),
    [hardhat.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'missing-privy-app-id'}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#4A8AF4',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        defaultChain: statixChain,
        supportedChains: [statixChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}