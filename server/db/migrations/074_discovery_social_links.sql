-- Migration 074: Add social_links JSONB column to discovery_businesses for multi-link web and social profiles.
ALTER TABLE discovery_businesses
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '[]'::jsonb;
