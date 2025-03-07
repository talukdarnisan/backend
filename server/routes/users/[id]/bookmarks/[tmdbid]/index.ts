export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  const tmdbId = getRouterParam(event, 'tmdbid')

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
      message: 'Cannot access bookmarks for other users'
    });
  }

  if (event.method === "POST") {
  const body = await readBody(event);
  const bookmark = await prisma.bookmarks.create({
    data: {
      user_id: session.user,
      tmdb_id: tmdbId,
      meta: body.meta,
      updated_at: new Date()
    }
  });
  
  return {
    tmdbId: bookmark.tmdb_id,
    userId: bookmark.user_id,
    meta: bookmark.meta,
    updatedAt: bookmark.updated_at
  };
} else if (event.method === "DELETE") {
  await prisma.bookmarks.delete({
    where: {
      tmdb_id_user_id: {
        tmdb_id: tmdbId,
        user_id: session.user
      }
    }
  });
  
  return { success: true, tmdbId };
}
  
  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})