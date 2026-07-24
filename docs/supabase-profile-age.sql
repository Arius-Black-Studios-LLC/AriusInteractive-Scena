-- Account age + adult verification columns (run after supabase-setup.sql / supabase-profile-fields.sql)

alter table public.profiles
  add column if not exists birth_year int check (birth_year >= 1900 and birth_year <= extract(year from now())::int);

alter table public.profiles
  add column if not exists adult_verified_at timestamptz;

comment on column public.profiles.birth_year is 'Birth year for 18+ verification on mature content and jams.';
comment on column public.profiles.adult_verified_at is 'When the user confirmed they are 18+ for age-restricted content.';
