import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const progressMetaSchema = z.object({
  title: z.string(),
  type: z.enum(['movie', 'show']),
  year: z.number(),
  poster: z.string().optional()
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number(),
  watched: z.number(),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional()
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
  
  const session = await useAuth().getCurrentSession();
  
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
  
  // Create new items
  for (const item of newItems) {
    itemsToUpsert.push({
      id: randomUUID(),
      tmdb_id: item.tmdbId,
      user_id: userId,
      season_id: item.seasonId || null,
      episode_id: item.episodeId || null,
      season_number: item.seasonNumber || null,
      episode_number: item.episodeNumber || null,
      duration: BigInt(item.duration),
      watched: BigInt(item.watched),
      meta: item.meta,
      updated_at: defaultAndCoerceDateTime(item.updatedAt)
    });
  }
  
  // Upsert all items
  const results = [];
  for (const item of itemsToUpsert) {
    const result = await prisma.progress_items.upsert({
      where: {
        tmdb_id_user_id_season_id_episode_id: {
          tmdb_id: item.tmdb_id,
          user_id: item.user_id,
          season_id: item.season_id,
          episode_id: item.episode_id
        }
      },
      create: item,
      update: {
        duration: item.duration,
        watched: item.watched,
        meta: item.meta,
        updated_at: item.updated_at
      }
    });
    
    results.push({
      id: result.id,
      tmdbId: result.tmdb_id,
      episode: {
        id: result.episode_id || null,
        number: result.episode_number || null
      },
      season: {
        id: result.season_id || null,
        number: result.season_number || null
      },
      meta: result.meta,
      duration: result.duration.toString(),
      watched: result.watched.toString(),
      updatedAt: result.updated_at.toISOString()
    });
  }
  
  return results;
});