import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const progressMetaSchema = z.object({
  title: z.string(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'tv', 'show']),
  year: z.number().optional()
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform((n) => Math.round(n)),
  watched: z.number().transform((n) => Math.round(n)),
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

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  const method = event.method;
  
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
      message: 'Cannot modify user other than yourself'
    });
  }

  if (method === 'GET') {
    const items = await prisma.progress_items.findMany({
      where: { user_id: userId }
    });

    return items.map(item => ({
      id: item.id,
      tmdbId: item.tmdb_id,
      userId: item.user_id,
      seasonId: item.season_id,
      episodeId: item.episode_id,
      seasonNumber: item.season_number,
      episodeNumber: item.episode_number,
      meta: item.meta,
      duration: Number(item.duration),
      watched: Number(item.watched),
      updatedAt: item.updated_at
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
            episode_id: validatedBody.episodeId || null
          }
        }
      });
      
      let progressItem;
      
      if (existingItem) {
        progressItem = await prisma.progress_items.update({
          where: {
            id: existingItem.id
          },
          data: {
            duration: BigInt(validatedBody.duration),
            watched: BigInt(validatedBody.watched),
            meta: validatedBody.meta,
            updated_at: now
          }
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
            updated_at: now
          }
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
        updatedAt: progressItem.updated_at
      };
    }
    
    if (method === 'DELETE') {
      const body = await readBody(event).catch(() => ({}));
      
      const whereClause: any = {
        user_id: userId,
        tmdb_id: tmdbId
      };
      
      if (body.seasonId) whereClause.season_id = body.seasonId;
      if (body.episodeId) whereClause.episode_id = body.episodeId;
      
      const itemsToDelete = await prisma.progress_items.findMany({
        where: whereClause
      });
      
      if (itemsToDelete.length === 0) {
        return {
          count: 0,
          tmdbId,
          episodeId: body.episodeId,
          seasonId: body.seasonId
        };
      }
      
      await prisma.progress_items.deleteMany({
        where: whereClause
      });
      
      return {
        count: itemsToDelete.length,
        tmdbId,
        episodeId: body.episodeId,
        seasonId: body.seasonId
      };
    }
  }
  
  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  });
});