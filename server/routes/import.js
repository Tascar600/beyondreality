const express = require('express');
const multer = require('multer');
const { authRequired, rolesAllowed } = require('../auth');
const { importWorkbookBuffer } = require('../lib/excel-import');
const { buildTemplateWorkbook } = require('../lib/excel-export');
const { normalizeLocation, LOCATIONS } = require('../lib/excel-config');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls or .csv files are allowed'), ok);
  },
});

router.get('/import/template', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const buf = buildTemplateWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="COMBINED-PAYMENTS-TEMPLATE.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import/excel', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  upload.single('file')(req, res, (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Choose your Excel file and try again.' });
    }
    try {
      const location = normalizeLocation(req.body?.location) || 'Harare';
      const replaceAll = req.body?.mode === 'replace-all';
      const wipe = replaceAll || req.body?.mode === 'replace';
      const result = importWorkbookBuffer(req.file.buffer, { wipe, replaceAll, merge: !wipe, location });
      console.log(`[import] ${req.file.originalname}: ${result.totalClients} clients, ${result.totalPayments} payments (${result.mode})`);
      res.json({ ok: true, file: req.file.originalname, ...result });
    } catch (err) {
      console.error('[import error]', err.message);
      res.status(400).json({ error: err.message || 'Import failed' });
    }
  });
});

module.exports = router;
