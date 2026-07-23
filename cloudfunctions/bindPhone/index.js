// 云函数：bindPhone —— 手机号授权（新版 getPhoneNumber 返回 code，换取手机号）（T04）
// 前端：<button open-type="getPhoneNumber" bindgetphonenumber> 拿到 e.detail.code 传入
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { code } = event
  if (!code) return { code: 400, msg: '缺少授权 code' }

  let phone = ''
  try {
    // 云调用免鉴权：直接调用 openapi 换取手机号
    const r = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    phone = (r && r.phoneInfo && r.phoneInfo.phoneNumber) || ''
  } catch (e) {
    return { code: 500, msg: '手机号获取失败：' + (e.errMsg || e.message || '') }
  }
  if (!phone) return { code: 500, msg: '手机号为空' }

  await db.collection('users').where({ _openid: OPENID }).update({
    data: { phone, updatedAt: new Date() }
  })

  const phoneMask = phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  return { code: 0, msg: 'ok', data: { phoneMask } }
}
