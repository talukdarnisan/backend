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

  if (event.method !== 'PUT') {
    throw createError({
      statusCode: 405,
      message: 'Method not allowed'
    });
  }

  const body = await readBody(event);
  const validatedBody = z.array(progressItemSchema).parse(body);
  
  const existingItems = await prisma.progress_items.findMany({
    where: { user_id: userId }
  });
  
  const newItems = [...validatedBody];
  const itemsToUpsert = [];
  
  for (const existingItem of existingItems) {
    const newItemIndex = newItems.findIndex(
      (item) =>
        item.tmdbId === existingItem.tmdb_id &&
        item.seasonId === existingItem.season_id &&
        item.episodeId === existingItem.episode_id
    );
    
    if (newItemIndex > -1) {
      const newItem = newItems[newItemIndex];
      
      if (Number(existingItem.watched) < newItem.watched) {
        itemsToUpsert.push({
          id: existingItem.id,
          tmdb_id: existingItem.tmdb_id,
          user_id: existingItem.user_id,
          season_id: existingItem.season_id,
          episode_id: existingItem.episode_id,
          season_number: existingItem.season_number,
          episode_number: existingItem.episode_number,
          duration: BigInt(newItem.duration),
          watched: BigInt(newItem.watched),
          meta: newItem.meta,
          updated_at: defaultAndCoerceDateTime(newItem.updatedAt)
        });
      }
      
      newItems.splice(newItemIndex, 1);
    }
  }
  
  for (const newItem of newItems) {
    itemsToUpsert.push({
      id: randomUUID(),
      tmdb_id: newItem.tmdbId,
      user_id: userId,
      season_id: newItem.seasonId || null,
      episode_id: newItem.episodeId || null,
      season_number: newItem.seasonNumber || null,
      episode_number: newItem.episodeNumber || null,
      duration: BigInt(newItem.duration),
      watched: BigInt(newItem.watched),
      meta: newItem.meta,
      updated_at: defaultAndCoerceDateTime(newItem.updatedAt)
    });
  }
  
  const result = await prisma.$transaction(
    itemsToUpsert.map(item => 
      prisma.progress_items.upsert({
        where: {
          id: item.id
        },
        update: {
          watched: item.watched,
          duration: item.duration,
          meta: item.meta,
          updated_at: item.updated_at
        },
        create: item
      })
    )
  );
  
  return result.map(item => ({
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
});