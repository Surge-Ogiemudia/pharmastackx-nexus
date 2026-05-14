import type { Metadata, Viewport } from 'next';
import './globals.css';
import RootLayoutClient from './RootLayoutClient';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'PharmaStackX Nexus — AI-Powered Medicine Discovery',
  description:
    'PharmaStackX Nexus uses Gemma 4 to connect medicine requests directly to pharmacists. Offline-capable, multilingual, built for Nigeria.',
  keywords: ['PharmaStackX', 'Gemma 4', 'medicine discovery', 'Nigeria', 'AI healthcare', 'offline'],
  openGraph: {
    title: 'PharmaStackX Nexus',
    description: 'AI-Powered Medicine Discovery. Built on Gemma 4.',
    url: 'https://nexus.psx.ng',
    siteName: 'PharmaStackX Nexus',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
