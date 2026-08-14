-- Categoria (macro-area) scelta dall'azienda in registrazione, usata come default
-- del filtro Settore sul catalogo. Nullable: le aziende esistenti non l'hanno mai
-- indicata e non c'e' migrazione retroattiva (dato non disponibile).
alter table public.companies
  add column if not exists registration_macro_area_id uuid references public.macro_areas(id);
comment on column public.companies.registration_macro_area_id is
  'Macro-area/settore principale scelto in registrazione; default del filtro Settore sul catalogo. Nullable (aziende preesistenti senza dato).';
