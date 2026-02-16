import type { Metadata } from 'next';
import { Quicksand } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const quicksand = Quicksand({
  variable: '--font-quicksand',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Holigay Events YYC',
  description:
    'Vendor application platform for the Holigay Events YYC marketplace. Apply to participate in events, upload product photos, and track your application status.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${quicksand.variable} antialiased`}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#2A2230',
              border: '1px solid #3A3142',
              color: '#F5F0F5',
              fontFamily: 'var(--font-quicksand), sans-serif',
            },
          }}
        />
      </body>
    </html>
  );
}
