import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { saveFile, readFile, deleteFile } from '../utils/storage.js';
import { logAudit } from '../utils/audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

const ALLOWED_ENTITY_TYPES = ['expense', 'sponsor', 'artist', 'task'];
const MAX_SIZE = 15 * 1024 * 1024; // 15MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SIZE } });

function assertEntityType(entityType) {
  return ALLOWED_ENTITY_TYPES.includes(entityType);
}

// List documents attached to one entity, e.g.
// GET /api/events/:eventId/documents?entityType=sponsor&entityId=12
router.get('/', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    if (!assertEntityType(entityType) || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }
    const { rows } = await pool.query(
      `SELECT d.document_id, d.file_name, d.mime_type, d.size_bytes, d.label, d.created_at, u.name AS uploaded_by
       FROM documents d LEFT JOIN users u ON u.user_id = d.uploaded_by
       WHERE d.event_id=$1 AND d.entity_type=$2 AND d.entity_id=$3
       ORDER BY d.created_at DESC`,
      [req.params.eventId, entityType, entityId]
    );
    res.json(rows.map(r => ({
      id: r.document_id, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes,
      label: r.label, uploadedBy: r.uploaded_by, createdAt: r.created_at,
    })));
  } catch (e) { next(e); }
});

// Upload a file: multipart/form-data with fields entityType, entityId, label, file
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { entityType, entityId, label } = req.body;
    if (!assertEntityType(entityType) || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const key = saveFile(req.file.buffer, req.file.originalname);
    const { rows } = await pool.query(
      `INSERT INTO documents (event_id, entity_type, entity_id, uploaded_by, file_name, file_path, mime_type, size_bytes, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING document_id`,
      [req.params.eventId, entityType, entityId, req.userId, req.file.originalname, key,
       req.file.mimetype, req.file.size, label || null]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType, entityId,
      action: 'create', changes: { document: req.file.originalname },
    });
    res.status(201).json({ id: rows[0].document_id });
  } catch (e) { next(e); }
});

// Download the underlying file
router.get('/:documentId/download', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_name, file_path, mime_type FROM documents WHERE document_id=$1 AND event_id=$2',
      [req.params.documentId, req.params.eventId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const buffer = readFile(rows[0].file_path);
    res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].file_name}"`);
    res.send(buffer);
  } catch (e) { next(e); }
});

router.delete('/:documentId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_path, entity_type, entity_id FROM documents WHERE document_id=$1 AND event_id=$2',
      [req.params.documentId, req.params.eventId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (req.membership.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only a Super Admin can delete documents' });
    }
    deleteFile(rows[0].file_path);
    await pool.query('DELETE FROM documents WHERE document_id=$1', [req.params.documentId]);
    await logAudit({
      eventId: req.params.eventId, userId: req.userId,
      entityType: rows[0].entity_type, entityId: rows[0].entity_id, action: 'delete',
      changes: { document_id: req.params.documentId },
    });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
