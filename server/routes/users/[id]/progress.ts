import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const progressMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform(n => n.toString()),
  watched: z.number().transform(n => n.toString()),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

// 13th July 2021 - movie-web epoch
const minEpoch = 1626134400000;

function defaultAndCoerceDateTime(dateTime: string | undefined) {
  const epoch = dateTime ? new Date(dateTime).getTime() : Date.now();
  const clampedEpoch = Math.max(minEpoch, Math.min(epoch, Date.now()));
  return new Date(clampedEpoch);
}

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (!session) {
    throw createError({
      statusCode: 401,
      message: 'Session not found or expired',
    });
  }

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot access other user information',
    });
  }

  if (method === 'GET') {
    const items = await prisma.progress_items.findMany({
      where: { user_id: userId },
    });

    return items.map(item => ({
      id: item.id,
      tmdbId: item.tmdb_id,
      episode: {
        id: item.episode_id || null,
        number: item.episode_number || null,
      },
      season: {
        id: item.season_id || null,
        number: item.season_number || null,
      },
      meta: item.meta,
      duration: item.duration.toString(),
      watched: item.watched.toString(),
      updatedAt: item.updated_at.toISOString(),
    }));
  }

  if (event.path.includes('/progress/') && !event.path.endsWith('/import')) {
    const segments = event.path.split('/');
    const tmdbId = segments[segments.length - 1];

    if (method === 'PUT') {
      const body = await readBody(event);
      const validatedBody = progressItemSchema.parse(body);

      const now = defaultAndCoerceDateTime(validatedBody.updatedAt);

      const existingItem = await prisma.progress_items.findUnique({
        where: {
          tmdb_id_user_id_season_id_episode_id: {
            tmdb_id: tmdbId,
            user_id: userId,
            season_id: validatedBody.seasonId || null,
            episode_id: validatedBody.episodeId || null,
          },
        },
      });

      let progressItem;

      if (existingItem) {
        progressItem = await prisma.progress_items.update({
          where: {
            id: existingItem.id,
          },
          data: {
            duration: BigInt(validatedBody.duration),
            watched: BigInt(validatedBody.watched),
            meta: validatedBody.meta,
            updated_at: now,
          },
        });
      } else {
        progressItem = await prisma.progress_items.create({
          data: {
            id: randomUUID(),
            tmdb_id: tmdbId,
            user_id: userId,
            season_id: validatedBody.seasonId || null,
            episode_id: validatedBody.episodeId || null,
            season_number: validatedBody.seasonNumber || null,
            episode_number: validatedBody.episodeNumber || null,
            duration: BigInt(validatedBody.duration),
            watched: BigInt(validatedBody.watched),
            meta: validatedBody.meta,
            updated_at: now,
          },
        });
      }

      return {
        id: progressItem.id,
        tmdbId: progressItem.tmdb_id,
        userId: progressItem.user_id,
        seasonId: progressItem.season_id,
        episodeId: progressItem.episode_id,
        seasonNumber: progressItem.season_number,
        episodeNumber: progressItem.episode_number,
        meta: progressItem.meta,
        duration: Number(progressItem.duration),
        watched: Number(progressItem.watched),
        updatedAt: progressItem.updated_at,
      };
    }

    if (method === 'DELETE') {
      const body = await readBody(event).catch(() => ({}));

      const whereClause: any = {
        user_id: userId,
        tmdb_id: tmdbId,
      };

      if (body.seasonId) whereClause.season_id = body.seasonId;
      if (body.episodeId) whereClause.episode_id = body.episodeId;

      const itemsToDelete = await prisma.progress_items.findMany({
        where: whereClause,
      });

      if (itemsToDelete.length === 0) {
        return {
          count: 0,
          tmdbId,
          episodeId: body.episodeId,
          seasonId: body.seasonId,
        };
      }

      await prisma.progress_items.deleteMany({
        where: whereClause,
      });

      return {
        count: itemsToDelete.length,
        tmdbId,
        episodeId: body.episodeId,
        seasonId: body.seasonId,
      };
    }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  });
});
