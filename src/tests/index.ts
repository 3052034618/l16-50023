import { initDatabase, flushToDisk } from '../database/store';
import { templateService } from '../services/templateService';
import { userService } from '../services/userService';
import { pushService } from '../services/pushService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { alertService } from '../services/alertService';
import { channelManager } from '../channels/channelManager';
import { appRepo, backlogSnapshotRepo } from '../database/store';
import { ChannelType } from '../types';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  const startTime = Date.now();
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      const duration = Date.now() - startTime;
      results.push({ name, passed: true, message: 'PASS', duration });
      console.log(`  ✓ ${name} (${duration}ms)`);
    })
    .catch((error) => {
      const duration = Date.now() - startTime;
      results.push({ name, passed: false, message: error.message, duration });
      console.log(`  ✗ ${name}: ${error.message} (${duration}ms)`);
    });
}

function assert(condition: any, message?: string) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  多渠道消息推送中心 - 功能测试 v2');
  console.log('='.repeat(60) + '\n');

  initDatabase(':memory:');

  console.log('\n📦 1. 渠道适配器测试');
  await test('邮件渠道 - 正常发送', async () => {
    const result = await channelManager.send('email', 'test@example.com', 'Test Subject', 'Test content');
    assert(result.success === true, '邮件发送应该成功');
  });
  await test('邮件渠道 - 无效地址', async () => {
    const result = await channelManager.send('email', 'invalid-email', 'Test', 'Content');
    assert(result.success === false, '无效邮箱应该失败');
  });
  await test('短信渠道 - 正常发送', async () => {
    const result = await channelManager.send('sms', '13800138000', undefined, 'Test SMS');
    assert(result.success === true, '短信发送应该成功');
  });
  await test('站内信渠道 - 正常发送', async () => {
    const result = await channelManager.send('inapp', 'user-123', 'Notice', 'New message');
    assert(result.success === true, '站内信发送应该成功');
  });
  await test('Webhook渠道 - 正常发送', async () => {
    const result = await channelManager.send('webhook', 'https://example.com/hook', 'Alert', 'Fired');
    assert(result.success === true, 'Webhook发送应该成功');
  });

  console.log('\n📄 2. 消息模板与多语言测试');
  let templateId: string;
  await test('创建模板', () => {
    const tpl = templateService.createTemplate({ name: '测试模板', category: 'general', priority: 'normal' });
    templateId = tpl.id;
    assert(tpl.name === '测试模板');
  });
  await test('添加中文+英文+日文模板内容', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '您好，${username}！', content: '尊敬的${username}，验证码是${code}。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'en', channel: 'email', subject: 'Hello, ${username}!', content: 'Dear ${username}, your code is ${code}.' });
    templateService.addTemplateContent({ template_id: templateId, language: 'ja', channel: 'email', subject: '${username}さん、こんにちは', content: '${username}さん、認証コードは${code}です。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'inapp', subject: '系统通知', content: '${username}，您有新通知。' });
  });
  await test('渲染中文模板', () => {
    const r = templateService.renderTemplate(templateId, 'zh-CN', 'email', { username: '小明', code: '111' });
    assert(r?.subject === '您好，小明！');
    assert(r?.content.includes('111'));
  });
  await test('渲染英文模板', () => {
    const r = templateService.renderTemplate(templateId, 'en', 'email', { username: 'John', code: '222' });
    assert(r?.subject === 'Hello, John!');
    assert(r?.content.includes('222'));
  });
  await test('渲染日文模板', () => {
    const r = templateService.renderTemplate(templateId, 'ja', 'email', { username: '田中', code: '333' });
    assert(r?.subject === '田中さん、こんにちは');
  });

  console.log('\n👤 3. 用户与订阅偏好测试');
  let userId: string;
  await test('创建用户', () => {
    const user = userService.createUser({ name: '测试用户', email: 'test@example.com', phone: '13800138000', language: 'zh-CN' });
    userId = user.id;
    assert(user.language === 'zh-CN');
  });
  await test('禁用邮件营销通知', () => {
    const pref = userService.setPreference(userId, 'marketing', 'email', false);
    assert(pref.enabled === false);
  });
  await test('安全通知默认启用', () => {
    assert(userService.isChannelEnabled(userId, 'security', 'email') === true);
  });

  console.log('\n📤 4. 推送服务 - 语言锁定测试');
  await test('中文用户发中文消息', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '123' } });
    assert(result.messages.length > 0);
  });
  await test('队列中语言已锁定为 zh-CN', () => {
    const stats = queueService.getStats();
    assert(stats.pending > 0);
    const msgs = queueService.getNextMessages(undefined, 20);
    assert(msgs.some(m => m.language === 'zh-CN'), '队列中应有语言为zh-CN的消息');
  });
  await test('处理队列后历史记录语言正确', async () => {
    await pushService.processQueue(undefined, 20);
    const hist = historyService.list({ pageSize: 1 });
    assert(hist.items.length > 0);
    assert(hist.items[0].language === 'zh-CN', '历史语言应为zh-CN');
  });

  console.log('\n🌐 5. 英文用户发送英文消息测试');
  let enUserId: string;
  await test('创建英文偏好用户', () => {
    const user = userService.createUser({ name: 'English User', email: 'en@example.com', phone: '13900001111', language: 'en' });
    enUserId = user.id;
    assert(user.language === 'en');
  });
  await test('英文用户发消息 - 队列锁定英文', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: enUserId, params: { username: 'John', code: '999' } });
    assert(result.messages.length > 0);
  });
  await test('英文消息处理后历史语言为en', async () => {
    await pushService.processQueue(undefined, 20);
    const hist = historyService.list({ user_id: enUserId, pageSize: 5 });
    assert(hist.items.length > 0, '英文用户应有发送历史');
    assert(hist.items[0].language === 'en', `历史语言应为en，实际: ${hist.items[0].language}`);
    assert(hist.items[0].subject?.includes('Hello'), `英文标题应包含Hello，实际: ${hist.items[0].subject}`);
  });
  await test('显式指定语言覆盖用户偏好', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: enUserId, language: 'ja', params: { username: '田中', code: '444' } });
    assert(result.messages.length > 0);
  });
  await test('日语覆盖处理后历史语言为ja', async () => {
    await pushService.processQueue(undefined, 20);
    const hist = historyService.list({ user_id: enUserId, pageSize: 5 });
    const jaRecord = hist.items.find(h => h.language === 'ja');
    assert(jaRecord, '应有日语发送记录');
    assert(jaRecord!.subject?.includes('さん'), '日语标题应包含敬称');
  });

  console.log('\n� 6. 接入方管理测试');
  let appId: string;
  let appSecret: string;
  await test('创建接入方', () => {
    const app = appRepo.create({ name: '订单系统', description: '订单通知推送' });
    appId = app.id;
    appSecret = app.secret;
    assert(app.id, '应有ID');
    assert(app.secret, '应有密钥');
    assert(app.enabled === true);
  });
  await test('认证成功', () => {
    const app = appRepo.authenticate(appId, appSecret);
    assert(app !== undefined, '正确凭证应认证成功');
  });
  await test('认证失败 - 错误密钥', () => {
    const app = appRepo.authenticate(appId, 'wrong-secret');
    assert(app === undefined, '错误密钥应认证失败');
  });
  await test('带app_id推送消息', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '测试', code: '555' }, app_id: appId });
    assert(result.messages.length > 0);
  });
  await test('处理后历史记录包含app_id', async () => {
    await pushService.processQueue(undefined, 20);
    const hist = historyService.list({ app_id: appId, pageSize: 5 });
    assert(hist.items.length > 0, '应有带app_id的历史记录');
    assert(hist.items[0].app_id === appId);
  });
  await test('按业务系统统计', () => {
    const stats = historyService.getStatsByApp({ limit: 10 });
    assert(stats.length > 0, '应有按业务系统的统计');
  });
  await test('重置接入方密钥', () => {
    const updated = appRepo.regenerateSecret(appId);
    assert(updated!.secret !== appSecret, '新密钥应不同于旧密钥');
  });

  console.log('\n📊 7. 统计报表测试');
  await test('送达率统计', () => {
    const stats = historyService.getDeliveryStats();
    assert(typeof stats.delivery_rate === 'number');
    assert(stats.delivery_rate >= 0 && stats.delivery_rate <= 1);
  });
  await test('按渠道统计', () => {
    const byChannel = historyService.getStatsByChannel();
    assert(byChannel.length === 4);
  });
  await test('按模板统计', () => {
    const byTemplate = historyService.getStatsByTemplate({ limit: 10 });
    assert(byTemplate.length > 0);
  });
  await test('失败原因排行', () => {
    const reasons = historyService.getFailureReasons({ limit: 10 });
    assert(Array.isArray(reasons));
  });

  console.log('\n🚨 8. 告警监控与积压趋势测试');
  await test('创建大量消息制造积压', () => {
    for (let i = 0; i < 150; i++) {
      queueService.enqueue({ template_id: templateId, user_id: userId, channel: 'email', priority: 'normal', params: { test: i }, language: 'zh-CN' });
    }
    const stats = queueService.getStats();
    assert(stats.pending >= 100);
  });
  await test('检查队列积压告警', () => {
    const alerts = alertService.checkQueueBacklog();
    assert(alerts.some(a => a.type === 'queue_backlog_channel' || a.type === 'queue_backlog_global'));
  });
  await test('获取活跃告警', () => {
    const active = alertService.getActiveAlerts();
    assert(active.length > 0);
  });
  await test('采集积压快照', () => {
    const snapshots = backlogSnapshotRepo.capture();
    assert(snapshots.length === 4, '应有4个渠道快照');
  });
  await test('获取积压趋势', () => {
    const trend = alertService.getBacklogTrend();
    assert(trend.length > 0, '应有趋势数据');
    assert(trend[0].channel, '趋势数据应有渠道');
    assert(typeof trend[0].pending === 'number');
  });
  await test('自动恢复告警检查', () => {
    const resolved = alertService.runAutoResolve();
    assert(typeof resolved === 'number');
  });

  console.log('\n💾 9. 持久化测试');
  await test('写入文件后数据量应>0', () => {
    flushToDisk();
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'push-center-data.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      assert(data.templates.length > 0, '持久化文件中应有模板数据');
      assert(data.sendHistory.length > 0, '持久化文件中应有发送历史');
    } else {
      throw new Error('持久化文件未创建');
    }
  });

  console.log('\n🔄 10. 高优先级跳过订阅测试');
  let secTemplateId: string;
  await test('创建安全通知模板', () => {
    const tpl = templateService.createTemplate({ name: '安全警告', category: 'security', priority: 'high' });
    secTemplateId = tpl.id;
    templateService.addTemplateContent({ template_id: secTemplateId, language: 'zh-CN', channel: 'email', subject: '安全警告', content: '${username}，异常登录。' });
    templateService.addTemplateContent({ template_id: secTemplateId, language: 'zh-CN', channel: 'sms', content: '【安全警告】异常登录。' });
  });
  await test('高优先级消息跳过订阅偏好', async () => {
    userService.setPreference(userId, 'security', 'sms', false);
    const result = await pushService.send({ template_id: secTemplateId, user_id: userId, params: { username: '测试用户' }, priority: 'high' });
    const hasSms = result.messages.some(m => m.channel === 'sms');
    assert(hasSms, '高优先级应跳过订阅偏好发送短信');
  });

  console.log('\n' + '='.repeat(60));
  console.log('  测试结果汇总');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n  总数: ${total}`);
  console.log(`  通过: ${passed} ✓`);
  console.log(`  失败: ${failed} ✗`);
  console.log(`  总耗时: ${totalDuration}ms`);
  console.log(`  通过率: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n  失败的测试:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
  return failed === 0;
}

if (require.main === module) {
  runTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => { console.error('测试运行出错:', error); process.exit(1); });
}

export { runTests };
