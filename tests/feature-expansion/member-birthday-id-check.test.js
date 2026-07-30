const test = require('node:test')
const assert = require('node:assert/strict')

const verificationCore = require('../../cloudfunctions/verifyBenefit/verification-core.js')

test('生日 85 折必须由员工明确确认已核对本人身份证及生日', () => {
  assert.deepEqual(
    verificationCore.validateIdentityCheck('birthday', false),
    { ok: false, message: '请先核对客户本人身份证及生日' }
  )
  assert.deepEqual(
    verificationCore.validateIdentityCheck('birthday', true),
    { ok: true, message: '' }
  )
})

test('长河令权益发放不要求身份证确认', () => {
  assert.deepEqual(
    verificationCore.validateIdentityCheck('ling', false),
    { ok: true, message: '' }
  )
})
