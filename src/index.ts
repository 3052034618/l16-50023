import express from 'express';
import bodyParser from 'body-parser';
import { initDatabase, flushToDisk } from './database/store';
import { alertService } from './services/alertService';
import { pushService } from './services/pushService';
import pushRoutes from './routes/pushRoutes';
import templateRoutes from './routes/templateRoutes';
import userRoutes from './routes/userRoutes';
import queueRoutes from './routes/queueRoutes';
import historyRoutes from './routes/historyRoutes';
import monitorRoutes from './routes/monitorRoutes';
import appRoutes from './routes/appRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api/push', pushRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/apps', appRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

let queueWorkerInterval: NodeJS.Timeout | null = null;

function startQueueWorker() {
  const interval = parseInt(process.env.QUEUE_INTERVAL || '5000');
  console.log(`[Worker] Queue worker started, interval: ${interval}ms`);
  
  queueWorkerInterval = setInterval(async () => {
    try {
      const count = await pushService.processQueue(undefined, 20);
      if (count > 0) {
        console.log(`[Worker] Processed ${count} messages`);
      }
    } catch (error) {
      console.error('[Worker] Error processing queue:', error);
    }
  }, interval);
}

function stopQueueWorker() {
  if (queueWorkerInterval) {
    clearInterval(queueWorkerInterval);
    queueWorkerInterval = null;
    console.log('[Worker] Queue worker stopped');
  }
}

function startServer() {
  initDatabase();
  console.log('[Database] Initialized with persistence');

  startQueueWorker();
  
  const monitorInterval = parseInt(process.env.MONITOR_INTERVAL || '60000');
  if (monitorInterval > 0) {
    alertService.startMonitoring(monitorInterval);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Push Center Server started`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API Base: http://localhost:${PORT}/api`);
    console.log(`\n   Available endpoints:`);
    console.log(`   - POST /api/push/send              - 发送消息`);
    console.log(`   - POST /api/push/process-queue     - 手动处理队列`);
    console.log(`   - GET  /api/templates              - 模板列表`);
    console.log(`   - GET  /api/users                  - 用户列表`);
    console.log(`   - GET  /api/queue/stats            - 队列统计`);
    console.log(`   - GET  /api/history/stats/delivery - 送达统计`);
    console.log(`   - GET  /api/history/stats/by-app   - 按业务系统统计`);
    console.log(`   - GET  /api/monitor/overview       - 监控总览`);
    console.log(`   - GET  /api/monitor/queue/backlog-trend - 积压趋势`);
    console.log(`   - GET  /api/monitor/failure-reasons - 失败原因排行`);
    console.log(`   - GET  /api/monitor/alerts/active  - 活跃告警`);
    console.log(`   - POST /api/apps                   - 创建接入方`);
    console.log('');
  });
}

function gracefulShutdown() {
  console.log('\nShutting down...');
  stopQueueWorker();
  alertService.stopMonitoring();
  flushToDisk();
  console.log('[Persistence] Data flushed to disk');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

if (require.main === module) {
  startServer();
}

export { app, startServer, stopQueueWorker };
