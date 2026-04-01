import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'], 
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter' 
});

export const metadata = {
  title: 'GoLink IG | Cloud Clarity Dashboard',
  description: 'Automate your Instagram affiliate link delivery with professional SaaS clarity.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans`}>
        {children}
      </body>
    </html>
  );
}
