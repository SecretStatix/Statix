'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { baseSepolia, hardhat } from 'viem/chains';
import { http } from 'wagmi';
import { statixChain } from '@/lib/chain-config';
import { useAuth } from '@/lib/AuthContext';

// Public routes that don't touch wallets — skip Privy/Wagmi init there so these
// pages paint faster on mobile.
const PUBLIC_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/pending',
]);

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
  const pathname = usePathname();
  const { session, loading } = useAuth();
  const accessToken = session?.access_token ?? null;

  const privyConfig = useMemo(
    () => ({
      appearance: {
        theme: 'dark' as const,
        accentColor: '#4A8AF4' as `#${string}`,
      },
      embeddedWallets: {
        ethereum: {
          createOnLogin: 'users-without-wallets' as const,
        },
      },
      defaultChain: statixChain,
      supportedChains: [statixChain],
      customAuth: {
        enabled: true,
        isLoading: loading,
        getCustomAccessToken: async () => accessToken ?? undefined,
      },
    }),
    [loading, accessToken]
  );

  // On public auth pages we don't need Privy/Wagmi — returning children directly
  // avoids the Privy iframe handshake, Wagmi config, and QueryClient setup there.
  if (PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'missing-privy-app-id'}
      config={privyConfig}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}