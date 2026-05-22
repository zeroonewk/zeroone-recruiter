-- Migration: 002_funnel.sql
-- Dodaje kolumne funnel JSONB do projects.
-- 7 poziomow lejka procesowego (snapshot stanu, bez historii w tym etapie):
-- sourcing, screening, weryfikacja, rekomendacje, spotkania, oferta, zatrudnienie

ALTER TABLE projects 
ADD COLUMN funnel JSONB NOT NULL DEFAULT '{
  "sourcing": 0,
  "screening": 0,
  "weryfikacja": 0,
  "rekomendacje": 0,
  "spotkania": 0,
  "oferta": 0,
  "zatrudnienie": 0
}'::jsonb;
