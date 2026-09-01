import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'cafe_session'

const publicPaths = ['/login']

function csrfCheck(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return null

  const origin = request.headers.get('origin')
  if (!origin) {
    return new NextResponse(JSON.stringify({ error: 'CSRF check failed: missing origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const allowed = siteUrl
    ? [siteUrl]
    : process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []

  if (allowed.length === 0) {
    return new NextResponse(JSON.stringify({ error: 'NEXT_PUBLIC_SITE_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const originHost = new URL(origin).host
    if (!allowed.some(a => new URL(a).host === originHost)) {
      return new NextResponse(JSON.stringify({ error: 'CSRF check failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch {
    return new NextResponse(JSON.stringify({ error: 'Invalid origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    const csrfResponse = csrfCheck(request)
    if (csrfResponse) return csrfResponse
    return NextResponse.next()
  }

  // PWA static assets — always public
  if (
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/download.jpg' ||
    pathname.startsWith('/icon-')
  ) {
    return NextResponse.next()
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value

  if (publicPaths.includes(pathname)) {
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|placeholder.*).*)'],
}
