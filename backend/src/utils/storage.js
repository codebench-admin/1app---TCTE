import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Dev-friendly local-disk storage. In production, swap saveFile/deleteFile
// for calls to S3/R2/Backblaze — nothing outside this file needs to change,
// since routes only ever call these two functions and store what they
// return in documents.file_path.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.resolve('uploads');

export function saveFile(buffer, originalName) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const ext = path.extname(originalName || '');
  const key = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_ROOT, key), buffer);
  return key; // stored as documents.file_path
}

export function readFile(key) {
  return fs.readFileSync(path.join(UPLOAD_ROOT, key));
}

export function deleteFile(key) {
  const p = path.join(UPLOAD_ROOT, key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
