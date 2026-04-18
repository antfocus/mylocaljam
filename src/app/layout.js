import './globals.css';
import { Suspense } from 'react';
import PostHogProvider from '@/components/PostHogProvider';

export const metadata = {
  title: 'mylocaljam',
  description: 'Your local source, all in one spot.',
  keywords: 'live music, jersey shore, asbury park, belmar, point pleasant, concerts, events tonight, local bands, NJ music',
  openGraph: {
    title: 'mylocaljam | mylocaljam.com',
    description: 'Your local source, all in one spot.',
    url: 'https://mylocaljam.com',
    siteName: 'myLocaljam',
    images: [
      {
        url: '/images/og-share.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mylocaljam | mylocaljam.com',
    description: 'Your local source, all in one spot.',
    images: ['/images/og-share.png'],
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
    <html lang="en" prefix="og: http://ogp.me/ns#">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
