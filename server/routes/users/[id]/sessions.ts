import { useAuth } from '~/utils/auth';

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id');
  
  const authHeader = getRequestHeader(event, 'authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const token = authHeader.split(' ')[1];
  const auth = useAuth();
  
  const payload = auth.verifySessionToken(token);
  if (!payload) {
    throw createError({
      statusCode: 401,
      message: 'Invalid token'
    });
  }

  const session = await auth.getSessionAndBump(payload.sid);
  if (!session) {
    throw createError({
      statusCode: 401,
      message: 'Session not found or expired'
    });
  }

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access sessions for other users'
    });
  }

  const sessions = await prisma.sessions.findMany({
    where: { user: userId }
  });

  return sessions.map(s => ({
    id: s.id,
    user: s.user,
    createdAt: s.created_at,
    accessedAt: s.accessed_at,
    expiresAt: s.expires_at,
    device: s.device,
    userAgent: s.user_agent,
    current: s.id === session.id
  }));
});