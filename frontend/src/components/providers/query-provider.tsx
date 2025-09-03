'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes
          gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)
          retry: (failureCount, error: unknown) => {
            // Don't retry on 4xx errors
            const errorResponse = error as { response?: { status?: number } }
            if (errorResponse?.response?.status && 
                errorResponse.response.status >= 400 && 
                errorResponse.response.status < 500) {
              return false
            }
            return failureCount < 3
          },
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
        mutations: {
          retry: false,
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools 
        initialIsOpen={false} 
        position="bottom-right"
        buttonPosition="bottom-right"
      />
    </QueryClientProvider>
  )
}