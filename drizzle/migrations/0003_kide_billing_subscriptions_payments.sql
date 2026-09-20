create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  plan text not null default 'starter',
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan text not null,
  amount integer not null,
  currency text not null default 'usd',
  status text not null default 'pending',
  processor text not null default 'hyperswitch',
  processor_payment_id text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
grant select, insert on public.payments to authenticated;
grant all on public.payments to service_role;

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy "Members can read their organization subscription"
  on public.subscriptions for select to authenticated
  using (public.has_organization_role(organization_id, array['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));

create policy "Members can read their organization payments"
  on public.payments for select to authenticated
  using (public.has_organization_role(organization_id, array['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));

create policy "Owners and admins can create payments"
  on public.payments for insert to authenticated
  with check (public.has_organization_role(organization_id, array['owner','administrator']::public.app_role[]));