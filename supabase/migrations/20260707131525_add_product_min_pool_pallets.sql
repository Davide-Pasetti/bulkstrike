-- Task 3: minimo (in pedane) per APRIRE un'asta a ribasso, configurabile per-prodotto.
-- Default 1 = comportamento storico (minimo 1 pallet). L'enforcement reale è in open_pool().
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_pool_pallets integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_min_pool_pallets_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_min_pool_pallets_check CHECK (min_pool_pallets >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.products.min_pool_pallets IS
  'Minimo di pedane (pallet) per aprire una nuova asta a ribasso su questo prodotto. Configurabile da admin. open_pool richiede p_quantity >= min_pool_pallets * pallet_kg.';
