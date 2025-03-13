import { Counter, register, collectDefaultMetrics, Histogram, Summary } from 'prom-client';
import { prisma } from './prisma';
import { scopedLogger } from '~/utils/logger';
import fs from 'fs';
import path from 'path';

const log = scopedLogger('metrics');
const METRICS_FILE = '.metrics.json';

export type Metrics = {
  user: Counter<'namespace'>;
  captchaSolves: Counter<'success'>;
  providerHostnames: Counter<'hostname'>;
  providerStatuses: Counter<'provider_id' | 'status'>;
  watchMetrics: Counter<'title' | 'tmdb_full_id' | 'provider_id' | 'success'>;
  toolMetrics: Counter<'tool'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  httpRequestSummary: Summary<'method' | 'route' | 'status_code'>;
};

let metrics: null | Metrics = null;

export function getMetrics() {
  if (!metrics) throw new Error('metrics not initialized');
  return metrics;
}

async function createMetrics(): Promise<Metrics> {
  const newMetrics = {
    user: new Counter({
      name: 'mw_user_count',
      help: 'Number of users by namespace',
      labelNames: ['namespace'],
    }),
    captchaSolves: new Counter({
      name: 'mw_captcha_solves',
      help: 'Number of captcha solves by success status',
      labelNames: ['success'],
    }),
    providerHostnames: new Counter({
      name: 'mw_provider_hostname_count',
      help: 'Number of requests by provider hostname',
      labelNames: ['hostname'],
    }),
    providerStatuses: new Counter({
      name: 'mw_provider_status_count',
      help: 'Number of provider requests by status',
      labelNames: ['provider_id', 'status'],
    }),
    watchMetrics: new Counter({
      name: 'mw_media_watch_count',
      help: 'Number of media watch events',
      labelNames: ['title', 'tmdb_full_id', 'provider_id', 'success'],
    }),
    toolMetrics: new Counter({
      name: 'mw_provider_tool_count',
      help: 'Number of provider tool usages',
      labelNames: ['tool'],
    }),
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    httpRequestSummary: new Summary({
      name: 'http_request_summary_seconds',
      help: 'request duration in seconds summary',
      labelNames: ['method', 'route', 'status_code'],
      percentiles: [0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999],
    }),
  };

  // Register all metrics with the Prometheus registry
  register.registerMetric(newMetrics.user);
  register.registerMetric(newMetrics.captchaSolves);
  register.registerMetric(newMetrics.providerHostnames);
  register.registerMetric(newMetrics.providerStatuses);
  register.registerMetric(newMetrics.watchMetrics);
  register.registerMetric(newMetrics.toolMetrics);
  register.registerMetric(newMetrics.httpRequestDuration);
  register.registerMetric(newMetrics.httpRequestSummary);

  return newMetrics;
}

async function saveMetricsToFile() {
  try {
    if (!metrics) return;
    
    const metricsData = await register.getMetricsAsJSON();
    const relevantMetrics = metricsData.filter(metric => 
      metric.name.startsWith('mw_') || 
      metric.name === 'http_request_duration_seconds'
    );
    
    fs.writeFileSync(
      METRICS_FILE,
      JSON.stringify(relevantMetrics, null, 2)
    );
    
    log.info('Metrics saved to file', { evt: 'metrics_saved' });
  } catch (error) {
    log.error('Failed to save metrics', {
      evt: 'save_metrics_error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function loadMetricsFromFile(): Promise<any[]> {
  try {
    if (!fs.existsSync(METRICS_FILE)) {
      log.info('No saved metrics found', { evt: 'no_saved_metrics' });
      return [];
    }

    const data = fs.readFileSync(METRICS_FILE, 'utf8');
    const savedMetrics = JSON.parse(data);
    log.info('Loaded saved metrics', { 
      evt: 'metrics_loaded',
      count: savedMetrics.length 
    });
    return savedMetrics;
  } catch (error) {
    log.error('Failed to load metrics', {
      evt: 'load_metrics_error',
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

// Periodically save metrics
const SAVE_INTERVAL = 60000; // Save every minute
setInterval(saveMetricsToFile, SAVE_INTERVAL);

// Save metrics on process exit
process.on('SIGTERM', async () => {
  log.info('Saving metrics before exit...', { evt: 'exit_save' });
  await saveMetricsToFile();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('Saving metrics before exit...', { evt: 'exit_save' });
  await saveMetricsToFile();
  process.exit(0);
});

export async function setupMetrics() {
  try {
    log.info('Setting up metrics...', { evt: 'start' });

    // Clear all existing metrics
    log.info('Clearing metrics registry...', { evt: 'clear' });
    register.clear();

    // Enable default Node.js metrics collection with appropriate settings
    collectDefaultMetrics({
      register,
      prefix: '', // No prefix to match the example output
      eventLoopMonitoringPrecision: 1, // Ensure eventloop metrics are collected
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Match the example buckets
    });

    // Create new metrics instance
    metrics = await createMetrics();
    log.info('Created new metrics...', { evt: 'created' });

    // Load saved metrics
    const savedMetrics = await loadMetricsFromFile();
    if (savedMetrics.length > 0) {
      log.info('Restoring saved metrics...', { evt: 'restore_metrics' });
      savedMetrics.forEach((metric) => {
        if (metric.values) {
          metric.values.forEach((value) => {
            switch (metric.name) {
              case 'mw_user_count':
                metrics?.user.inc(value.labels, value.value);
                break;
              case 'mw_captcha_solves':
                metrics?.captchaSolves.inc(value.labels, value.value);
                break;
              case 'mw_provider_hostname_count':
                metrics?.providerHostnames.inc(value.labels, value.value);
                break;
              case 'mw_provider_status_count':
                metrics?.providerStatuses.inc(value.labels, value.value);
                break;
              case 'mw_media_watch_count':
                metrics?.watchMetrics.inc(value.labels, value.value);
                break;
              case 'mw_provider_tool_count':
                metrics?.toolMetrics.inc(value.labels, value.value);
                break;
              case 'http_request_duration_seconds':
                // For histograms, special handling for sum and count
                if (value.metricName === 'http_request_duration_seconds_sum' ||
                    value.metricName === 'http_request_duration_seconds_count') {
                  metrics?.httpRequestDuration.observe(value.labels, value.value);
                }
                break;
            }
          });
        }
      });
    }

    // Initialize metrics with current data
    log.info('Syncing up metrics...', { evt: 'sync' });
    await updateMetrics();
    log.info('Metrics initialized!', { evt: 'end' });

    // Save initial state
    await saveMetricsToFile();
  } catch (error) {
    log.error('Failed to setup metrics', {
      evt: 'setup_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function updateMetrics() {
  try {
    log.info('Fetching users from database...', { evt: 'update_metrics_start' });
    
    const users = await prisma.users.groupBy({
      by: ['namespace'],
      _count: true,
    });

    log.info('Found users', { evt: 'users_found', count: users.length });

    metrics?.user.reset();
    log.info('Reset user metrics counter', { evt: 'metrics_reset' });

    users.forEach((v) => {
      log.info('Incrementing user metric', { 
        evt: 'increment_metric',
        namespace: v.namespace, 
        count: v._count 
      });
      metrics?.user.inc({ namespace: v.namespace }, v._count);
    });

    log.info('Successfully updated metrics', { evt: 'update_metrics_complete' });
  } catch (error) {
    log.error('Failed to update metrics', { 
      evt: 'update_metrics_error',
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Export function to record HTTP request duration
export function recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
  if (!metrics) return;
  
  const labels = { 
    method, 
    route, 
    status_code: statusCode.toString() 
  };
  
  // Record in both histogram and summary
  metrics.httpRequestDuration.observe(labels, duration);
  metrics.httpRequestSummary.observe(labels, duration);
}

// Functions to match previous backend API
export function recordProviderMetrics(items: any[], hostname: string, tool?: string) {
  if (!metrics) return;
  
  // Record hostname once per request
  metrics.providerHostnames.inc({ hostname });

  // Record status and watch metrics for each item
  items.forEach((item) => {
    // Record provider status
    metrics.providerStatuses.inc({
      provider_id: item.embedId ?? item.providerId,
      status: item.status,
    });

    // Record watch metrics for each item
    metrics.watchMetrics.inc({
      tmdb_full_id: item.type + '-' + item.tmdbId,
      provider_id: item.providerId,
      title: item.title,
      success: (item.status === 'success').toString(),
    });
  });

  // Record tool metrics
  if (tool) {
    metrics.toolMetrics.inc({ tool });
  }
}

export function recordCaptchaMetrics(success: boolean) {
  metrics?.captchaSolves.inc({ success: success.toString() });
} 