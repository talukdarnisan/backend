import { useAuth } from '~/utils/auth';
import { z } from 'zod';

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const bookmarkDataSchema = z.object({
  tmdbId: z.string(),
  meta: bookmarkMetaSchema,
  group: z.union([z.string(), z.array(z.string())]).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  if (method === 'GET') {
    const bookmarks = await prisma.bookmarks.findMany({
      where: { user_id: userId },
    });

    return bookmarks.map(bookmark => ({
      tmdbId: bookmark.tmdb_id,
      meta: bookmark.meta,
      group: bookmark.group,
      updatedAt: bookmark.updated_at,
    }));
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    const validatedBody = z.array(bookmarkDataSchema).parse(body);

    const now = new Date();
    const results = [];

    for (const item of validatedBody) {
      // Normalize group to always be an array
      const normalizedGroup = item.group 
        ? (Array.isArray(item.group) ? item.group : [item.group])
        : [];

      const bookmark = await prisma.bookmarks.upsert({
        where: {
          tmdb_id_user_id: {
            tmdb_id: item.tmdbId,
            user_id: userId,
          },
        },
        update: {
          meta: item.meta,
          group: normalizedGroup,
          updated_at: now,
        },
        create: {
          tmdb_id: item.tmdbId,
          user_id: userId,
          meta: item.meta,
          group: normalizedGroup,
          updated_at: now,
        },
      });

      results.push({
        tmdbId: bookmark.tmdb_id,
        meta: bookmark.meta,
        group: bookmark.group,
        updatedAt: bookmark.updated_at,
      });
    }

    return results;
  }

  const segments = event.path.split('/');
  const tmdbId = segments[segments.length - 1];

  if (method === 'POST') {
    const body = await readBody(event);
    const validatedBody = bookmarkDataSchema.parse(body);

    const existing = await prisma.bookmarks.findUnique({
      where: {
        tmdb_id_user_id: {
          tmdb_id: tmdbId,
          user_id: userId,
        },
      },
    });

    if (existing) {
      throw createError({
        statusCode: 400,
        message: 'Already bookmarked',
      });
    }

    const bookmark = await prisma.bookmarks.create({
      data: {
        tmdb_id: tmdbId,
        user_id: userId,
        meta: validatedBody.meta,
        updated_at: new Date(),
      },
    });

    return {
      tmdbId: bookmark.tmdb_id,
      meta: bookmark.meta,
      group: bookmark.group,
      updatedAt: bookmark.updated_at,
    };
  }

  if (method === 'DELETE') {
    try {
      await prisma.bookmarks.delete({
        where: {
          tmdb_id_user_id: {
            tmdb_id: tmdbId,
            user_id: userId,
          },
        },
      });
    } catch (error) {}

    return { tmdbId };
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
