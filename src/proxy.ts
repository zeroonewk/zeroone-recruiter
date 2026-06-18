import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

const INTERNAL_ONLY = ['/projekty', '/dashboard', '/status', '/ustawienia'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('zo_recruiter_session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/zaloguj', request.url));
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.redirect(new URL('/zaloguj', request.url));
  }

  if (session.is_external) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/freelancer', request.url));
    }
    const blocked = INTERNAL_ONLY.some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
    if (blocked) {
      return NextResponse.redirect(new URL('/freelancer', request.url));
    }
    return NextResponse.next();
  }

  // Regular users cannot access freelancer routes
  if (pathname.startsWith('/freelancer')) {
    return NextResponse.redirect(new URL('/projekty', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|zaloguj|api/zaloguj|api/wyloguj|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
