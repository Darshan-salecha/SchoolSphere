import { SignJWT, jwtVerify } from 'jose';

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short. Set it in .env (32+ characters).');
  }
  return new TextEncoder().encode(s);
};

export type TokenPayload = {
  sub: string; // user id
  sid: string; // AuthSession.tokenId — lets us revoke server-side
  sc: string | null; // schoolId
};

export async function signToken(payload: TokenPayload, expiresAt: Date) {
  return new SignJWT({ sc: payload.sc, sid: payload.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.sid !== 'string') return null;
    return { sub: payload.sub, sid: payload.sid, sc: (payload.sc as string | null) ?? null };
  } catch {
    return null;
  }
}
