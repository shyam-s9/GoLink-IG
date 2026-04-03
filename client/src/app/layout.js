import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'], 
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter' 
});

export const metadata = {
  title: 'GoLink Auto | Secure Instagram Automation',
  description: 'Secure Instagram comment-to-DM automation with lead tracking and customer account protection.',
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
