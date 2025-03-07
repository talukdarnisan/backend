import { useAuth } from '~/utils/auth';

export default defineEventHandler(async (event) => {
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

  const user = await prisma.users.findUnique({
    where: { id: session.user }
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    });
  }

  return {
    user: {
      id: user.id,
      publicKey: user.public_key,
      namespace: user.namespace,
      profile: user.profile,
      permissions: user.permissions
    },
    session: {
      id: session.id,
      user: session.user,
      createdAt: session.created_at,
      accessedAt: session.accessed_at,
      expiresAt: session.expires_at,
      device: session.device,
      userAgent: session.user_agent
    }
  };
});