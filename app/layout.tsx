import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clockwork Research Hub',
  description: 'Daily research tracker for the Clockwork.io Senior Solutions Engineer role',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f4f6fb] text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
