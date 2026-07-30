const ExcelJS = require('exceljs')

const HEADER_FILL = '153F2E'
const HEADER_TEXT = 'FFFFFF'
const BORDER_COLOR = 'D9E1DC'

function createWorkbook(plan) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '森水长河小程序'
  workbook.company = '森水长河'
  workbook.created = new Date()
  workbook.modified = new Date()

  ;(plan.sheets || []).forEach((sheetPlan) => {
    const sheet = workbook.addWorksheet(sheetPlan.name, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    sheet.columns = (sheetPlan.columns || []).map((column) => ({
      header: column.label,
      key: column.key,
      width: column.width || 16,
      style: column.numFmt ? { numFmt: column.numFmt } : {}
    }))
    sheet.addRows(sheetPlan.rows || [])
    const header = sheet.getRow(1)
    header.height = 24
    header.font = { bold: true, color: { argb: HEADER_TEXT } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    header.alignment = { vertical: 'middle', horizontal: 'center' }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(1, sheet.columns.length) }
    }
    sheet.eachRow((row, rowNumber) => {
      row.alignment = rowNumber === 1
        ? header.alignment
        : { vertical: 'middle', wrapText: true }
      row.eachCell((cell) => {
        cell.border = {
          bottom: { style: 'hair', color: { argb: BORDER_COLOR } }
        }
      })
    })
  })
  return workbook
}

async function writeBuffer(plan) {
  const value = await createWorkbook(plan).xlsx.writeBuffer()
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

async function readBuffer(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

module.exports = {
  createWorkbook,
  writeBuffer,
  readBuffer
}
