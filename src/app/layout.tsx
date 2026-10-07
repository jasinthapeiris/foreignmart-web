import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ForeignMart — A better way to shop',
  description: 'Thoughtful groceries from your neighborhood markets, delivered with care.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
