import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('zo_recruiter_session')?.value;

  if (token) {
    const session = await verifySession(token);
    if (session) return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/zaloguj', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|zaloguj|api/zaloguj|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
