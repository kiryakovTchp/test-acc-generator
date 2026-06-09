import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test Account Generator',
  description: 'V1 test account generator',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
