-- Discovery search alias performance indexes.
-- Forward-only migration: do not modify previously applied migrations.

CREATE INDEX IF NOT EXISTS idx_discovery_search_alias_fts
  ON discovery_search_aliases
  USING GIN (to_tsvector('simple', normalized_alias))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_discovery_search_alias_prefix
  ON discovery_search_aliases(entity_type, normalized_alias)
  WHERE is_active = TRUE;
