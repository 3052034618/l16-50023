import { initDatabase } from '../database/store';
import { templateService } from '../services/templateService';
import { userService } from '../services/userService';
import { pushService } from '../services/pushService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { alertService } from '../services/alertService';
import { channelManager } from '../channels/channelManager';
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

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  多渠道消息推送中心 - 功能测试');
  console.log('='.repeat(60) + '\n');

  initDatabase(':memory:');

  console.log('\n📦 1. 渠道适配器测试');
  await test('邮件渠道 - 正常发送', async () => {
    const result = await channelManager.send(
      'email',
      'test@example.com',
      'Test Subject',
      'Test content'
    );
    assert(result.success === true, '邮件发送应该成功');
    assert(result.messageId, '应该返回 messageId');
  });

  await test('邮件渠道 - 无效地址', async () => {
    const result = await channelManager.send(
      'email',
      'invalid-email',
      'Test',
      'Content'
    );
    assert(result.success === false, '无效邮箱应该失败');
  });

  await test('短信渠道 - 正常发送', async () => {
    const result = await channelManager.send(
      'sms',
      '13800138000',
      undefined,
      'Test SMS content'
    );
    assert(result.success === true, '短信发送应该成功');
  });

  await test('站内信渠道 - 正常发送', async () => {
    const result = await channelManager.send(
      'inapp',
      'user-123',
      'Notice',
      'You have a new message'
    );
    assert(result.success === true, '站内信发送应该成功');
  });

  await test('Webhook渠道 - 正常发送', async () => {
    const result = await channelManager.send(
      'webhook',
      'https://example.com/webhook',
      'Alert',
      'Something happened'
    );
    assert(result.success === true, 'Webhook发送应该成功');
  });

  console.log('\n📄 2. 消息模板测试');
  let templateId: string;
  await test('创建模板', () => {
    const tpl = templateService.createTemplate({
      name: '测试模板',
      description: '这是一个测试模板',
      category: 'general',
      priority: 'normal'
    });
    templateId = tpl.id;
    assert(tpl.id, '模板应该有ID');
    assert(tpl.name === '测试模板', '模板名称应该正确');
  });

  await test('获取模板', () => {
    const tpl = templateService.getTemplate(templateId);
    assert(tpl !== undefined, '应该能获取到模板');
    assert(tpl?.name === '测试模板', '模板名称应该正确');
  });

  await test('添加中文邮件模板内容', () => {
    const content = templateService.addTemplateContent({
      template_id: templateId,
      language: 'zh-CN',
      channel: 'email',
      subject: '您好，${username}！',
      content: '尊敬的${username}，您的验证码是${code}。'
    });
    assert(content.language === 'zh-CN', '语言应该正确');
    assert(content.channel === 'email', '渠道应该正确');
  });

  await test('添加英文邮件模板内容', () => {
    templateService.addTemplateContent({
      template_id: templateId,
      language: 'en',
      channel: 'email',
      subject: 'Hello, ${username}!',
      content: 'Dear ${username}, your verification code is ${code}.'
    });
  });

  await test('添加短信模板内容', () => {
    templateService.addTemplateContent({
      template_id: templateId,
      language: 'zh-CN',
      channel: 'sms',
      content: '【通知】您的验证码是${code}，5分钟内有效。'
    });
  });

  await test('添加站内信模板内容', () => {
    templateService.addTemplateContent({
      template_id: templateId,
      language: 'zh-CN',
      channel: 'inapp',
      subject: '系统通知',
      content: '${username}，您有一条新的系统通知。'
    });
  });

  await test('模板变量替换 - 中文', () => {
    const result = templateService.renderTemplate(
      templateId,
      'zh-CN',
      'email',
      { username: '张三', code: '123456' }
    );
    assert(result !== undefined, '应该能渲染模板');
    assert(result?.subject === '您好，张三！', '标题变量应该被替换');
    assert(result?.content.includes('123456'), '内容变量应该被替换');
  });

  await test('模板变量替换 - 英文', () => {
    const result = templateService.renderTemplate(
      templateId,
      'en',
      'email',
      { username: 'John', code: 'ABCDEF' }
    );
    assert(result?.subject === 'Hello, John!', '英文标题应该正确');
    assert(result?.content.includes('ABCDEF'), '英文内容应该正确');
  });

  console.log('\n👤 3. 用户与订阅偏好测试');
  let userId: string;
  await test('创建用户', () => {
    const user = userService.createUser({
      name: '测试用户',
      email: 'test@example.com',
      phone: '13800138000',
      language: 'zh-CN'
    });
    userId = user.id;
    assert(user.email === 'test@example.com', '邮箱应该正确');
    assert(user.language === 'zh-CN', '语言应该正确');
  });

  await test('获取用户偏好', () => {
    const prefs = userService.getUserPreferences(userId);
    assert(prefs.length > 0, '应该有默认偏好设置');
  });

  await test('禁用邮件营销通知', () => {
    const pref = userService.setPreference(
      userId,
      'marketing',
      'email',
      false
    );
    assert(pref.enabled === false, '应该被禁用');
  });

  await test('检查营销邮件是否启用', () => {
    const enabled = userService.isChannelEnabled(userId, 'marketing', 'email');
    assert(enabled === false, '营销邮件应该被禁用');
  });

  await test('检查安全通知是否默认启用', () => {
    const enabled = userService.isChannelEnabled(userId, 'security', 'email');
    assert(enabled === true, '安全通知应该默认启用');
  });

  await test('获取启用的渠道', () => {
    const channels = userService.getEnabledChannels(userId, 'marketing');
    assert(!channels.includes('email'), '营销邮件不应该在启用列表中');
  });

  console.log('\n📤 4. 推送服务测试');
  await test('发送普通消息 - 多渠道', async () => {
    const result = await pushService.send({
      template_id: templateId,
      user_id: userId,
      params: { username: '测试用户', code: '123456' }
    });
    assert(result.request_id, '应该有请求ID');
    assert(result.messages.length > 0, '应该产生至少一条消息');
  });

  await test('队列中应该有待发送消息', () => {
    const stats = queueService.getStats();
    assert(stats.pending > 0, '队列中应该有待发送消息');
  });

  await test('处理队列消息', async () => {
    const count = await pushService.processQueue(undefined, 20);
    assert(count > 0, '应该处理了消息');
  });

  await test('发送历史应该有记录', () => {
    const stats = historyService.getDeliveryStats();
    assert(stats.total > 0, '发送历史应该有记录');
    assert(stats.delivered > 0, '应该有送达记录');
  });

  let securityTemplateId: string;
  await test('创建安全通知模板', () => {
    const tpl = templateService.createTemplate({
      name: '安全警告',
      category: 'security',
      priority: 'high'
    });
    securityTemplateId = tpl.id;
    templateService.addTemplateContent({
      template_id: securityTemplateId,
      language: 'zh-CN',
      channel: 'email',
      subject: '安全警告',
      content: '${username}，检测到异常登录，请及时处理。'
    });
    templateService.addTemplateContent({
      template_id: securityTemplateId,
      language: 'zh-CN',
      channel: 'sms',
      content: '【安全警告】检测到异常登录，请及时处理。'
    });
  });

  await test('高优先级消息跳过订阅偏好', async () => {
    userService.setPreference(userId, 'security', 'sms', false);
    const result = await pushService.send({
      template_id: securityTemplateId,
      user_id: userId,
      params: { username: '测试用户' },
      priority: 'high'
    });
    const hasSms = result.messages.some(m => m.channel === 'sms');
    assert(hasSms, '高优先级消息应该跳过订阅偏好，发送短信');
  });

  console.log('\n🔄 5. 失败重试测试');
  let retryTemplateId: string;
  await test('创建测试重试的模板', () => {
    const tpl = templateService.createTemplate({
      name: '重试测试模板',
      category: 'test',
      priority: 'normal'
    });
    retryTemplateId = tpl.id;
    templateService.addTemplateContent({
      template_id: retryTemplateId,
      language: 'zh-CN',
      channel: 'email',
      subject: '重试测试',
      content: '这是一条用于测试重试的消息。'
    });
  });

  await test('发送会失败的消息', async () => {
    const result = await pushService.send({
      template_id: retryTemplateId,
      user_id: userId,
      params: { simulate_failure: true }
    });
    assert(result.messages.length > 0, '应该产生消息');
  });

  await test('处理后应该进入重试队列', async () => {
    await pushService.processQueue(undefined, 10);
    const stats = queueService.getStats();
    assert(stats.pending > 0 || stats.failed > 0, '应该有待重试或失败的消息');
  });

  await test('重试次数应该增加', () => {
    const messages = queueService.listMessages({ pageSize: 10 });
    const retryMsg = messages.items.find(m => m.template_id === retryTemplateId);
    if (retryMsg && retryMsg.status === 'pending') {
      assert(retryMsg.retry_count > 0, '重试次数应该大于0');
    }
  });

  console.log('\n📊 6. 统计报表测试');
  await test('获取送达率统计', () => {
    const stats = historyService.getDeliveryStats();
    assert(typeof stats.delivery_rate === 'number', '送达率应该是数字');
    assert(stats.delivery_rate >= 0 && stats.delivery_rate <= 1, '送达率应该在0-1之间');
  });

  await test('按渠道统计', () => {
    const byChannel = historyService.getStatsByChannel();
    assert(byChannel.length === 4, '应该有4个渠道的统计');
    const emailStat = byChannel.find(c => c.channel === 'email');
    assert(emailStat, '应该有邮件渠道的统计');
  });

  await test('按模板统计', () => {
    const byTemplate = historyService.getStatsByTemplate({ limit: 10 });
    assert(byTemplate.length > 0, '应该有模板统计数据');
  });

  console.log('\n🚨 7. 告警监控测试');
  await test('创建大量消息制造积压', () => {
    for (let i = 0; i < 150; i++) {
      queueService.enqueue({
        template_id: templateId,
        user_id: userId,
        channel: 'email',
        priority: 'normal',
        params: { test: i }
      });
    }
    const stats = queueService.getStats();
    assert(stats.pending >= 100, '队列中应该有足够的积压');
  });

  await test('检查队列积压告警', () => {
    const alerts = alertService.checkQueueBacklog();
    const hasWarning = alerts.some(a => a.type === 'queue_backlog_channel' || a.type === 'queue_backlog_global');
    assert(hasWarning, '应该触发队列积压告警');
  });

  await test('获取活跃告警', () => {
    const active = alertService.getActiveAlerts();
    assert(active.length > 0, '应该有活跃告警');
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
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试运行出错:', error);
      process.exit(1);
    });
}

export { runTests };
