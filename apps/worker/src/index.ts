import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { executeRun } from './executor.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  'run-execution',
  async (job) => {
    const { runId, projectId, rerunFromStep } = job.data;
    console.log(`[Worker] Executing run ${runId} for project ${projectId}`);
    await executeRun(runId, projectId, rerunFromStep);
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

console.log('[Worker] Chip3D Worker started, listening for jobs...');

process.on('SIGTERM', async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
});
