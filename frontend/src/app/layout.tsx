import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Evidence Management Platform",
  description: "Secure evidence management for law enforcement and investigations",
  keywords: "evidence management, law enforcement, digital forensics, investigation",
  authors: [{ name: "Evidence Platform Team" }],
  robots: "noindex, nofollow", // Security: prevent indexing
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased cds--body cds--white">
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                },
              }}
            />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
