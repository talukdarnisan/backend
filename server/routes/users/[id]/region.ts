import { useAuth, defineEventHandler, createError, readBody } from '#imports';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import { prisma } from '~/utils/prisma';

const log = scopedLogger('user-region');

const userRegionSchema = z.object({
  region: z.string(),
  userPicked: z.boolean(),
  lastChecked: z.number()
});

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Permission denied'
    });
  }

  if (event.method === 'GET') {
    const settings = await prisma.user_settings.findUnique({
      where: { id: userId }
    });

    return {
      region: settings?.region || 'unknown',
      lastChecked: settings?.last_checked ? Math.floor(settings.last_checked.getTime() / 1000) : 0,
      userPicked: settings?.user_picked || false
    };
  }

  if (event.method === 'PUT') {
    try {
      const body = await readBody(event);
      log.info('Updating user region', { userId, body });
      
      const validatedBody = userRegionSchema.parse(body);
      
      const data = {
        region: validatedBody.region,
        user_picked: validatedBody.userPicked,
        last_checked: new Date(validatedBody.lastChecked * 1000)
      };

      log.info('Preparing to upsert region settings', { userId, data });

      const settings = await prisma.user_settings.upsert({
        where: { id: userId },
        update: data,
        create: {
          id: userId,
          ...data
        }
      });
      
      log.info('Region settings updated successfully', { userId });
      
      return {
        region: settings.region || 'unknown',
        lastChecked: Math.floor(settings.last_checked.getTime() / 1000),
        userPicked: settings.user_picked
      };
    } catch (error) {
      log.error('Failed to update region settings', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof z.ZodError) {
        throw createError({
          statusCode: 400,
          message: 'Invalid region data',
          cause: error.errors
        });
      }
      
      throw createError({
        statusCode: 500,
        message: 'Failed to update region settings',
        cause: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  });
}); 