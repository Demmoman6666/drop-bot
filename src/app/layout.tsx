import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Drop Bot',
  description: 'Automated purchase bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
