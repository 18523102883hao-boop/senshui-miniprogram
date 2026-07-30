function validateIdentityCheck(benefitType, identityChecked) {
  if (benefitType === 'birthday' && identityChecked !== true) {
    return { ok: false, message: '请先核对客户本人身份证及生日' }
  }
  return { ok: true, message: '' }
}

module.exports = {
  validateIdentityCheck
}
