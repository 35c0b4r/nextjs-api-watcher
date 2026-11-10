import { ApiWatcher } from 'nextjs-api-watcher';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', padding: 24 }}>
        {children}
        <ApiWatcher />
      </body>
    </html>
  );
}
