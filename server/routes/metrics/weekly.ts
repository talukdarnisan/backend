import { getRegistry } from '../../utils/metrics';
import { scopedLogger } from '../../utils/logger';

const log = scopedLogger('metrics-weekly-endpoint');

export default defineEventHandler(async event => {
  try {
    // Get the weekly registry
    const weeklyRegistry = getRegistry('weekly');
    
    const metrics = await weeklyRegistry.metrics();
    event.node.res.setHeader('Content-Type', weeklyRegistry.contentType);
    return metrics;
  } catch (error) {
    log.error('Error in weekly metrics endpoint:', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to collect weekly metrics',
    });
  }
}); 