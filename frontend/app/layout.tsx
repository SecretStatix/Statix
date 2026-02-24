'use client';

import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from '@/lib/AuthContext';
import { NavbarWrapper } from '@/components/NavbarWrapper';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white min-h-screen">
        <AuthProvider>
          <Providers>
            <NavbarWrapper />
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}
