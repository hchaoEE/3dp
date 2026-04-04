import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chip3D Platform',
  description: '3D Chip Design Platform - FP, Thermal, Synthesis, Place, CTS, Route',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        <div className="flex flex-col min-h-screen">
          <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Chip3D
              </div>
              <span className="text-gray-500 text-sm">3D Chip Design Platform</span>
            </div>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="text-gray-300 hover:text-white transition-colors">Projects</a>
              <a href="/thermal" className="text-gray-300 hover:text-white transition-colors">Thermal Sim</a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
