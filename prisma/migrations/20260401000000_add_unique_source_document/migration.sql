-- Backup de documentos que serán eliminados por duplicación
CREATE TABLE IF NOT EXISTS _backup_duplicate_documents AS
SELECT * FROM documents
WHERE id NOT IN (
  SELECT DISTINCT ON (source) id
  FROM documents
  ORDER BY source, created_at DESC
);

-- Eliminar documentos duplicados por source, conservando el más reciente (created_at más alto)
DELETE FROM documents
WHERE id NOT IN (
  SELECT DISTINCT ON (source) id
  FROM documents
  ORDER BY source, created_at DESC
);

-- Agregar constraint UNIQUE en source
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_key" UNIQUE ("source");

-- Limpiar tabla de backup temporal
DROP TABLE IF EXISTS _backup_duplicate_documents;
