async function appendAuditBestEffort(options) {
  const opts = options || {}
  if (!opts.doc || !opts.command || !opts.historyEntry) {
    return { auditSaved: false }
  }

  try {
    await opts.doc.update({
      data: {
        history: opts.command.push(opts.historyEntry)
      }
    })
    return { auditSaved: true }
  } catch (error) {
    if (typeof opts.onAuditError === 'function') opts.onAuditError(error)
    return { auditSaved: false }
  }
}

async function persistInvoiceFile(options) {
  const opts = options || {}
  if (!opts.doc || typeof opts.doc.update !== 'function') {
    throw new TypeError('invoice request document is required')
  }

  await opts.doc.update({
    data: {
      invoiceFile: opts.invoiceFile,
      updatedAt: opts.updatedAt
    }
  })

  return appendAuditBestEffort(opts)
}

module.exports = {
  appendAuditBestEffort,
  persistInvoiceFile
}
