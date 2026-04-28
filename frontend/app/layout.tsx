import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from '@/lib/AuthContext';
import { NavbarWrapper } from '@/components/NavbarWrapper';
import { MainContainer } from '@/components/MainContainer';

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
            <MainContainer>{children}</MainContainer>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}
