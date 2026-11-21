-- MyKey Caixa — esquema Supabase (rodar no SQL Editor, uma vez)

create table if not exists public.mykey_estado (
  id            integer primary key check (id = 1),
  conteudo      jsonb   not null,
  revisao       bigint  not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table if not exists public.mykey_revisoes (
  id        bigserial primary key,
  revisao   bigint not null,
  conteudo  jsonb  not null,
  salvo_em  timestamptz not null default now(),
  salvo_por uuid
);

-- Quem pode acessar o caixa
create table if not exists public.mykey_usuarios_autorizados (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.mykey_estado enable row level security;
alter table public.mykey_revisoes enable row level security;
alter table public.mykey_usuarios_autorizados enable row level security;

create or replace function public.mykey_autorizado()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mykey_usuarios_autorizados where user_id = (select auth.uid()));
$$;

drop policy if exists mykey_estado_select on public.mykey_estado;
create policy mykey_estado_select on public.mykey_estado
  for select to authenticated using (public.mykey_autorizado());

-- Sem policies de insert/update/delete: gravação só pelo RPC abaixo.
-- mykey_revisoes e mykey_usuarios_autorizados: sem policies = inacessíveis pela API.

create or replace function public.mykey_salvar_estado(p_conteudo jsonb, p_revisao_esperada bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_atual bigint; v_nova bigint;
begin
  if not public.mykey_autorizado() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select revisao into v_atual from public.mykey_estado where id = 1 for update;
  if not found then
    if p_revisao_esperada <> 0 then
      raise exception 'Conflito de revisão' using errcode = '40001';
    end if;
    v_nova := 1;
    insert into public.mykey_estado(id, conteudo, revisao, atualizado_por)
    values (1, p_conteudo, v_nova, (select auth.uid()));
  else
    if v_atual <> p_revisao_esperada then
      raise exception 'Conflito de revisão' using errcode = '40001';
    end if;
    v_nova := v_atual + 1;
    update public.mykey_estado
       set conteudo = p_conteudo, revisao = v_nova, atualizado_em = now(), atualizado_por = (select auth.uid())
     where id = 1;
  end if;
  insert into public.mykey_revisoes(revisao, conteudo, salvo_por)
  values (v_nova, p_conteudo, (select auth.uid()));
  -- mantém só as últimas 60 revisões
  delete from public.mykey_revisoes where revisao <= v_nova - 60;
  return v_nova;
end $$;

revoke all on function public.mykey_salvar_estado(jsonb, bigint) from public, anon;
grant execute on function public.mykey_salvar_estado(jsonb, bigint) to authenticated;
revoke all on function public.mykey_autorizado() from public, anon;
grant execute on function public.mykey_autorizado() to authenticated;

-- Depois de criar o usuário em Authentication > Users, autorize-o:
-- insert into public.mykey_usuarios_autorizados(user_id)
-- select id from auth.users where email = 'SEU@EMAIL';
