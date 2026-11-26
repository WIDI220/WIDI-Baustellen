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

-- 26.11.2026: Stundenabgleich (SP Data + Plus/Minus-Liste Fr. Denker)
alter table public.md_ma_monat
  add column if not exists plusstunden numeric,
  add column if not exists minusstunden numeric,
  add column if not exists auszahlung_std numeric,
  add column if not exists zuschlaege jsonb;

create table if not exists public.md_spdata_monat (
  id uuid primary key default gen_random_uuid(),
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  employee_id uuid references public.employees(id) on delete set null,
  mitarbeiter_name text not null,
  name_sp text,
  personalnummer text,
  stand date,
  ges numeric, soll numeric, pause numeric, ao numeric, ist numeric,
  krank numeric, urlaub numeric, flexi numeric, ue_std numeric,
  tage jsonb,
  quelle_datei text,
  updated_by text,
  created_at timestamptz not null default now(),
  unique (monat, mitarbeiter_name)
);
alter table public.md_spdata_monat enable row level security;
drop policy if exists staff_all on public.md_spdata_monat;
create policy staff_all on public.md_spdata_monat for all to authenticated using (not is_hw()) with check (not is_hw());

-- 26.11.2026: MA ohne Buchungen im WIDI-System (z. B. Hygienespülungen, Containerrunde)
alter table public.employees add column if not exists ohne_systembuchung boolean not null default false;

-- 26.11.2026: Arbeitszeitmodell je MA (Zeitminuten): Mo–Do 8 h, Fr 7 h; Dominik Schmidt 6-Stunden-Vertrag
alter table public.employees
  add column if not exists soll_mo_do numeric not null default 8,
  add column if not exists soll_fr numeric not null default 7;
update public.employees set soll_mo_do = 6, soll_fr = 6 where name = 'Dominik Schmidt';
