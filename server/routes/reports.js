const express = require('express');
const { authRequired, rolesAllowed } = require('../auth');
const {
  buildFullLedgerWorkbook,
  buildReceiptsWorkbook,
  buildReconciliationWorkbook,
  buildCategoriesWorkbook,
  exportFilename,
} = require('../lib/excel-export');

const router = express.Router();

router.use((_req, res, next) => {
  res.setTimeout(300000);
  next();
});

function sendXlsx(res, buffer, filename) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Failed to generate Excel file');
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

function ledgerExport(req, res) {
  try {
    const location = req.query.location || '';
    const buffer = buildFullLedgerWorkbook(location);
    sendXlsx(res, buffer, exportFilename('Full-Ledger', location));
  } catch (err) {
    console.error('[export ledger]', err);
    res.status(500).json({ error: err.message || 'Failed to build ledger export' });
  }
}

router.get('/ledger.xlsx', authRequired, rolesAllowed('finance', 'admin'), ledgerExport);
router.get('/ledger.csv', authRequired, rolesAllowed('finance', 'admin'), ledgerExport);

router.get('/receipts.xlsx', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const location = req.query.location || '';
    sendXlsx(res, buildReceiptsWorkbook(location), exportFilename('Receipts-Register', location));
  } catch (err) {
    console.error('[export receipts]', err);
    res.status(500).json({ error: err.message || 'Failed to build receipts export' });
  }
});

router.get('/reconciliation.xlsx', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const location = req.query.location || '';
    sendXlsx(res, buildReconciliationWorkbook(location), exportFilename('Reconciliation', location));
  } catch (err) {
    console.error('[export reconciliation]', err);
    res.status(500).json({ error: err.message || 'Failed to build reconciliation export' });
  }
});

router.get('/categories.xlsx', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const location = req.query.location || '';
    sendXlsx(res, buildCategoriesWorkbook(location), exportFilename('Category-Breakdown', location));
  } catch (err) {
    console.error('[export categories]', err);
    res.status(500).json({ error: err.message || 'Failed to build category export' });
  }
});

module.exports = router;
module.exports.ledgerExport = ledgerExport;
module.exports.sendXlsx = sendXlsx;
