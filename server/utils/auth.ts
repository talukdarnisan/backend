import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
const { sign, verify } = jwt;
import { randomUUID } from 'crypto';

// 21 days in ms
const SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

export function useAuth() {
  const getSession = async (id: string) => {
    const session = await prisma.sessions.findUnique({
      where: { id }
    });
    
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;
    
    return session;
  };

  const getSessionAndBump = async (id: string) => {
    const session = await getSession(id);
    if (!session) return null;
    
    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);
    
    return await prisma.sessions.update({
      where: { id },
      data: {
        accessed_at: now,
        expires_at: expiryDate
      }
    });
  };

  const makeSession = async (user: string, device: string, userAgent?: string) => {
    if (!userAgent) throw new Error('No useragent provided');
    
    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);
    
    return await prisma.sessions.create({
      data: {
        id: randomUUID(),
        user,
        device,
        user_agent: userAgent,
        created_at: now,
        accessed_at: now,
        expires_at: expiryDate
      }
    });
  };

  const makeSessionToken = (session: { id: string }) => {
    const runtimeConfig = useRuntimeConfig();
    return sign({ sid: session.id }, runtimeConfig.cyrptoSecret, {
      algorithm: 'HS256'
    });
  };

  const verifySessionToken = (token: string) => {
    try {
      const runtimeConfig = useRuntimeConfig();
      const payload = verify(token, runtimeConfig.cyrptoSecret, {
        algorithms: ['HS256']
      });
      
      if (typeof payload === 'string') return null;
      return payload as { sid: string };
    } catch {
      return null;
    }
  };

  return {
    getSession,
    getSessionAndBump,
    makeSession,
    makeSessionToken,
    verifySessionToken
  };
}