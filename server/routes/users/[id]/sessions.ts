import { useAuth } from '~/utils/auth';

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id');
  
  const session = await useAuth().getCurrentSession();

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