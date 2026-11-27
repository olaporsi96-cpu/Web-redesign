const MAX_COURSE_MATERIAL_BYTES = 50 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCourseMaterialPath(courseId, lessonId, fileId, fileName) {
  if (!UUID_PATTERN.test(courseId || '')
    || (lessonId !== null && lessonId !== undefined && !UUID_PATTERN.test(lessonId))
    || !UUID_PATTERN.test(fileId || '')
    || typeof fileName !== 'string' || !fileName.trim()) {
    throw new TypeError('Course material identifiers and filename are required.');
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150) || 'material';
  return `${courseId}/${lessonId || 'course'}/${fileId}-${safeName}`;
}

function isAllowedCourseMaterialType(type) {
  return type === 'application/pdf' || type === 'video/mp4';
}

function matchesCourseMaterialSignature(type, bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return false;
  const buffer = Buffer.from(bytes);
  if (type === 'application/pdf') {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (type === 'video/mp4') {
    return buffer.length >= 8
      && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

module.exports = {
  MAX_COURSE_MATERIAL_BYTES,
  buildCourseMaterialPath,
  isAllowedCourseMaterialType,
  matchesCourseMaterialSignature,
};
