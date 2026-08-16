PRAGMA foreign_keys=ON;

-- Regional restrictions cannot be enforced when release files are posted
-- publicly. Heal existing production settings so regional routing always uses
-- the private download flow for new releases.
INSERT INTO app_settings(key,value,updated_at)
SELECT 'download_gate_enabled','1',datetime('now')
WHERE EXISTS (
  SELECT 1 FROM app_settings
  WHERE key='regional_routing_enabled'
    AND lower(trim(value)) IN ('1','true','yes','on')
)
ON CONFLICT(key) DO UPDATE SET
  value='1',
  updated_at=excluded.updated_at;
