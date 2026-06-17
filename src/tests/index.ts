import { initDatabase } from '../database/store';
import { templateService } from '../services/templateService';
import { userService } from '../services/userService';
import { pushService } from '../services/pushService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { alertService } from '../services/alertService';
import { channelManager } from '../channels/channelManager';
import { appRepo, backlogSnapshotRepo, auditLogRepo, latencyRepo, channelRuntimeRepo, dataManagementRepo } from '../database/store';
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
  console.log('  多渠道消息推送中心 - 功能测试 v5');
  console.log('='.repeat(60) + '\n');

  initDatabase(':memory:');

  console.log('\n📦 1. 渠道适配器测试');
  await test('邮件渠道 - 正常发送', async () => {
    const result = await channelManager.send('email', 'test@example.com', 'Test Subject', 'Test content');
    assert(result.success === true);
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
  await test('新建模板默认为draft，published_version=0', () => {
    const tpl = templateService.createTemplate({ name: '测试模板', category: 'general', priority: 'normal' });
    templateId = tpl.id;
    assert(tpl.status === 'draft');
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
  await test('添加v1内容并发布', () => {
    templateService.addTemplateContent({ template_id: templateId, language: 'zh-CN', channel: 'email', subject: '您好，${username}！', content: '验证码是${code}。' });
    templateService.addTemplateContent({ template_id: templateId, language: 'en', channel: 'email', subject: 'Hello, ${username}!', content: 'Your code is ${code}.' });
    const tpl = templateService.publishTemplate(templateId);
    assert(tpl?.status === 'published');
    assert(tpl?.published_version === 1);
  });
  await test('新建版本后published_version不变', () => {
    const tpl = templateService.newVersion(templateId);
    assert(tpl?.current_version === 2);
    assert(tpl?.published_version === 1);
  });
  await test('回滚后published_version跟着变', () => {
    templateService.publishTemplate(templateId);
    const tpl = templateService.rollbackVersion(templateId, 1);
    assert(tpl?.published_version === 1);
  });

  console.log('\n🌐 3. 缺语言内容 - 明确错误信息');
  let partialTemplateId: string;
  await test('创建只有中文内容的模板', () => {
    const tpl = templateService.createTemplate({ name: '中文模板', category: 'general', priority: 'normal' });
    partialTemplateId = tpl.id;
    templateService.addTemplateContent({ template_id: partialTemplateId, language: 'zh-CN', channel: 'email', subject: '中文主题', content: '中文内容' });
    templateService.publishTemplate(partialTemplateId);
  });
  await test('英文用户发送时返回明确skipped信息', async () => {
    const result = await pushService.send({ template_id: partialTemplateId, recipient: 'en@test.com', language: 'en', params: {} });
    assert(result.skipped !== undefined, '应该有skipped信息');
    assert(result.skipped!.length > 0, '应该有被跳过的渠道');
    const skip = result.skipped![0];
    assert(skip.reason.includes('中文模板'), `原因应包含模板名，实际: ${skip.reason}`);
    assert(skip.reason.includes('en'), `原因应包含语言en，实际: ${skip.reason}`);
    assert(skip.reason.includes('email'), `原因应包含渠道email，实际: ${skip.reason}`);
  });

  console.log('\n👤 4. 用户与订阅偏好');
  let userId: string;
  await test('创建用户', () => {
    const user = userService.createUser({ name: '测试用户', email: 'user@example.com', phone: '13800138000', language: 'zh-CN' });
    userId = user.id;
    assert(user.language === 'zh-CN');
  });

  console.log('\n📤 5. 队列管理 - 撤回同步历史');
  let cancelMsgId: string;
  await test('发送后撤回', async () => {
    const result = await pushService.send({ template_id: templateId, user_id: userId, params: { username: '小明', code: '111' } });
    assert(result.messages.length > 0);
    cancelMsgId = result.messages[0].message_id;
    const cancelled = queueService.cancelMessage(cancelMsgId);
    assert(cancelled?.status === 'cancelled');
  });
  await test('撤回后历史记录能查到cancelled', () => {
    const hist = historyService.get(cancelMsgId);
    assert(hist !== undefined, '撤回应同步到历史');
    assert(hist?.status === 'cancelled');
  });
  await test('统计包含cancelled计数', () => {
    const stats = historyService.getDeliveryStats({ template_id: templateId });
    assert(stats.cancelled >= 1, `cancelled应>=1，实际: ${stats.cancelled}`);
    assert(stats.cancel_rate > 0, `cancel_rate应>0，实际: ${stats.cancel_rate}`);
  });

  console.log('\n📊 6. 统计增强 - 按维度筛选');
  await test('按渠道统计含cancelled', () => {
    const stats = historyService.getStatsByChannel();
    assert(stats.length > 0);
    for (const s of stats) {
      assert(s.stats.cancelled !== undefined, 'stats应该有cancelled字段');
      assert(s.stats.cancel_rate !== undefined, 'stats应该有cancel_rate字段');
    }
  });
  await test('按模板统计含cancelled', () => {
    const stats = historyService.getStatsByTemplate();
    assert(stats.length > 0);
    for (const s of stats) {
      assert(s.stats.cancelled !== undefined);
    }
  });

  console.log('\n🔑 7. 接入方、IP白名单与审计');
  let appId: string;
  let appSecret: string;
  await test('创建接入方', () => {
    const app = appRepo.create({ name: '订单系统', description: '订单通知', ip_whitelist: ['127.0.0.1'] });
    appId = app.id;
    appSecret = app.secret;
    assert(app.ip_whitelist.length === 1);
  });
  await test('IP白名单拒绝', () => {
    assert(appRepo.checkIp(appId, '192.168.1.1') === false);
  });
  await test('白名单为空时允许所有', () => {
    const app2 = appRepo.create({ name: '无白名单' });
    assert(appRepo.checkIp(app2.id, '1.2.3.4') === true);
  });
  await test('审计日志记录', () => {
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '127.0.0.1', status: 'success' });
    auditLogRepo.record({ app_id: appId, action: 'POST', endpoint: '/api/push/send', ip: '192.168.1.1', status: 'ip_blocked', error_message: 'IP not allowed' });
    const logs = auditLogRepo.list({ app_id: appId });
    assert(logs.items.length >= 2);
  });
  await test('审计统计', () => {
    const stats = auditLogRepo.statsByApp();
    const appStat = stats.find(s => s.app_id === appId);
    assert(appStat !== undefined);
    assert(appStat!.success >= 1);
    assert(appStat!.ip_blocked >= 1);
  });

  console.log('\n📊 8. 渠道运行监控');
  await test('记录耗时', () => {
    latencyRepo.record('email', 50);
    latencyRepo.record('email', 100);
    latencyRepo.record('sms', 30);
  });
  await test('耗时分布', () => {
    const dist = latencyRepo.getDistribution({ channel: 'email' });
    assert(dist.length === 1);
    assert(dist[0].count >= 2);
  });
  await test('熔断器重置', () => {
    channelRuntimeRepo.resetCircuit('email');
    const state = channelRuntimeRepo.getCircuitState('email');
    assert(state.state === 'closed');
  });

  console.log('\n🚨 9. 告警');
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

  console.log('\n🔄 10. 高优先级跳过订阅');
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
    assert(hasSms, '高优先级应跳过订阅偏好');
  });

  console.log('\n💾 11. 数据管理');
  await test('默认数据标签为production', () => {
    const tag = dataManagementRepo.getTag();
    assert(tag === 'production');
  });
  await test('设置数据标签为test', () => {
    dataManagementRepo.setTag('test');
    assert(dataManagementRepo.getTag() === 'test');
  });
  await test('查看数据概要', () => {
    const summary = dataManagementRepo.getSummary();
    assert(summary.data_tag === 'test');
    assert(summary.templates > 0);
    assert(summary.users > 0);
  });
  await test('导出备份', () => {
    const backup = dataManagementRepo.exportBackup();
    assert(backup !== undefined);
    const parsed = backup as any;
    assert(Array.isArray(parsed.templates));
    assert(parsed.data_tag === 'test');
  });
  await test('清空test数据', () => {
    const result = dataManagementRepo.clearByTag('test');
    assert(result.cleared.includes('templates'));
    assert(result.cleared.includes('users'));
    assert(result.cleared.includes('messageQueue'));
    assert(dataManagementRepo.getTag() === 'production');
  });
  await test('清空后概要全为0', () => {
    const summary = dataManagementRepo.getSummary();
    assert(summary.templates === 0);
    assert(summary.users === 0);
    assert(summary.queue === 0);
    assert(summary.history === 0);
  });
  await test('恢复备份', () => {
    const backup = {
      data_tag: 'production' as const,
      templates: [{ id: 'tpl-1', name: '恢复模板', category: 'general', priority: 'normal' as const, status: 'draft' as const, current_version: 1, published_version: 0, created_at: Date.now(), updated_at: Date.now() }],
      templateContents: [], users: [], userPreferences: [], messageQueue: [],
      sendHistory: [], alerts: [], apps: [], backlogSnapshots: [], auditLogs: [], latencyRecords: []
    };
    const result = dataManagementRepo.importBackup(backup);
    assert(result.imported.includes('templates'));
    const summary = dataManagementRepo.getSummary();
    assert(summary.templates === 1);
  });

  console.log('\n🌐 12. 语言版本降级');
  let enTemplateId: string;
  await test('创建只有英文的模板', () => {
    const tpl = templateService.createTemplate({ name: '英文模板', category: 'general', priority: 'normal' });
    enTemplateId = tpl.id;
    templateService.addTemplateContent({ template_id: enTemplateId, language: 'en', channel: 'email', subject: 'Welcome!', content: 'Hello ${name}.' });
    templateService.publishTemplate(enTemplateId);
  });
  await test('新版本只有中文，英文降级到上一版', () => {
    templateService.newVersion(enTemplateId);
    templateService.addTemplateContent({ template_id: enTemplateId, language: 'zh-CN', channel: 'email', subject: '欢迎！', content: '你好${name}。' });
    templateService.publishTemplate(enTemplateId);
    const rendered = templateService.renderTemplate(enTemplateId, 'en', 'email', { name: 'Jack' }, 2);
    assert(rendered !== undefined, 'v2没有英文应降级到v1');
    assert(rendered?.content === 'Hello Jack.');
  });
  await test('完全无对应语言返回undefined', () => {
    const rendered = templateService.renderTemplate(enTemplateId, 'ja', 'email', { name: 'Taro' }, 2);
    assert(rendered === undefined);
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
