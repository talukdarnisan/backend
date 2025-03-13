import { useAuth } from '~/utils/auth';
import { z } from 'zod';

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show'])
});

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  const tmdbId = getRouterParam(event, 'tmdbid')

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access bookmarks for other users'
    });
  }

  if (event.method === "POST") {
    const body = await readBody(event);
    const validatedBody = bookmarkMetaSchema.parse(body);
    
    const bookmark = await prisma.bookmarks.create({
      data: {
        user_id: session.user,
        tmdb_id: tmdbId,
        meta: validatedBody,
        updated_at: new Date()
      }
    });
    
    return {
      tmdbId: bookmark.tmdb_id,
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