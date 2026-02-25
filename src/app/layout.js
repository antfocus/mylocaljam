import './globals.css';

export const metadata = {
  title: 'MyLocalJam — Live Music in Asbury Park',
  description: 'Never miss a local show. Find live music events at venues across Asbury Park and the Jersey Shore.',
  openGraph: {
    title: 'MyLocalJam — Live Music in Asbury Park',
    description: 'Never miss a local show. Find live music events at venues across Asbury Park and the Jersey Shore.',
    type: 'website',
    url: 'https://mylocaljam.com',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
