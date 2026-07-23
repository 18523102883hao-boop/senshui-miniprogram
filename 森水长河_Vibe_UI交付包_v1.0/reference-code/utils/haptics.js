const HAPTIC = { light: 'light', medium: 'medium', heavy: 'heavy' };
function haptic(type = HAPTIC.light) {
  try { wx.vibrateShort({ type }); } catch (error) { try { wx.vibrateShort(); } catch (_) {} }
}
module.exports = { HAPTIC, haptic };
