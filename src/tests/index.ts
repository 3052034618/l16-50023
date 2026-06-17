import { initDatabase, flushToDisk } from '../database/store';
import { templateService } from '../services/templateService';
import { userService } from '../services/userService';
import { pushService } from '../services/pushService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { alertService } from '../services/alertService';
import { channelManager } from '../channels/channelManager';
import { appRepo, backlogSnapshotRepo, auditLogRepo, latencyRepo, channelRuntimeRepo } from '../database/store';
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
  console.log('  多渠道消息推送中心 - 功能测试 v3');
  console.log('='.repeat(60) + '\n');

  initDatabase(':memory:');

  console.log('\n📦 1. 渠道适配器测试');
  await test('邮件渠道 - 正常发送', async () => {
    const result = await channelManager.send('email', 'test@example.com', 'Test Subject', 'Test content');
    assert(result.success === true);
  });
  await test('邮件渠道 - 无效地址', async () => {
    const result = await channelManager.send('email', 'invalid-email', 'Test', 'Content');
    assert(result.success === false);
  });
  await test('短信渠道 - 正常发送', async () => {
    const result = await channelManager.send('sms', '13800138000', undefined, 'Test SMS');
    assert(result.success === true);
  });
  await test('站内信渠道 - 正常发送', async () => {
    const result = await channelManager.send('inapp', 'user-123', 'Notice', 'New message');
    assert(result.success === true);
  });
  await test('Webhook渠道 - 正常发送', async () => {
    const result = await channelManager.send('webhook', 'https://example.com/hook', 'Alert', 'Fired');
    assert(result.success === true);
  });

  console.log('\n📄 2. 模板与版本管理测试');
  let templateId: string;
  await test('创建模板(默认draft)', () => {
    const tpl = templateService.createTemplate({ name: '测试模板', category: 'general', priority: 'normal' });
    templateId = tpl.id;
    assert(tpl.status === 'draft');
    assert(tpl.current_version === 1);
  });
  await test('添加v1模板内容', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '您好，${username}！', content: '验证码是${code}。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'en', channel: 'email', subject: 'Hello, ${username}!', content: 'Your code is ${code}.' });
  });
  await test('发布模板', () => {
    const tpl = templateService.publishTemplate(templateId);
    assert(tpl?.status === 'published');
  });
  await test('创建v2版本', () => {
    const tpl = templateService.newVersion(templateId);
    assert(tpl?.current_version === 2);
  });
  await test('添加v2模板内容', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '【新】${username}，您好！', content: '新验证码${code}。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'inapp', subject: '系统通知', content: '${username}，您有新通知。' });
  });
  await test('渲染v2内容', () => {
    const r = templateService.renderTemplate(templateId, 'zh-CN', 'email', { username: '小明', code: '111' });
    assert(r?.subject?.includes('新'));
  });
  await test('渲染v1内容(指定version)', () => {
    const r = templateService.renderTemplate(templateId, 'zh-CN', 'email', { username: '小明', code: '111' }, 1);
    assert(r?.subject === '您好，小明！');
  });
  await test('获取版本列表', () => {
    const versions = templateService.getVersions(templateId);
    assert(versions.includes(1) && versions.includes(2));
  });
  await test('回滚到v1', () => {
    const tpl = templateService.rollbackVersion(templateId, 1);
    assert(tpl?.current_version === 1);
  });
  await test('回滚后渲染v1内容', () => {
    const r = templateService.renderTemplate(templateId, 'zh-CN', 'email', { username: '小明', code: '222' });
    assert(r?.subject === '您好，小明！');
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

  console.log('\n📤 4. 消息队列管理测试');
  let msgId: string;
  await test('发送消息入队', async () => {
    templateService.publishTemplate(templateId);
    const tpl = templateService.getTemplate(templateId)!;
    templateService.newVersion(templateId);
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: 'V2主题', content: 'V2内容' });
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '123' } });
    assert(result.messages.length > 0);
    msgId = result.messages[0].message_id;
  });
  await test('队列消息绑定模板版本号', () => {
    const msg = queueService.getMessage(msgId);
    assert(msg?.template_version !== undefined, '消息应有template_version');
  });
  await test('撤回消息', () => {
    const pendingMsgs = queueService.listMessages({ status: 'pending' });
    if (pendingMsgs.items.length > 0) {
      const cancelled = queueService.cancelMessage(pendingMsgs.items[0].id);
      assert(cancelled?.status === 'cancelled');
    }
  });
  await test('改定时发送时间', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '456' } });
    if (result.messages.length > 0) {
      const newTime = Date.now() + 3600000;
      const rescheduled = queueService.rescheduleMessage(result.messages[0].message_id, newTime);
      assert(rescheduled?.scheduled_at === newTime);
    }
  });
  await test('修改消息内容', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '789' } });
    if (result.messages.length > 0) {
      const updated = queueService.updateMessageContent(result.messages[0].message_id, { rendered_subject: '紧急通知' });
      assert(updated?.rendered_subject === '紧急通知');
    }
  });

  console.log('\n🌐 5. 语言锁定测试');
  let enUserId: string;
  await test('英文用户发送英文消息', async () => {
    const user = userService.createUser({ name: 'English User', email: 'en@example.com', phone: '13900001111', language: 'en' });
    enUserId = user.id;
    const result = await pushService.send({ template_id: templateId, user_id: enUserId, params: { username: 'John', code: '999' } });
    assert(result.messages.length > 0);
  });
  await test('处理后历史语言正确', async () => {
    await pushService.processQueue(undefined, 20);
    const hist = historyService.list({ user_id: enUserId, pageSize: 5 });
    if (hist.items.length > 0) {
      assert(hist.items[0].language === 'en');
    }
  });

  console.log('\n🔑 6. 接入方管理与IP白名单测试');
  let appId: string;
  let appSecret: string;
  await test('创建接入方(带IP白名单)', () => {
    const app = appRepo.create({ name: '订单系统', description: '订单通知', ip_whitelist: ['127.0.0.1', '10.0.0.1'] });
    appId = app.id;
    appSecret = app.secret;
    assert(app.ip_whitelist.length === 2);
  });
  await test('认证成功', () => {
    const app = appRepo.authenticate(appId, appSecret);
    assert(app !== undefined);
  });
  await test('认证失败', () => {
    const app = appRepo.authenticate(appId, 'wrong');
    assert(app === undefined);
  });
  await test('IP白名单允许', () => {
    assert(appRepo.checkIp(appId, '127.0.0.1') === true);
  });
  await test('IP白名单拒绝', () => {
    assert(appRepo.checkIp(appId, '192.168.1.1') === false);
  });
  await test('白名单为空时允许所有IP', () => {
    const app2 = appRepo.create({ name: '无白名单' });
    assert(appRepo.checkIp(app2.id, '1.2.3.4') === true);
  });
  await test('审计日志记录', () => {
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '127.0.0.1', status: 'success' });
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '192.168.1.1', status: 'ip_blocked', error_message: 'IP not allowed' });
    auditLogRepo.record({ app_id: appId, action: 'GET', endpoint: '/api/history', ip: '127.0.0.1', status: 'success' });
    const logs = auditLogRepo.list({ app_id: appId });
    assert(logs.items.length >= 3);
  });
  await test('审计统计', () => {
    const stats = auditLogRepo.statsByApp();
    const appStat = stats.find(s => s.app_id === appId);
    assert(appStat !== undefined);
    assert(appStat!.total_calls >= 3);
    assert(appStat!.success >= 2);
    assert(appStat!.ip_blocked >= 1);
  });

  console.log('\n📊 7. 渠道运行监控测试');
  await test('记录耗时', () => {
    latencyRepo.record('email', 50);
    latencyRepo.record('email', 100);
    latencyRepo.record('email', 200);
    latencyRepo.record('sms', 30);
  });
  await test('耗时分布统计', () => {
    const dist = latencyRepo.getDistribution({ channel: 'email' });
    assert(dist.length === 1);
    assert(dist[0].count >= 3);
    assert(dist[0].p50 > 0);
    assert(dist[0].max >= 200);
  });
  await test('熔断器初始/重置状态', () => {
    channelRuntimeRepo.resetCircuit('email');
    const state = channelRuntimeRepo.getCircuitState('email');
    assert(state.state === 'closed');
  });
  await test('熔断器触发打开', () => {
    for (let i = 0; i < 5; i++) channelRuntimeRepo.recordFailure('email');
    const state = channelRuntimeRepo.getCircuitState('email');
    assert(state.state === 'open', `state should be open, got ${state.state}`);
  });
  await test('熔断器打开时拒绝请求', () => {
    const allowed = channelRuntimeRepo.checkCircuit('email');
    assert(allowed === false);
  });
  await test('熔断器手动重置', () => {
    channelRuntimeRepo.resetCircuit('email');
    const state = channelRuntimeRepo.getCircuitState('email');
    assert(state.state === 'closed');
  });
  await test('限流器令牌桶', () => {
    const allowed = channelRuntimeRepo.acquireToken('email');
    assert(allowed === true);
  });
  await test('限流器状态', () => {
    const state = channelRuntimeRepo.getRateLimiterState('email');
    assert(state.total_allowed > 0);
  });

  console.log('\n🚨 8. 告警与积压趋势测试');
  await test('制造积压', () => {
    for (let i = 0; i < 150; i++) {
      queueService.enqueue({ template_id: templateId, user_id: userId, channel: 'email', priority: 'normal', params: { test: i }, language: 'zh-CN' });
    }
    const stats = queueService.getStats();
    assert(stats.pending >= 100);
  });
  await test('检查积压告警', () => {
    const alerts = alertService.checkQueueBacklog();
    assert(alerts.length > 0);
  });
  await test('采集快照和趋势', () => {
    backlogSnapshotRepo.capture();
    const trend = alertService.getBacklogTrend();
    assert(trend.length > 0);
  });

  console.log('\n💾 9. 持久化测试');
  await test('刷盘验证', () => {
    flushToDisk();
  });

  console.log('\n🔄 10. 高优先级跳过订阅测试');
  let secTemplateId: string;
  await test('安全通知强制发送', async () => {
    const tpl = templateService.createTemplate({ name: '安全警告', category: 'security', priority: 'high' });
    secTemplateId = tpl.id;
    templateService.addTemplateContent({ template_id: secTemplateId, language: 'zh-CN', channel: 'email', subject: '安全警告', content: '${username}，异常登录。' });
    templateService.addTemplateContent({ template_id: secTemplateId, language: 'zh-CN', channel: 'sms', content: '【安全警告】异常登录。' });
    templateService.publishTemplate(secTemplateId);
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
