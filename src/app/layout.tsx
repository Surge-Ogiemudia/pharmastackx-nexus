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
  icons: { icon: '/nexus.png', apple: '/nexus.png' },
  title: 'PharmaStackX Nexus — AI-Powered Medicine Discovery',
  description:
    'PharmaStackX Nexus uses Gemma 4 to connect patients to medicine wherever they are. Offline-capable, multilingual, built for the world.',
  keywords: ['PharmaStackX', 'Gemma 4', 'medicine discovery', 'AI healthcare', 'pharmacy', 'offline', 'global health'],
  openGraph: {
    title: 'PharmaStackX Nexus',
    description: 'AI-Powered Medicine Discovery. Built on Gemma 4. Works anywhere.',
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
