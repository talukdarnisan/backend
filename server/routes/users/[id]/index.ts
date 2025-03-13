import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';

const log = scopedLogger('user-profile');

const userProfileSchema = z.object({
  profile: z.object({
    icon: z.string(),
    colorA: z.string(),
    colorB: z.string()
  })
});

export default defineEventHandler(async (event) => {
  const userId = event.context.params?.id;
  
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Cannot modify other users'
    });
  }

  if (event.method === 'PATCH') {
    try {
      const body = await readBody(event);
      log.info('Updating user profile', { userId, body });
      
      const validatedBody = userProfileSchema.parse(body);
      
      const user = await prisma.users.update({
        where: { id: userId },
        data: {
          profile: validatedBody.profile
        }
      });
      
      log.info('User profile updated successfully', { userId });
      
      return {
        id: user.id,
        publicKey: user.public_key,
        namespace: user.namespace,
        profile: user.profile,
        permissions: user.permissions,
        createdAt: user.created_at,
        lastLoggedIn: user.last_logged_in
      };
    } catch (error) {
      log.error('Failed to update user profile', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof z.ZodError) {
        throw createError({
          statusCode: 400,
          message: 'Invalid profile data',
          cause: error.errors
        });
      }
      
      throw createError({
        statusCode: 500,
        message: 'Failed to update user profile',
        cause: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  });
}); 