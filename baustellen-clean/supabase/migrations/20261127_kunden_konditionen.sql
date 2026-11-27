-- Kunden mit eigenen Konditionen (Stundensatz, Materialaufschlag, Anfahrt, Zuschläge)
create table if not exists public.kunden (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kundennummer text,
  kostenstelle text,
  adresse text,
  aktiv boolean not null default true,
  bemerkung text,
  created_at timestamptz not null default now()
);

create table if not exists public.kunden_konditionen (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  gueltig_ab date not null default date '2000-01-01',
  stundensatz numeric,              -- ein Satz für alle MA (leer = Satz des MA)
  material_aufschlag_pct numeric,   -- % auf Material-Einkauf
  anfahrt_pauschale numeric,        -- € je Einsatztag auf der Baustelle
  zuschlag_sonntag_pct numeric,
  zuschlag_feiertag_pct numeric,
  zuschlag_nacht_pct numeric,
  zuschlag_notdienst_pct numeric,
  bemerkung text,
  created_at timestamptz not null default now(),
  unique (kunde_id, gueltig_ab)
);

-- Ausnahmen je MA und Kunde (z. B. eigener Satz für einen MA bei einem Kunden)
create table if not exists public.kunden_ma_saetze (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  gueltig_ab date not null default date '2000-01-01',
  stundensatz numeric not null,
  bemerkung text,
  created_at timestamptz not null default now(),
  unique (kunde_id, employee_id, gueltig_ab)
);

alter table public.baustellen add column if not exists kunde_id uuid references public.kunden(id) on delete set null;
alter table public.baustellen add column if not exists ansprechpartner text;
-- MA mit festem Satz: Kundensatz ersetzt seinen Satz nicht (nur eine Ausnahme je Kunde)
alter table public.employees add column if not exists satz_fest boolean not null default false;
update public.employees set satz_fest = true where id = '7e171a3b-f095-4ff6-9353-be0d2d80fcbc'; -- Paredis Pascal

alter table public.bs_stundeneintraege add column if not exists zuschlag_art text check (zuschlag_art in ('nacht','notdienst'));
alter table public.bs_stundeneintraege add column if not exists satz numeric;          -- Verrechnungssatz inkl. Zuschläge
alter table public.bs_stundeneintraege add column if not exists satz_basis numeric;
alter table public.bs_stundeneintraege add column if not exists zuschlag_pct numeric;
alter table public.bs_stundeneintraege add column if not exists satz_quelle text;      -- Mitarbeiter | Kunde | Ausnahme

alter table public.kunden enable row level security;
alter table public.kunden_konditionen enable row level security;
alter table public.kunden_ma_saetze enable row level security;
create policy staff_all on public.kunden for all to authenticated using (not is_hw()) with check (not is_hw());
create policy hw_read on public.kunden for select to authenticated using (is_hw());
create policy staff_all on public.kunden_konditionen for all to authenticated using (not is_hw()) with check (not is_hw());
create policy staff_all on public.kunden_ma_saetze for all to authenticated using (not is_hw()) with check (not is_hw());

-- Gesetzliche Feiertage NRW
create or replace function public.feiertag_nrw(d date) returns boolean language plpgsql immutable as $$
declare y int := extract(year from d); a int; b int; c int; k int; p int; q int; m int; n int; dd int; e int; ostern date;
begin
  a := y % 19; b := y % 4; c := y % 7; k := y / 100; p := (13 + 8 * k) / 25; q := k / 4;
  m := (15 - p + k - q) % 30; n := (4 + k - q) % 7; dd := (19 * a + m) % 30; e := (2 * b + 4 * c + 6 * dd + n) % 7;
  ostern := make_date(y, 3, 22) + (dd + e);
  if dd = 29 and e = 6 then ostern := make_date(y, 4, 19); end if;
  if dd = 28 and e = 6 and (11 * m + 11) % 30 < 19 then ostern := make_date(y, 4, 18); end if;
  return d in (make_date(y,1,1), make_date(y,5,1), make_date(y,10,3), make_date(y,11,1), make_date(y,12,25), make_date(y,12,26),
               ostern - 2, ostern + 1, ostern + 39, ostern + 50, ostern + 60);
end $$;

-- Verrechnungssatz je Stundeneintrag bestimmen
create or replace function public.bs_satz_setzen() returns trigger language plpgsql security definer set search_path = public as $$
declare v_kunde uuid; v_ma record; v_k record; v_aus numeric; v_basis numeric; v_quelle text; v_z numeric := 0;
begin
  select kunde_id into v_kunde from baustellen where id = new.baustelle_id;
  select stundensatz, satz_fest into v_ma from employees where id = new.mitarbeiter_id;
  v_basis := v_ma.stundensatz; v_quelle := 'Mitarbeiter';
  if v_kunde is not null then
    select * into v_k from kunden_konditionen where kunde_id = v_kunde and gueltig_ab <= coalesce(new.datum, current_date)
      order by gueltig_ab desc limit 1;
    select stundensatz into v_aus from kunden_ma_saetze where kunde_id = v_kunde and employee_id = new.mitarbeiter_id
      and gueltig_ab <= coalesce(new.datum, current_date) order by gueltig_ab desc limit 1;
    if v_aus is not null then v_basis := v_aus; v_quelle := 'Ausnahme';
    elsif v_k.stundensatz is not null and not coalesce(v_ma.satz_fest, false) then v_basis := v_k.stundensatz; v_quelle := 'Kunde';
    end if;
    if v_k.id is not null and new.datum is not null then
      if feiertag_nrw(new.datum) then v_z := v_z + coalesce(v_k.zuschlag_feiertag_pct, 0);
      elsif extract(isodow from new.datum) = 7 then v_z := v_z + coalesce(v_k.zuschlag_sonntag_pct, 0); end if;
      if new.zuschlag_art = 'nacht' then v_z := v_z + coalesce(v_k.zuschlag_nacht_pct, 0);
      elsif new.zuschlag_art = 'notdienst' then v_z := v_z + coalesce(v_k.zuschlag_notdienst_pct, 0); end if;
    end if;
  end if;
  new.satz_basis := v_basis;
  new.zuschlag_pct := nullif(v_z, 0);
  new.satz := case when v_basis is null then null else round(v_basis * (1 + v_z / 100.0), 2) end;
  new.satz_quelle := v_quelle;
  return new;
end $$;

drop trigger if exists bs_satz_setzen on public.bs_stundeneintraege;
create trigger bs_satz_setzen before insert or update of baustelle_id, mitarbeiter_id, datum, zuschlag_art, satz
  on public.bs_stundeneintraege for each row execute function public.bs_satz_setzen();

-- Bei Änderungen an Konditionen, Kunde der Baustelle oder MA-Satz neu berechnen
create or replace function public.bs_saetze_neu() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'baustellen' then
    update bs_stundeneintraege set satz = null where baustelle_id = new.id;
  elsif tg_table_name = 'employees' then
    update bs_stundeneintraege set satz = null where mitarbeiter_id = new.id;
  else
    update bs_stundeneintraege s set satz = null from baustellen b
      where b.id = s.baustelle_id and b.kunde_id = (case when tg_op = 'DELETE' then old.kunde_id else new.kunde_id end);
    if tg_op = 'UPDATE' and old.kunde_id is distinct from new.kunde_id then
      update bs_stundeneintraege s set satz = null from baustellen b where b.id = s.baustelle_id and b.kunde_id = old.kunde_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists bs_saetze_neu on public.baustellen;
create trigger bs_saetze_neu after update of kunde_id on public.baustellen for each row
  when (old.kunde_id is distinct from new.kunde_id) execute function public.bs_saetze_neu();
drop trigger if exists bs_saetze_neu on public.employees;
create trigger bs_saetze_neu after update of stundensatz, satz_fest on public.employees for each row
  when (old.stundensatz is distinct from new.stundensatz or old.satz_fest is distinct from new.satz_fest) execute function public.bs_saetze_neu();
drop trigger if exists bs_saetze_neu on public.kunden_konditionen;
create trigger bs_saetze_neu after insert or update or delete on public.kunden_konditionen for each row execute function public.bs_saetze_neu();
drop trigger if exists bs_saetze_neu on public.kunden_ma_saetze;
create trigger bs_saetze_neu after insert or update or delete on public.kunden_ma_saetze for each row execute function public.bs_saetze_neu();

-- Bestehende Einträge einmal berechnen
update public.bs_stundeneintraege set satz = null;
