import { getRegistry } from '../../utils/metrics';
import { scopedLogger } from '../../utils/logger';

const log = scopedLogger('metrics-daily-endpoint');

export default defineEventHandler(async event => {
  try {
    // Get the daily registry
    const dailyRegistry = getRegistry('daily');
    
    const metrics = await dailyRegistry.metrics();
    event.node.res.setHeader('Content-Type', dailyRegistry.contentType);
    return metrics;
  } catch (error) {
    log.error('Error in daily metrics endpoint:', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to collect daily metrics',
    });
  }
}); 