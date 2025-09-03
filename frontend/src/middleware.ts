import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

// Define protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/cases',
  // '/evidence', // Temporarily allow for demo
  '/users',
  '/settings',
]

// Define public routes that don't require authentication
const publicRoutes = [
  '/login',
  '/evidence', // Temporarily allow for demo
  '/api/auth',
  '/health',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Generate correlation ID for request tracking
  const correlationId = request.headers.get('x-correlation-id') || nanoid()
  
  // Create response
  const response = NextResponse.next()
  
  // Add security headers with nonce for CSP
  const nonce = nanoid()
  response.headers.set('x-correlation-id', correlationId)
  response.headers.set('x-request-id', nanoid())
  
  // Content Security Policy with nonce
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)
  
  // Skip auth check for public routes and API routes
  if (publicRoutes.some(route => pathname.startsWith(route)) || 
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico') {
    return response
  }
  
  // Check for authentication token
  const token = request.cookies.get('evidence_platform_token')?.value ||
                request.headers.get('authorization')?.replace('Bearer ', '')
  
  // Redirect to login if accessing protected route without token
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }
  
  // Add CSRF protection for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const csrfToken = request.headers.get('x-csrf-token')
    const csrfCookie = request.cookies.get('csrf-token')?.value
    
    if (!csrfToken || csrfToken !== csrfCookie) {
      // Only enforce CSRF for non-API routes
      if (!pathname.startsWith('/api/')) {
        return new NextResponse('CSRF token mismatch', { status: 403 })
      }
    }
  }
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}