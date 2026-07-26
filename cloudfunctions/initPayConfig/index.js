// 云函数：initPayConfig —— 一次性写入支付配置到 configs/pay
//
// 用途：业主不想给 7 个支付函数逐个配环境变量，用这个函数写一次数据库即可。
// 正常情况下 pay-config.js 会在任意函数读到环境变量时自动镜像，用不到这里；
// 但如果所有函数都没配环境变量（自举无从触发），就用这个函数破局。
//
// 调用方式：微信开发者工具 → 云开发 → 云函数 → initPayConfig → 云端测试，
// 测试参数填：{ "subMchId": "你的子商户号" }
//
// 安全：只写子商户号（商户标识，非密钥），且不返回任何已有配置内容。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  // 参数优先，其次读本函数自己的环境变量
  const subMchId = String((event && event.subMchId) || process.env.SUB_MCH_ID || '').trim()
  if (!subMchId) {
    return { code: 400, msg: '缺少 subMchId：测试参数填 { "subMchId": "你的子商户号" }' }
  }
  if (!/^\d{6,20}$/.test(subMchId)) {
    return { code: 400, msg: '子商户号应为 6-20 位数字，收到：' + subMchId }
  }

  const data = { subMchId, source: 'initPayConfig', updatedAt: new Date() }

  try {
    await db.collection('configs').doc('pay').set({ data })
  } catch (e) {
    // 集合不存在就先建再写
    try {
      await db.createCollection('configs')
      await db.collection('configs').doc('pay').set({ data })
    } catch (e2) {
      return { code: 500, msg: '写入失败：' + (e2.errMsg || e2.message || '') }
    }
  }

  // 回读确认，避免「返回成功但其实没写进去」
  const check = await db.collection('configs').doc('pay').get().catch(() => null)
  const ok = !!(check && check.data && check.data.subMchId === subMchId)

  return {
    code: ok ? 0 : 500,
    msg: ok ? '已写入 configs/pay，7 个支付函数现在都能读到' : '写入后回读不一致，请检查数据库权限',
    data: { ok, subMchIdTail: subMchId.slice(-4) }
  }
}
