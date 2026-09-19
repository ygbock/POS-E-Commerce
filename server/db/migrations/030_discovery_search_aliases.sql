-- Discovery search aliases / alternate spellings.
-- Forward-only migration: do not modify previously applied migrations.

CREATE TABLE IF NOT EXISTS discovery_search_aliases (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(16) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  alias VARCHAR(180) NOT NULL,
  normalized_alias VARCHAR(180) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_search_alias_type CHECK (entity_type IN ('BUSINESS','PRODUCT','SERVICE')),
  CONSTRAINT ck_discovery_search_alias_text CHECK (length(trim(alias)) > 0 AND length(trim(alias)) <= 180)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_search_alias_entity
  ON discovery_search_aliases(entity_type, entity_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_discovery_search_alias_lookup
  ON discovery_search_aliases(entity_type, normalized_alias)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_discovery_search_alias_entity
  ON discovery_search_aliases(entity_type, entity_id)
  WHERE is_active = TRUE;
