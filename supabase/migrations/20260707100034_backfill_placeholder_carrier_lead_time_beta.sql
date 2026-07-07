-- ============================================================================
-- ⚠️ PLACEHOLDER DATA — BETA ONLY. DO NOT SHIP TO PRODUCTION AS-IS. ⚠️
-- ----------------------------------------------------------------------------
-- Some carrier_rates rows have lead_time_days IS NULL. In the checkout this
-- produces "tempi corriere variabili" and hides the estimated delivery date.
-- Since we are still in beta, we backfill these NULLs with PLAUSIBLE PLACEHOLDER
-- transit times, varied by destination zone/distance (domestic < intra-EU <
-- intercontinental).
--
-- These values are NOT real carrier SLAs. They MUST be replaced with the actual
-- transit times provided by each carrier BEFORE the production launch.
-- ============================================================================
UPDATE carrier_rates
SET lead_time_days = CASE zone_area
  WHEN 'Italia'      THEN 3
  WHEN 'Francia'     THEN 5
  WHEN 'Germania'    THEN 5
  WHEN 'Paesi Bassi' THEN 5
  WHEN 'Polonia'     THEN 6
  WHEN 'Spagna'      THEN 6
  WHEN 'Turchia'     THEN 8
  WHEN 'Argentina'   THEN 12
  WHEN 'Cina'        THEN 14
  WHEN 'India'       THEN 14
  WHEN 'Stati Uniti' THEN 12
  ELSE 5   -- fallback placeholder for any other zone
END
WHERE lead_time_days IS NULL;
