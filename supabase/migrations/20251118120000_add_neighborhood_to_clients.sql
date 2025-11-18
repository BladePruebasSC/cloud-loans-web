-- Add neighborhood/sector column for clients
alter table public.clients
add column if not exists neighborhood text;

-- Pre-fill neighborhood with existing city values (legacy data)
update public.clients
set neighborhood = city
where neighborhood is null;

comment on column public.clients.neighborhood is 'Barrio o sector del cliente';

