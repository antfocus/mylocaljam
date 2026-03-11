import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';

export const metadata = {
  title: 'MyLocalJam — Discover Local Live Music',
  description: 'Find live music events tonight at venues near you. Discover local gigs, artists, and community events.',
  keywords: 'live music, local events, concerts, gigs, artists, venues, community events',
  openGraph: {
    title: 'MyLocalJam — Discover Local Live Music',
    description: 'Find live music events tonight at venues near you.',
    type: 'website',
    url: 'https://mylocaljam.com',
    siteName: 'MyLocalJam',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
