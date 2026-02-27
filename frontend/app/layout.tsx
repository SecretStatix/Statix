import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from '@/lib/AuthContext';
import { NavbarWrapper } from '@/components/NavbarWrapper';

export const metadata = {
  title: 'Statix | Athlete Stock Market',
  description: 'Trade NBA players like stocks. Earn weekly dividends based on performance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">
        <AuthProvider>
          <Providers>
            <NavbarWrapper />
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}
