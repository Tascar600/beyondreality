const { authRequired, rolesAllowed } = require('../auth');
const {
  buildFullLedgerWorkbook,
  buildReceiptsWorkbook,
  buildReconciliationWorkbook,
  buildCategoriesWorkbook,
  exportFilename,
} = require('./excel-export');

function sendXlsx(res, buffer, filename) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Failed to generate Excel file');
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

function registerReportRoutes(app) {
  const guard = [authRequired, rolesAllowed('finance', 'admin')];

  const ledgerHandler = (req, res) => {
    try {
      const location = req.query.location || '';
      sendXlsx(res, buildFullLedgerWorkbook(location), exportFilename('Full-Ledger', location));
    } catch (err) {
      console.error('[export ledger]', err);
      res.status(500).json({ error: err.message || 'Failed to build ledger export' });
    }
  };

  const receiptsHandler = (req, res) => {
    try {
      const location = req.query.location || '';
      sendXlsx(res, buildReceiptsWorkbook(location), exportFilename('Receipts-Register', location));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const reconciliationHandler = (req, res) => {
    try {
      const location = req.query.location || '';
      sendXlsx(res, buildReconciliationWorkbook(location), exportFilename('Reconciliation', location));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const categoriesHandler = (req, res) => {
    try {
      const location = req.query.location || '';
      sendXlsx(res, buildCategoriesWorkbook(location), exportFilename('Category-Breakdown', location));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  for (const p of ['/api/reports/ledger/download', '/api/reports/ledger', '/api/reports/ledger.xlsx', '/api/reports/ledger.csv']) {
    app.get(p, ...guard, ledgerHandler);
  }
  for (const p of ['/api/reports/receipts/download', '/api/reports/receipts.xlsx']) {
    app.get(p, ...guard, receiptsHandler);
  }
  for (const p of ['/api/reports/reconciliation/download', '/api/reports/reconciliation.xlsx']) {
    app.get(p, ...guard, reconciliationHandler);
  }
  for (const p of ['/api/reports/categories/download', '/api/reports/categories.xlsx']) {
    app.get(p, ...guard, categoriesHandler);
  }

  console.log('[exports] ledger → /api/reports/ledger/download (COMBINED format + receipt + cash reco)');
}

module.exports = { registerReportRoutes };
