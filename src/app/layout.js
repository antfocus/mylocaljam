import './globals.css';

export const metadata = {
  title: 'MyLocalJam — Live Music at the Jersey Shore',
  description: 'Find live music events tonight at 20+ venues across Asbury Park, Belmar, Point Pleasant, and the Jersey Shore. Updated daily.',
  keywords: 'live music, jersey shore, asbury park, belmar, point pleasant, concerts, events tonight, local bands, NJ music',
  openGraph: {
    title: 'MyLocalJam — Live Music at the Jersey Shore',
    description: 'Find live music events tonight at 20+ venues across Asbury Park, Belmar, Point Pleasant, and the Jersey Shore.',
    type: 'website',
    url: 'https://mylocaljam.com',
    siteName: 'MyLocalJam',
  },
  twitter: {
    card: 'summary',
    title: 'MyLocalJam — Live Music at the Jersey Shore',
    description: 'Find live music events tonight at 20+ venues along the Jersey Shore.',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  other: {
    'theme-color': '#0D0D12',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0D0D12',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
