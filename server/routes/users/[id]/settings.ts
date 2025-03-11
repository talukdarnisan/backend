import { useAuth } from '~/utils/auth';
import { z } from 'zod';

const userSettingsSchema = z.object({
  application_theme: z.string().optional(),
  application_language: z.string().optional(),
  default_subtitle_language: z.string().optional(),
  proxy_urls: z.array(z.string()).optional(),
  trakt_key: z.string().optional(),
  febbox_key: z.string().optional()
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

  if (event.method === 'PUT') {
    try {
      const body = await readBody(event);
      const validatedSettings = userSettingsSchema.parse(body);
      
      const existingSettings = await prisma.user_settings.findUnique({
        where: { id: userId }
      });
      
      let settings;
      
      if (existingSettings) {
        settings = await prisma.user_settings.update({
          where: { id: userId },
          data: validatedSettings
        });
      } else {
        settings = await prisma.user_settings.create({
          data: {
            id: userId,
            ...validatedSettings
          }
        });
      }
      
      return {
        settings: {
          applicationTheme: settings.application_theme,
          applicationLanguage: settings.application_language,
          defaultSubtitleLanguage: settings.default_subtitle_language,
          proxyUrls: settings.proxy_urls,
          traktKey: settings.trakt_key,
          febboxKey: settings.febbox_key
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError({
          statusCode: 400,
          message: 'Invalid settings data'
        });
      }
      
      throw createError({
        statusCode: 500,
        message: 'Failed to update settings'
      });
    }
  } else if (event.method === 'GET') {
    const settings = await prisma.user_settings.findUnique({
      where: { id: userId }
    });
    
    if (!settings) {
      return {
        settings: {
          applicationTheme: null,
          applicationLanguage: null,
          defaultSubtitleLanguage: null,
          proxyUrls: [],
          traktKey: null,
          febboxKey: null
        }
      };
    }
    
    return {
      settings: {
        applicationTheme: settings.application_theme,
        applicationLanguage: settings.application_language,
        defaultSubtitleLanguage: settings.default_subtitle_language,
        proxyUrls: settings.proxy_urls,
        traktKey: settings.trakt_key,
        febboxKey: settings.febbox_key
      }
    };
  }
  
  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  });
});