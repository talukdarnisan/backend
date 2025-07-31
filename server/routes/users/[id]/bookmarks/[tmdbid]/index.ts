import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';

const log = scopedLogger('user-bookmarks');

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

// Support both formats: direct fields or nested under meta
const bookmarkRequestSchema = z.object({
  meta: bookmarkMetaSchema.optional(),
  tmdbId: z.string().optional(),
  group: z.union([z.string(), z.array(z.string())]).optional(),
});

export default defineEventHandler(async event => {
  const userId = getRouterParam(event, 'id');
  const tmdbId = getRouterParam(event, 'tmdbid');

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access bookmarks for other users',
    });
  }

  if (event.method === 'POST') {
    try {
      const body = await readBody(event);
      log.info('Creating bookmark', { userId, tmdbId, body });

      // Parse and validate the request body
      const validatedRequest = bookmarkRequestSchema.parse(body);

      // Extract the meta data - either directly from meta field or from the root
      const metaData = validatedRequest.meta || body;

      // Validate the meta data separately
      const validatedMeta = bookmarkMetaSchema.parse(metaData);

      // Extract group from the validated request
      const groupFromBody = validatedRequest.group;

      // Normalize group to always be an array if present
      const normalizedGroup = groupFromBody 
        ? (Array.isArray(groupFromBody) ? groupFromBody : [groupFromBody])
        : [];

      const bookmark = await prisma.bookmarks.upsert({
        where: {
          tmdb_id_user_id: {
            tmdb_id: tmdbId,
            user_id: session.user,
          },
        },
        update: {
          meta: validatedMeta,
          group: normalizedGroup,
          updated_at: new Date(),
        },
        create: {
          user_id: session.user,
          tmdb_id: tmdbId,
          meta: validatedMeta,
          group: normalizedGroup,
          updated_at: new Date(),
        },
      });

      log.info('Bookmark created successfully', { userId, tmdbId });

      return {
        tmdbId: bookmark.tmdb_id,
        meta: bookmark.meta,
        group: bookmark.group,
        updatedAt: bookmark.updated_at,
      };
    } catch (error) {
      log.error('Failed to create bookmark', {
        userId,
        tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof z.ZodError) {
        throw createError({
          statusCode: 400,
          message: JSON.stringify(error.errors, null, 2),
        });
      }

      throw error;
    }
  } else if (event.method === 'DELETE') {
    log.info('Deleting bookmark', { userId, tmdbId });

    try {
      await prisma.bookmarks.delete({
        where: {
          tmdb_id_user_id: {
            tmdb_id: tmdbId,
            user_id: session.user,
          },
        },
      });

      log.info('Bookmark deleted successfully', { userId, tmdbId });

      return { success: true, tmdbId };
    } catch (error) {
      log.error('Failed to delete bookmark', {
        userId,
        tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });

      // If bookmark doesn't exist, still return success
      return { success: true, tmdbId };
    }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
