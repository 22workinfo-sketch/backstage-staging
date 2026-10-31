import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET_STRING =
  process.env.ADMIN_SESSION_SECRET || "fallback-secret-for-dev-only-min-32-chars-long";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);
export const COOKIE_NAME = "backstage_session";

export interface AdminSession {
  id: string;
  email: string;
  role: string;
}

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({
    id: session.id,
    email: session.email,
    role: session.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!payload.id || !payload.email || !payload.role) {
      return null;
    }

    return {
      id: payload.id as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function getAdminSession(req?: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): Promise<AdminSession | null> {
  let token: string | undefined;

  // 1. Try extracting from passed request object if available
  if (req && req.cookies && typeof req.cookies.get === "function") {
    token = req.cookies.get(COOKIE_NAME)?.value;
  }

  // 2. Otherwise fall back to Next.js headers cookies()
  if (!token) {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // When invoked outside Next.js requestAsyncStorage context (e.g. tests)
      token = undefined;
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
