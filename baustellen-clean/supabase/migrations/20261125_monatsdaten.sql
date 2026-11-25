-- Kachel „Monatsdaten“: händisch hochgeladene Monatsdaten + automatisch ausgelesene Sammelrechnungen
-- Nur neue Tabellen; employees bekommt die optionale Spalte team.

alter table public.employees add column if not exists team text;

create table if not exists public.md_ma_monat (
  id uuid primary key default gen_random_uuid(),
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  employee_id uuid references public.employees(id) on delete set null,
  mitarbeiter_name text not null,
  ueberstunden numeric,
  sonntag_stunden numeric,
  sonntag_zulage_eur numeric,
  bezahlte_stunden numeric,
  bemerkung text,
  quelle text,
  updated_by text,
  created_at timestamptz not null default now(),
  unique (monat, mitarbeiter_name)
);

create table if not exists public.md_saetze (
  id uuid primary key default gen_random_uuid(),
  gueltig_ab date not null,
  art text not null check (art in ('verrechnung','kosten')),
  team text not null default 'alle',
  satz numeric not null,
  bemerkung text,
  created_at timestamptz not null default now()
);

create table if not exists public.md_teamkosten (
  id uuid primary key default gen_random_uuid(),
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  team text not null default 'alle',
  kostenart text not null,
  betrag numeric not null,
  bemerkung text,
  created_at timestamptz not null default now()
);

create table if not exists public.md_leistungsmengen (
  id uuid primary key default gen_random_uuid(),
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  kst text,
  leistung text not null,
  menge numeric not null,
  einheit text,
  a_nummer text,
  bemerkung text,
  created_at timestamptz not null default now()
);

create table if not exists public.md_sr_belege (
  beleg text primary key,
  monat text not null,
  typ text not null,
  kunde text,
  kdnr text,
  belegdatum date,
  faellig date,
  bezug text,
  kopf text,
  a_nummer text,
  netto numeric,
  steuer numeric,
  brutto numeric,
  quelle_datei text,
  created_at timestamptz not null default now()
);

create table if not exists public.md_sr_positionen (
  id uuid primary key default gen_random_uuid(),
  beleg text not null references public.md_sr_belege(beleg) on delete cascade,
  monat text not null,
  kst text,
  abteilung text,
  leistungsdatum date,
  menge numeric,
  einheit text,
  leistung text,
  text text,
  ep numeric,
  gp numeric,
  a_nummer text,
  created_at timestamptz not null default now()
);
create index if not exists md_sr_positionen_monat_idx on public.md_sr_positionen (monat, kst);
create index if not exists md_sr_positionen_anr_idx on public.md_sr_positionen (a_nummer);

create table if not exists public.md_ag_status (
  id uuid primary key default gen_random_uuid(),
  stand date not null,
  a_nummer text not null,
  beschreibung text,
  status_ag text,
  auftragssumme numeric,
  verbucht numeric,
  kommentar text,
  quelle_datei text,
  created_at timestamptz not null default now(),
  unique (stand, a_nummer)
);

create table if not exists public.md_uploads (
  id uuid primary key default gen_random_uuid(),
  monat text,
  art text not null,
  dateiname text,
  zeilen integer,
  user_email text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['md_ma_monat','md_saetze','md_teamkosten','md_leistungsmengen','md_sr_belege','md_sr_positionen','md_ag_status','md_uploads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (not is_hw()) with check (not is_hw())', t);
  end loop;
end $$;
