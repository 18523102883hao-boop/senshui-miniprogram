// 园区地图管理（管理员 · T24）——小程序内选图上传到云存储并配置到首页
const request = require('../../../utils/request.js')

Page({
  data: {
    role: null,
    campUrl: '',
    creekUrl: '',
    uploading: '' // 'camp' | 'creek'
  },

  onLoad() {
    this.check()
  },

  check() {
    request.call('checkStaff', {})
      .then((d) => {
        if (!d || d.role !== 'admin') {
          wx.showModal({ title: '无权限', content: '仅管理员可管理园区地图', showCancel: false, success: () => wx.navigateBack() })
          return
        }
        this.setData({ role: 'admin' })
        this.loadMaps()
      })
      .catch(() => wx.navigateBack())
  },

  loadMaps() {
    request.call('getHomeData', {})
      .then((d) => {
        const maps = (d && d.maps) || {}
        const fileList = [maps.camp, maps.creek].filter(Boolean)
        if (!fileList.length) return
        return wx.cloud.getTempFileURL({ fileList }).then((res) => {
          const byId = {}
          ;(res.fileList || []).forEach((f) => { byId[f.fileID] = f.tempFileURL })
          this.setData({ campUrl: byId[maps.camp] || '', creekUrl: byId[maps.creek] || '' })
        })
      })
      .catch(() => {})
  },

  upload(e) {
    const key = e.currentTarget.dataset.key
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        const ext = (tempPath.match(/\.\w+$/) || ['.jpg'])[0]
        const cloudPath = 'maps/' + key + '-' + Date.now() + ext
        this.setData({ uploading: key })
        wx.showLoading({ title: '上传中', mask: true })
        wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
          .then((up) => request.call('setMap', { key, fileID: up.fileID }).then(() => up.fileID))
          .then((fileID) => wx.cloud.getTempFileURL({ fileList: [fileID] }))
          .then((r) => {
            const url = (r.fileList && r.fileList[0] && r.fileList[0].tempFileURL) || ''
            this.setData(key === 'camp' ? { campUrl: url } : { creekUrl: url })
            wx.hideLoading()
            this.setData({ uploading: '' })
            wx.showToast({ title: '上传成功', icon: 'success' })
          })
          .catch((err) => {
            wx.hideLoading()
            this.setData({ uploading: '' })
            wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
          })
      }
    })
  },

  preview(e) {
    const key = e.currentTarget.dataset.key
    const url = key === 'camp' ? this.data.campUrl : this.data.creekUrl
    if (url) wx.previewImage({ urls: [url] })
  }
})
