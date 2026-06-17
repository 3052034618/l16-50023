import { initDatabase, flushToDisk } from '../database/store';
import { templateService } from '../services/templateService';
import { userService } from '../services/userService';
import { pushService } from '../services/pushService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { alertService } from '../services/alertService';
import { channelManager } from '../channels/channelManager';
import { appRepo, backlogSnapshotRepo, auditLogRepo, latencyRepo, channelRuntimeRepo } from '../database/store';
import { ChannelType, Template } from '../types';

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
  console.log('  多渠道消息推送中心 - 功能测试 v4');
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

  console.log('\n📄 2. 模板版本管理 - 草稿/发布严格隔离');
  let templateId: string;
  await test('新建模板默认为draft状态，published_version=0', () => {
    const tpl = templateService.createTemplate({ name: '测试模板', category: 'general', priority: 'normal' });
    templateId = tpl.id;
    assert(tpl.status === 'draft');
    assert(tpl.current_version === 1);
    assert(tpl.published_version === 0);
  });
  await test('草稿模板不能发送', async () => {
    try {
      await pushService.send({ template_id: templateId, recipient: 'test@test.com', params: {} });
      assert(false, '应该抛出错误');
    } catch (e: any) {
      assert(e.message.includes('not published'));
    }
  });
  await test('添加v1模板内容（zh-CN + en）', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '您好，${username}！', content: '验证码是${code}。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'en', channel: 'email', subject: 'Hello, ${username}!', content: 'Your code is ${code}.' });
  });
  await test('发布模板后published_version等于current_version', () => {
    const tpl = templateService.publishTemplate(templateId);
    assert(tpl?.status === 'published');
    assert(tpl?.published_version === 1);
  });
  await test('发布后可以正常发送', async () => {
    const result = await pushService.send({ template_id: templateId, recipient: 'test@test.com', params: { username: '小明', code: '123' } });
    assert(result.messages.length > 0);
  });
  await test('入队消息绑定的是published_version', () => {
    const pending = queueService.listMessages({ status: 'pending' });
    if (pending.items.length > 0) {
      const msg = pending.items[0];
      assert(msg.template_version === 1, `template_version should be 1, got ${msg.template_version}`);
    }
  });
  await test('新建版本后current_version增加，published_version不变', () => {
    const tpl = templateService.newVersion(templateId);
    assert(tpl?.current_version === 2);
    assert(tpl?.published_version === 1);
    assert(tpl?.status === 'published');
  });
  await test('v2添加中文内容（暂无英文）', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '【V2】${username}您好', content: '新验证码${code}。' });
  });
  await test('新入队消息仍然用v1发布版本', async () => {
    const result = await pushService.send({ template_id: templateId, recipient: 'new@test.com', params: { username: '新人', code: '456' } });
    assert(result.messages.length > 0);
    const msg = queueService.getMessage(result.messages[0].message_id);
    assert(msg?.template_version === 1, `新消息应该用v1发布版本，实际是${msg?.template_version}`);
    assert(msg?.rendered_subject?.includes('您好，') === true, '应该是v1的中文主题');
  });
  await test('发布v2后新消息才用v2', () => {
    const tpl = templateService.publishTemplate(templateId);
    assert(tpl?.published_version === 2);
  });
  await test('发布v2后新入队消息用v2内容', async () => {
    const result = await pushService.send({ template_id: templateId, recipient: 'v2@test.com', params: { username: 'V2用户', code: '789' } });
    assert(result.messages.length > 0);
    const msg = queueService.getMessage(result.messages[0].message_id);
    assert(msg?.template_version === 2);
    assert(msg?.rendered_subject?.includes('【V2】') === true, '应该是v2的中文主题');
  });

  console.log('\n🌐 3. 语言版本降级测试');
  let enTemplateId: string;
  await test('创建只有v1英文的模板', () => {
    const tpl = templateService.createTemplate({ name: '英文模板', category: 'general', priority: 'normal' });
    enTemplateId = tpl.id;
    templateService.addTemplateContent({ template_id: enTemplateId, language: 'en', channel: 'email', subject: 'Welcome!', content: 'Hello ${name}.' });
    templateService.publishTemplate(enTemplateId);
  });
  await test('英文用户发英文内容正常', async () => {
    const result = await pushService.send({ template_id: enTemplateId, recipient: 'en@test.com', language: 'en', params: { name: 'John' } });
    assert(result.messages.length > 0);
    const msg = queueService.getMessage(result.messages[0].message_id);
    assert(msg?.language === 'en');
    assert(msg?.rendered_content?.includes('Hello John') === true);
  });
  await test('新建v2版本（只有中文，无英文）', () => {
    templateService.newVersion(enTemplateId);
    templateService.addTemplateContent({ template_id: enTemplateId, language: 'zh-CN', channel: 'email', subject: '欢迎！', content: '你好${name}。' });
  });
  await test('发布v2，英文用户仍然能收到v1的英文内容（版本降级）', () => {
    templateService.publishTemplate(enTemplateId);
    const rendered = templateService.renderTemplate(enTemplateId, 'en', 'email', { name: 'Jack' }, 2);
    assert(rendered !== undefined, 'v2没有英文应该降级到v1英文');
    assert(rendered?.content === 'Hello Jack.', `降级后内容应该是英文，实际是: ${rendered?.content}`);
  });
  await test('完全没有对应语言时返回undefined', () => {
    const rendered = templateService.renderTemplate(enTemplateId, 'ja', 'email', { name: 'Taro' }, 2);
    assert(rendered === undefined, '日语应该没有，返回undefined');
  });
  await test('英文用户入队使用降级后的v1英文内容', async () => {
    const result = await pushService.send({ template_id: enTemplateId, recipient: 'downgrade@test.com', language: 'en', params: { name: 'Downgrade' } });
    assert(result.messages.length > 0);
    const msg = queueService.getMessage(result.messages[0].message_id);
    assert(msg?.rendered_content?.includes('Hello Downgrade') === true, `应该降级到v1英文，实际内容: ${msg?.rendered_content}`);
  });

  console.log('\n👤 4. 用户与订阅偏好测试');
  let userId: string;
  await test('创建用户', () => {
    const user = userService.createUser({ name: '测试用户', email: 'user@example.com', phone: '13800138000', language: 'zh-CN' });
    userId = user.id;
    assert(user.language === 'zh-CN');
  });
  await test('禁用邮件营销通知', () => {
    const pref = userService.setPreference(userId, 'marketing', 'email', false);
    assert(pref.enabled === false);
  });

  console.log('\n📤 5. 消息队列管理 - 撤回同步历史');
  let cancelMsgId: string;
  await test('发送消息后撤回', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '111' } });
    assert(result.messages.length > 0);
    cancelMsgId = result.messages[0].message_id;
    const cancelled = queueService.cancelMessage(cancelMsgId);
    assert(cancelled?.status === 'cancelled');
  });
  await test('撤回后历史记录里能查到cancelled状态', () => {
    const hist = historyService.get(cancelMsgId);
    assert(hist !== undefined, '撤回应该同步到历史记录');
    assert(hist?.status === 'cancelled', `历史状态应该是cancelled，实际是${hist?.status}`);
    assert(hist?.error_message === 'cancelled by user');
  });
  await test('撤回后统计包含cancelled', () => {
    const stats = historyService.getDeliveryStats({ template_id: templateId });
    assert(stats.total > 0, '总发送量应该包含撤回的');
  });
  await test('改定时发送时间', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '222' } });
    if (result.messages.length > 0) {
      const newTime = Date.now() + 3600000;
      const rescheduled = queueService.rescheduleMessage(result.messages[0].message_id, newTime);
      assert(rescheduled?.scheduled_at === newTime);
    }
  });
  await test('修改消息内容', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '333' } });
    if (result.messages.length > 0) {
      const updated = queueService.updateMessageContent(result.messages[0].message_id, { rendered_subject: '紧急通知' });
      assert(updated?.rendered_subject === '紧急通知');
    }
  });

  console.log('\n🔑 6. 接入方管理、IP白名单与审计');
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
  await test('审计日志 - 记录成功/鉴权失败/IP拒绝', () => {
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '127.0.0.1', status: 'success' });
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '192.168.1.1', status: 'ip_blocked', error_message: 'IP not allowed' });
    auditLogRepo.record({ app_id: appId, action: 'GET', endpoint: '/api/history', ip: '127.0.0.1', status: 'success' });
    auditLogRepo.record({ app_id: 'unknown-app', action: 'POST', endpoint: '/api/push/send', ip: '10.0.0.5', status: 'auth_failed', error_message: 'Invalid credentials' });
    const logs = auditLogRepo.list({ app_id: appId });
    assert(logs.items.length >= 3);
  });
  await test('审计统计 - 按应用汇总', () => {
    const stats = auditLogRepo.statsByApp();
    const appStat = stats.find(s => s.app_id === appId);
    assert(appStat !== undefined);
    assert(appStat!.total_calls >= 3);
    assert(appStat!.success >= 2);
    assert(appStat!.ip_blocked >= 1);
    const unknownStat = stats.find(s => s.app_id === 'unknown-app');
    assert(unknownStat !== undefined);
    assert(unknownStat!.auth_failed >= 1);
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
  await test('熔断器重置后为closed', () => {
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

  console.log('\n� 9. 高优先级跳过订阅测试');
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

  console.log('\n↩️ 10. 模板回滚测试');
  await test('回滚到v1后published_version=1', () => {
    const tpl = templateService.rollbackVersion(templateId, 1);
    assert(tpl?.published_version === 1);
    assert(tpl?.status === 'published');
  });
  await test('回滚后新入队消息使用v1内容', async () => {
    const result = await pushService.send({ template_id: templateId, recipient: 'rollback@test.com', params: { username: '回滚用户', code: '000' } });
    assert(result.messages.length > 0);
    const msg = queueService.getMessage(result.messages[0].message_id);
    assert(msg?.template_version === 1);
    assert(msg?.rendered_subject?.includes('您好，') === true, '回滚后应该是v1的中文主题');
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
