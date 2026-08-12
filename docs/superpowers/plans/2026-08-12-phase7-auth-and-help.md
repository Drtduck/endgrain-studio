# Фаза 7: Supabase auth, облачные проекты, кнопка обратной связи, контекстные подсказки

Репозиторий: `/Users/drtloki/Desktop/Актуальное/Code/MY/endgrain-studio`, ветка `main`, дерево чистое.
Донор паттернов: `/Users/drtloki/Desktop/Актуальное/Code/WB/bets-supa/apps/web` (ресерч: `docs/research/bets-supa-port.md`).

Цель фазы: студия получает необязательный аккаунт. Аноним работает ровно как сейчас (localStorage + ссылка-хэш), а залогиненный дополнительно хранит проекты в облаке. Плюс две сквозные фичи: кнопка «Предложить доработку» и контекстные подсказки по всем панелям.

**Приложение остаётся публичным.** Ни один маршрут не закрывается. Авторизация это добавленная ценность (синхронизация между устройствами), а не пропускной пункт. Человек, который открыл ссылку на прод и никогда не регистрировался, не должен заметить, что фаза 7 вообще случилась, кроме новой кнопки в шапке, кнопки обратной связи и иконок «?» у панелей.

---

## Ключевые находки, без которых задача будет сделана неправильно

**1. У нас Next 16.3, и `middleware.ts` там переименован в `proxy.ts`.**
Проверено в `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`: «The `middleware.js` file convention has been deprecated in Next.js 16 and renamed to `proxy.js`». Файл кладём в корень как `proxy.ts`, экспортируем функцию `proxy` (не `middleware`) плюс `config.matcher`. Донорский `middleware.ts` копировать буквально нельзя.

**2. У нас Base UI, а не Radix.**
`components/ui/*` построены на `@base-ui/react` (`button`, `separator`, `badge`). Донорские `PopoverTrigger`/`PopoverContent` из Radix к нам не переносятся. Base UI Popover разбирается на части: `Popover.Root`, `Popover.Trigger`, `Popover.Portal`, `Popover.Positioner` (props `side`, `sideOffset`, `align`, `collisionPadding`), `Popover.Popup`, `Popover.Close`. Проверено по `node_modules/@base-ui/react/popover/index.parts.d.ts` и `internals/useAnchorPositioning.d.ts`.

**3. В jsdom нет `ResizeObserver`.**
Проверено: `new JSDOM().window.ResizeObserver === undefined`. Позиционирование Base UI под капотом использует floating-ui, который его требует. Без полифилла в `vitest.setup.ts` любой компонент-тест с попапом упадёт. Полифилл добавляем один раз в задаче 5.

**4. Примитивов формы у нас нет.**
В `components/ui/` лежат только `badge`, `button`, `card`, `separator`. `Input`, `Textarea`, `Popover` пишем руками под наши токены (стиль поля берём дословно из `components/NumberFieldMm.tsx`: рамка `border-line`, фокус `focus-within:border-[1.5px] focus-within:border-accent focus-within:shadow-focus`). CLI `shadcn` не запускаем: он тянет свои цвета и ломает палитру.

**5. `html2canvas` у нас нет и не будет.**
Донор снимал скриншот страницы в обратную связь. Мы этого **не делаем**: 200+ КБ зависимости ради необязательной картинки не окупаются. Собираем текст, маршрут и userAgent. Точки расширения (скриншот, вложения, GitHub issue, Telegram) описаны в задаче 6 как комментарии в коде, но не реализуются.

**6. Env-переменные нужно добавить, существующие не трогаем.**
В `.env.local` уже есть `SUPABASE_PROJECT_ID`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DATABASE_PASS`. Клиентскому коду нужны **`NEXT_PUBLIC_`**-варианты, потому что Next инлайнит в бандл только их:

```
NEXT_PUBLIC_SUPABASE_URL=https://<SUPABASE_PROJECT_ID>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<то же значение, что SUPABASE_ANON_KEY>
```

Значения в репозиторий не попадают никогда: `.env.local` в `.gitignore`, в плане и коде фигурируют только имена. `SUPABASE_SERVICE_ROLE_KEY` в фазе 7 **не используется вообще**: все операции идут под anon-ключом через RLS. Это и есть защита.

**7. Отсутствие Supabase не должно ронять сборку и e2e.**
В CI (`.github/workflows/ci.yml`) секретов нет и не будет. Поэтому вводим `isSupabaseConfigured()`: если `NEXT_PUBLIC_SUPABASE_URL` или `NEXT_PUBLIC_SUPABASE_ANON_KEY` пустые, аккаунт-кнопка и вкладка «Мои проекты» не рендерятся, `proxy.ts` пропускает запрос без обращения к сети, а форма обратной связи показывает честную ошибку. Существующие тесты в CI при этом видят ровно сегодняшнее приложение.

**8. Аутентификация не должна порождать `setState` в эффекте.**
В репозитории действует `react-hooks/set-state-in-effect` (см. комментарий в `NumberFieldMm.tsx`). Поэтому текущего пользователя **не** запрашиваем хуком на клиенте. Читаем его в серверном `app/layout.tsx` через `getCurrentUser()` и прокидываем в клиентский React-контекст `SessionProvider`. После входа/выхода состояние обновляет `router.refresh()`. Побочный эффект решения: чтение cookies делает рендер динамическим. Для нашего приложения это бесплатно, весь UI и так клиентский, а SSR-проход отдаёт пустую оболочку.

---

## Глобальные ограничения

1. **Длинное тире (U+2014) запрещено** везде: код, комментарии, коммиты, UI-тексты, SQL. Только дефис, двоеточие или скобки. Тест `lib/i18n/index.test.ts` проверяет это по словарю автоматически, новые ключи попадут под ту же проверку.
2. **Все тексты пользователю и коммиты по-русски**, техтермины на английском. Все UI-строки только через `t(locale, key)`, ключи добавляются **одновременно** в `lib/i18n/ru.ts` и `lib/i18n/en.ts` (иначе падает тест «has the same keys in both locales»).
3. **Только дизайн-токены.** Сырых hex в новых компонентах нет. Цвета берём из `app/globals.css`: `bg-surface`, `bg-surface-raised`, `bg-app`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `border-line`, `border-line-subtle`, `bg-accent`, `text-accent`, `bg-accent-soft`, `shadow-sm/md/lg/dialog`, `shadow-focus`, `duration-hover`, `ease-out`, `rounded-sm/md/lg`. Числа в интерфейсе набираются `font-mono` + `tabular-nums`.
4. **Секреты не коммитятся.** В коде и документации только имена переменных. `.env.local` не редактируем из агента, изменения в нём делает координатор руками (см. раздел «Что делает координатор»).
5. **Существующие 33 e2e-теста (7 файлов в `e2e/`) остаются зелёными и не редактируются.** Ни один существующий `data-testid` и `aria-label` не переименовывается и не удаляется. Новые testid обязательны для каждого нового интерактивного элемента.
6. **Квирки репозитория:**
   - `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Опциональный проп нельзя передавать как `foo={undefined}`, только условным спредом `...(x ? { foo: x } : {})`. Обращение к элементу массива по индексу даёт `T | undefined`, нужна явная проверка.
   - `process.env` читается только через индексную нотацию (`process.env['CI']`) **кроме** `NEXT_PUBLIC_*`, которые Next инлайнит статическим разбором и требуют точечной записи `process.env.NEXT_PUBLIC_SUPABASE_URL`. Это единственное исключение, оно снабжается комментарием.
   - Тесты пользуются нативными DOM-проверками (`container.querySelector`, `.getAttribute`, `expect(...).toBeDefined()`) наравне с jest-dom. Новые тесты пишем в том же стиле.
   - `fireEvent` уже обёрнут в `act()`. Ручной `act()` нужен только для прямых мутаций стора: `act(() => { useStudio.getState().setLocale('en') })`.
   - `vitest.config.ts` собирает тесты только из `lib/**`, `components/**`, `app/**`. Тесты для `app/actions/*` кладём рядом как `app/actions/*.test.ts` (расширение `.ts`, шаблон `app/**/*.test.tsx` его не поймает) - **поэтому в задаче 4 расширяем `include` в `vitest.config.ts` до `app/**/*.test.ts`**.
   - Формат кода в `lib/` и `components/` (кроме `components/ui/*`): без точек с запятой, одинарные кавычки, 2 пробела. В `components/ui/*` формат shadcn: двойные кавычки, точки с запятой. Новые файлы следуют формату своей папки.
7. **Server actions валидируют вход через `zod` (v4, уже в зависимостях) и никогда не доверяют клиенту.** `user_id` в базу пишет не клиент, а сервер из `auth.getUser()`.
8. Каждая задача заканчивается зелёными `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` и указанным точечным e2e. Красное не коммитим. Коммит на задачу, сообщение по-русски.

---

## Задача 1. Обвязка Supabase: клиенты, конфиг, proxy, сессия в layout

**Файлы:** `package.json` (зависимости), `lib/supabase/config.ts` (новый), `lib/supabase/browser.ts` (новый), `lib/supabase/server.ts` (новый), `lib/supabase/session.ts` (новый), `lib/supabase/proxy.ts` (новый), `proxy.ts` (новый, корень), `components/SessionProvider.tsx` (новый), `app/layout.tsx`, `lib/supabase/config.test.ts` (новый).

### Шаг 1.1. Зависимости

```
pnpm add @supabase/ssr @supabase/supabase-js
```

Донорские версии: `@supabase/ssr` 0.10.x, `supabase-js` 2.45.x. Ставим актуальные, лок-файл коммитим.

Типы БД (`database.types.ts`) в этой фазе **не генерируем**: таблиц две, поля описываем руками в `lib/supabase/types.ts` (задача 2). Генерация через MCP `generate_typescript_types` вписана как необязательный шаг в задачу 2.

### Шаг 1.2. `lib/supabase/config.ts`

```ts
/**
 * Единственное место, где читаются публичные переменные Supabase.
 * Точечная нотация process.env.NEXT_PUBLIC_* обязательна: Next инлайнит эти
 * значения в клиентский бандл статическим разбором и индексную запись
 * process.env['NEXT_PUBLIC_...'] не видит.
 */
export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Аккаунт в студии необязателен, а в CI секретов нет вовсе. Поэтому любой код,
 * который собирается идти в Supabase, сначала спрашивает разрешения здесь:
 * без переменных приложение работает как раньше, на localStorage, и молчит.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}
```

### Шаг 1.3. `lib/supabase/browser.ts`

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

let client: SupabaseClient | null = null

/** Синглтон: несколько клиентов в одной вкладке дерутся за обновление токена. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}
```

### Шаг 1.4. `lib/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const store = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options)
        } catch {
          // В серверном компоненте запись cookie запрещена и бросает.
          // Это не ошибка: сессию продлевает proxy.ts до рендера.
        }
      },
    },
  })
}
```

### Шаг 1.5. `lib/supabase/session.ts`

```ts
import { cache } from 'react'
import { isSupabaseConfigured } from './config'
import { getSupabaseServer } from './server'

export interface SessionUser {
  readonly id: string
  readonly email: string
}

/**
 * Текущий пользователь, мемоизированный на один серверный рендер (react cache,
 * не unstable_cache: cookies читать можно). Возвращаем узкий тип, а не User из
 * supabase-js: в клиентский контекст не должно уехать ничего лишнего.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data } = await sb.auth.getUser()
    const user = data.user
    if (!user) return null
    return { id: user.id, email: user.email ?? '' }
  } catch {
    // Supabase лежит или сеть моргнула: студия обязана открыться и без аккаунта.
    return null
  }
})
```

### Шаг 1.6. `lib/supabase/proxy.ts` и корневой `proxy.ts`

Донорский `updateSession` берём только в части переноса cookies (`carryCookies`), весь RBAC и редиректы выбрасываем. Наш proxy **никого никуда не редиректит**: он только продлевает сессию, чтобы залогиненный не вылетал раз в час.

`lib/supabase/proxy.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

/**
 * Продление сессии и ничего больше. Приложение публичное: неавторизованного
 * никуда не уводим, закрытых маршрутов нет. Единственная задача - забрать
 * свежую пару токенов и донести Set-Cookie до браузера.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // Вызов обязателен: именно getUser обновляет протухший access-токен и
  // дёргает setAll. Без него сессия живёт ровно до истечения токена.
  try {
    await supabase.auth.getUser()
  } catch {
    // Сеть до Supabase не должна стоить пользователю 500 на статичной странице.
  }

  return response
}
```

`proxy.ts` в корне репозитория:

```ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSession(request)
}

// Матчер исключает статику и картинки: без него proxy отрабатывает даже на
// _next/static и превращает раздачу ассетов в поход за сессией.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### Шаг 1.7. `components/SessionProvider.tsx`

```tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SessionUser } from '@/lib/supabase/session'

export interface SessionValue {
  readonly user: SessionUser | null
  /** false, когда переменные Supabase не заданы: весь UI аккаунта скрыт. */
  readonly enabled: boolean
}

const SessionContext = createContext<SessionValue>({ user: null, enabled: false })

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>
}

/**
 * Пользователь приезжает пропсом из серверного layout, а не запрашивается
 * эффектом: так нет ни мигания «гость -> вошёл», ни setState в useEffect,
 * который запрещён правилом react-hooks/set-state-in-effect.
 */
export function useSession(): SessionValue {
  return useContext(SessionContext)
}
```

Заметка для исполнителя: в React 19 `<Context>` работает как провайдер напрямую, `<Context.Provider>` тоже валиден. Берём короткую форму, она уже используемая версия React (19.2.8).

### Шаг 1.8. `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { bitter, golos, jetbrains } from "./fonts";
import { SessionProvider } from "@/components/SessionProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endgrain Studio",
  description: "Проект торцевой разделочной доски: узор, распил, материал, себестоимость",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html
      lang="ru"
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SessionProvider value={{ user, enabled: isSupabaseConfigured() }}>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

Layout становится `async`. Тип `LayoutProps<"/">` (Next typegen) сохраняем дословно.

### Шаг 1.9. Тесты задачи 1

`lib/supabase/config.test.ts`: `isSupabaseConfigured()` возвращает `false` при пустых значениях. Поскольку значения читаются на уровне модуля, тест использует `vi.resetModules()` + `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ...)` и динамический `await import('./config')` в каждом кейсе. Три случая: обе пусты, задана только одна, заданы обе.

**Проверка задачи:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, затем `pnpm test:e2e e2e/editor.spec.ts` (убедиться, что переезд layout на async и появление proxy ничего не сломали).

**Коммит:** `feat: подключение Supabase, клиенты и продление сессии в proxy`

---

## Задача 2. Схема базы: projects, feedback, RLS

**Файлы:** `supabase/migrations/20260812090000_phase7_projects_feedback.sql` (новый), `lib/supabase/types.ts` (новый).

Миграцию **применяет координатор** через MCP `mcp__supabase__apply_migration` (name `phase7_projects_feedback`, query = содержимое файла). Файл в репозитории это единственный источник правды: если завтра понадобится второй проект Supabase, накатывается он же. Локальный `supabase` CLI не заводим, папка `supabase/migrations/` существует только ради истории схемы.

### Шаг 2.1. Полный текст миграции

```sql
-- Фаза 7: облачные проекты пользователя и обратная связь.
-- Аккаунт в студии необязателен, поэтому таблицы устроены так, чтобы аноним
-- мог оставить отзыв, но не мог увидеть ни чужой отзыв, ни чужой проект.

-- 1. Проекты пользователя ---------------------------------------------------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Без названия',
  design      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_name_len check (char_length(name) between 1 and 120),
  -- Документ студии это десятки килобайт. Полмегабайта это заведомо мусор
  -- или попытка использовать таблицу как файловое хранилище.
  constraint projects_design_size check (pg_column_size(design) <= 524288)
);

comment on table public.projects is 'Сохранённые в облако проекты досок Endgrain Studio';
comment on column public.projects.design is 'Документ Design из lib/engine, схема версионируется полем schemaVersion внутри JSON';

-- Список проектов всегда сортируется по дате правки в пределах одного юзера.
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

-- updated_at обязан двигаться сам: клиент в него не пишет и подделать порядок
-- списка не может.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;

-- Владелец и только владелец. Четыре отдельные политики вместо одной "for all":
-- так insert проверяется по with check, а чтение по using, и подмена user_id
-- в теле запроса не проходит.
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2. Обратная связь ----------------------------------------------------------

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  body        text not null,
  route       text,
  user_agent  text,
  locale      text,
  created_at  timestamptz not null default now(),
  constraint feedback_body_len check (char_length(body) between 1 and 2000),
  constraint feedback_route_len check (route is null or char_length(route) <= 512),
  constraint feedback_ua_len check (user_agent is null or char_length(user_agent) <= 512),
  constraint feedback_locale_allowed check (locale is null or locale in ('ru', 'en'))
);

comment on table public.feedback is 'Сообщения из кнопки «Предложить доработку», в том числе от анонимов';

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Писать может кто угодно, включая анонима: кнопка доступна без входа.
-- Подделать авторство нельзя: либо запись анонимная, либо user_id совпадает
-- с текущей сессией.
drop policy if exists feedback_insert_any on public.feedback;
create policy feedback_insert_any on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Читать свои сообщения может автор. Общий разбор обращений идёт из панели
-- Supabase под service-ключом, который в приложении не используется.
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()));
```

Замечания по решениям:

- `(select auth.uid())` вместо голого `auth.uid()` в политиках: подзапрос кэшируется планировщиком на весь запрос, это рекомендация Supabase по производительности RLS.
- Колонка называется `body`, а не `text`: `text` это имя типа, и запросы вида `select text from feedback` читаются как ошибка. В UI это по-прежнему «текст обращения».
- Квоты на число проектов на пользователя **нет**. Точка расширения: `create policy` с подсчётом строк или триггер `before insert`. Пока лимитов не ставим, аудитория конкурсная.
- `service_role` в политиках не упоминается: он RLS обходит по определению.

### Шаг 2.2. `lib/supabase/types.ts`

```ts
import type { Design } from '@/lib/engine'

/** Строка public.projects. Держим руками: две таблицы не стоят генерации типов. */
export interface ProjectRow {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly design: Design
  readonly created_at: string
  readonly updated_at: string
}

/** То, что уезжает на клиент в списке: документ грузим отдельным запросом. */
export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
}
```

Необязательный шаг после применения миграции: `mcp__supabase__generate_typescript_types` и сверка руками. Если типы разъедутся, правда за миграцией.

### Шаг 2.3. Проверка

Кода в этой задаче почти нет, поэтому проверка ручная: координатор применяет миграцию, затем `mcp__supabase__list_tables` показывает `projects` и `feedback`, а `mcp__supabase__get_advisors` (тип `security`) не показывает предупреждений «RLS disabled» и «policy allows public access».

**Коммит:** `feat: миграция для облачных проектов и обратной связи`

---

## Задача 3. Страницы входа, регистрации и восстановления пароля

**Файлы:** `components/ui/input.tsx` (новый), `components/auth/AuthCard.tsx` (новый), `components/auth/AuthForm.tsx` (новый), `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/auth/callback/route.ts`, `app/actions/auth.ts`, `lib/i18n/ru.ts`, `lib/i18n/en.ts`, `components/auth/AuthForm.test.tsx` (новый).

Группу маршрутов `(auth)` с общим layout **не заводим**: Next 16 typegen выдаёт `LayoutProps<"/маршрут">` на каждый layout, и для группы с четырьмя страницами тип получается неочевидным. Общую рамку даёт обычный компонент `AuthCard`.

Локаль на страницах входа берём из стора (`useStudio((s) => s.locale)`): стор клиентский, дефолт `ru`, страницы тоже клиентские.

### Шаг 3.1. `components/ui/input.tsx`

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "h-9 w-full rounded-sm border border-line bg-surface-raised px-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-hover ease-out placeholder:text-ink-muted hover:border-line-strong focus-visible:border-[1.5px] focus-visible:border-accent focus-visible:shadow-focus disabled:border-line-subtle disabled:bg-surface-sunken disabled:text-line-strong aria-invalid:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

### Шаг 3.2. `components/auth/AuthCard.tsx`

```tsx
'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

export function AuthCard({
  locale,
  titleKey,
  subtitleKey,
  children,
  footer,
}: {
  locale: Locale
  titleKey: MessageKey
  subtitleKey?: MessageKey
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-10">
      <div
        data-testid="auth-card"
        className="flex w-full max-w-[380px] flex-col gap-5 rounded-lg border border-line-subtle bg-surface p-6 shadow-lg"
      >
        <div className="flex flex-col gap-1.5">
          <Link href="/" className="flex items-center gap-2 text-ink" data-testid="auth-home">
            <span className="flex size-[22px] items-center justify-center rounded-xs bg-accent font-display text-[13px] text-ink-inverse">
              E
            </span>
            <span className="font-display text-[15px] font-semibold">{t(locale, 'app.title')}</span>
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink">{t(locale, titleKey)}</h1>
          {subtitleKey ? (
            <p className="text-sm leading-normal text-ink-secondary">{t(locale, subtitleKey)}</p>
          ) : null}
        </div>
        {children}
        {footer ? <div className="flex flex-col gap-1 text-sm text-ink-secondary">{footer}</div> : null}
      </div>
    </div>
  )
}
```

### Шаг 3.3. `components/auth/AuthForm.tsx`

Единая форма для входа и регистрации: поля одинаковые, отличается только вызов Supabase и тексты. Отдельный компонент нужен ещё и потому, что его удобно покрыть компонент-тестом с замоканным клиентом.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type Locale } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'

export const MIN_PASSWORD_LENGTH = 8

export type AuthMode = 'login' | 'register'

export function AuthForm({ mode, locale }: { mode: AuthMode; locale: Locale }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      setError(t(locale, 'auth.errorShortPassword', { min: MIN_PASSWORD_LENGTH }))
      return
    }
    setBusy(true)
    const sb = getSupabaseBrowser()

    if (mode === 'login') {
      const { error: signInError } = await sb.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (signInError) {
        // Сообщение Supabase не показываем дословно: оно на английском и
        // подсказывает, существует ли такой email.
        setError(t(locale, 'auth.errorBadCredentials'))
        return
      }
      router.push('/')
      router.refresh()
      return
    }

    const { data, error: signUpError } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setBusy(false)
    if (signUpError) {
      setError(t(locale, 'auth.errorSignUp'))
      return
    }
    // Если в проекте включено подтверждение почты, сессии в ответе нет:
    // это не ошибка, а ожидание письма.
    if (!data.session) {
      setConfirmSent(true)
      return
    }
    router.push('/')
    router.refresh()
  }

  if (confirmSent) {
    return (
      <p data-testid="auth-confirm-sent" className="text-sm leading-normal text-ink-secondary">
        {t(locale, 'auth.confirmSent')}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid={`auth-form-${mode}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor="auth-email" className="text-[11px] text-ink-muted">
          {t(locale, 'auth.email')}
        </label>
        <Input
          id="auth-email"
          data-testid="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="auth-password" className="text-[11px] text-ink-muted">
          {t(locale, 'auth.password')}
        </label>
        <Input
          id="auth-password"
          data-testid="auth-password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>

      {error ? (
        <p role="alert" data-testid="auth-error" className="text-sm text-error-text">
          {error}
        </p>
      ) : null}

      <Button type="submit" data-testid="auth-submit" disabled={busy} className="w-full">
        {busy
          ? t(locale, 'auth.busy')
          : t(locale, mode === 'login' ? 'auth.signIn' : 'auth.signUp')}
      </Button>
    </form>
  )
}
```

### Шаг 3.4. Страницы

`app/login/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthForm } from '@/components/auth/AuthForm'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export default function LoginPage() {
  const locale = useStudio((s) => s.locale)
  return (
    <AuthCard
      locale={locale}
      titleKey="auth.loginTitle"
      subtitleKey="auth.loginSubtitle"
      footer={
        <>
          <Link href="/forgot-password" data-testid="auth-forgot-link" className="text-accent hover:underline">
            {t(locale, 'auth.forgotLink')}
          </Link>
          <Link href="/register" data-testid="auth-register-link" className="text-accent hover:underline">
            {t(locale, 'auth.registerLink')}
          </Link>
        </>
      }
    >
      <AuthForm mode="login" locale={locale} />
    </AuthCard>
  )
}
```

`app/register/page.tsx` - тот же каркас, `titleKey="auth.registerTitle"`, `subtitleKey="auth.registerSubtitle"`, `<AuthForm mode="register" />`, в футере одна ссылка на `/login` (`data-testid="auth-login-link"`). Регистрация **открытая**: у донора она была только по инвайтам, у нас инвайтов нет и код приглашений не переносится.

`app/forgot-password/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { AuthCard } from '@/components/auth/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'
import { useStudio } from '@/lib/store/studio'

export default function ForgotPasswordPage() {
  const locale = useStudio((s) => s.locale)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    // Результат намеренно не разбираем: ответ обязан быть одинаковым и для
    // существующей почты, и для чужой, иначе форма превращается в проверялку
    // «есть ли такой аккаунт».
    await getSupabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthCard
      locale={locale}
      titleKey="auth.forgotTitle"
      subtitleKey="auth.forgotSubtitle"
      footer={
        <Link href="/login" data-testid="auth-login-link" className="text-accent hover:underline">
          {t(locale, 'auth.backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <p data-testid="auth-forgot-sent" className="text-sm leading-normal text-ink-secondary">
          {t(locale, 'auth.forgotSent')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="auth-form-forgot">
          <div className="flex flex-col gap-1">
            <label htmlFor="auth-email" className="text-[11px] text-ink-muted">
              {t(locale, 'auth.email')}
            </label>
            <Input
              id="auth-email"
              data-testid="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" data-testid="auth-submit" disabled={busy} className="w-full">
            {busy ? t(locale, 'auth.busy') : t(locale, 'auth.forgotSubmit')}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
```

`app/reset-password/page.tsx`: два поля пароля, проверка `length >= 8` и совпадения, `sb.auth.updateUser({ password })`, затем `router.push('/')` и `router.refresh()`. Признак живой ссылки берём **не** эффектом с `setState` (правило `react-hooks/set-state-in-effect`), а по факту ответа: пользователь просто жмёт «Сохранить», и если сессии нет, `updateUser` возвращает ошибку, показываем `auth.resetExpired` со ссылкой на `/forgot-password`. Это на один сетевой запрос честнее донорского варианта и не требует эффекта.

`app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next')
  // Открытый редирект недопустим: принимаем только собственные пути.
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const sb = await getSupabaseServer()
  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=auth', request.url))

  return NextResponse.redirect(new URL(next, request.url))
}
```

Донорский блок с `pending_invite_token` не переносим.

`app/actions/auth.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = await getSupabaseServer()
    await sb.auth.signOut()
  }
  // redirect бросает специальное исключение: любой код после него мёртв.
  redirect('/')
}
```

### Шаг 3.5. Новые ключи i18n (ru / en)

| ключ | ru | en |
|---|---|---|
| `auth.loginTitle` | Вход | Sign in |
| `auth.loginSubtitle` | Аккаунт нужен только для облачных проектов. Без него студия работает как обычно | An account is only for cloud projects. The studio works fine without one |
| `auth.registerTitle` | Регистрация | Sign up |
| `auth.registerSubtitle` | Почта и пароль, больше ничего не спрашиваем | Email and password, nothing else |
| `auth.email` | Почта | Email |
| `auth.password` | Пароль | Password |
| `auth.passwordRepeat` | Повторите пароль | Repeat password |
| `auth.signIn` | Войти | Sign in |
| `auth.signUp` | Создать аккаунт | Create account |
| `auth.busy` | Секунду | One moment |
| `auth.registerLink` | Нет аккаунта? Зарегистрироваться | No account yet? Sign up |
| `auth.loginLink` | Уже есть аккаунт? Войти | Already have an account? Sign in |
| `auth.forgotLink` | Забыли пароль? | Forgot your password? |
| `auth.backToLogin` | Назад ко входу | Back to sign in |
| `auth.errorBadCredentials` | Неверная почта или пароль | Wrong email or password |
| `auth.errorSignUp` | Не получилось создать аккаунт. Проверьте почту и пароль | Could not create the account. Check the email and password |
| `auth.errorShortPassword` | Пароль не короче {min} символов | The password must be at least {min} characters |
| `auth.errorPasswordMismatch` | Пароли не совпадают | The passwords do not match |
| `auth.confirmSent` | Отправили письмо со ссылкой для подтверждения. Откройте её, и вход завершится сам | We sent a confirmation link. Open it and the sign in will finish itself |
| `auth.forgotTitle` | Сброс пароля | Password reset |
| `auth.forgotSubtitle` | Пришлём ссылку для нового пароля на указанную почту | We will email a link for setting a new password |
| `auth.forgotSubmit` | Отправить ссылку | Send the link |
| `auth.forgotSent` | Если такой аккаунт есть, письмо уже в пути. Ссылка живёт ограниченное время | If that account exists, the email is on its way. The link expires after a while |
| `auth.resetTitle` | Новый пароль | New password |
| `auth.resetSubtitle` | Придумайте пароль не короче 8 символов | Pick a password of at least 8 characters |
| `auth.resetSubmit` | Сохранить пароль | Save the password |
| `auth.resetExpired` | Ссылка устарела или уже использована. Запросите новую | The link is expired or already used. Request a new one |

### Шаг 3.6. Тесты задачи 3

`components/auth/AuthForm.test.tsx` с моком клиента:

```tsx
const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { session: {} }, error: null }))
const push = vi.fn()
const refresh = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signInWithPassword, signUp } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
```

Кейсы:
1. Вход зовёт `signInWithPassword` с введёнными значениями и уводит на `/` (`expect(push).toHaveBeenCalledWith('/')`).
2. Ошибка входа рисует `role="alert"` с русским текстом и не зовёт `push`.
3. Регистрация с паролем в 5 символов не ходит в сеть вовсе (`expect(signUp).not.toHaveBeenCalled()`) и показывает `auth.errorShortPassword`.
4. Регистрация без сессии в ответе показывает `auth-confirm-sent`.
5. Локаль: `act(() => { useStudio.getState().setLocale('en') })` через страницу-обёртку или прямой проп `locale="en"` даёт «Sign in».

**Проверка задачи:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. E2E на этом шаге не добавляем (задача 8).

**Коммит:** `feat: страницы входа, регистрации и восстановления пароля`

---

## Задача 4. Облачные проекты: «Мои проекты» и кнопка аккаунта

**Файлы:** `app/actions/projects.ts` (новый), `app/actions/projects.test.ts` (новый), `components/ProjectsPanel.tsx` (новый), `components/ProjectsPanel.test.tsx` (новый), `components/AccountButton.tsx` (новый), `components/AccountButton.test.tsx` (новый), `components/StudioTabs.tsx`, `components/StudioShell.tsx`, `lib/store/studio.ts`, `vitest.config.ts`, `lib/i18n/ru.ts`, `lib/i18n/en.ts`.

Анонимный поток не меняется ни одной строкой: `useStudioPersistence` продолжает писать в localStorage, хэш-ссылки работают как работали. Облако это отдельный, добавочный путь.

### Шаг 4.1. Server actions `app/actions/projects.ts`

```ts
'use server'

import { z } from 'zod'
import type { Design } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import type { ProjectSummary } from '@/lib/supabase/types'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ProjectsError }

/** Коды, а не готовые фразы: текст выбирает клиент по своей локали. */
export type ProjectsError = 'unauthenticated' | 'invalid' | 'notFound' | 'failed'

const nameSchema = z.string().trim().min(1).max(120)
const idSchema = z.uuid()

async function requireUser(): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.auth.getUser()
  return data.user ? { id: data.user.id } : null
}

export async function listProjectsAction(): Promise<ActionResult<readonly ProjectSummary[]>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('projects')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error || !data) return { ok: false, error: 'failed' }
  return {
    ok: true,
    data: data.map((row) => ({ id: String(row.id), name: String(row.name), updatedAt: String(row.updated_at) })),
  }
}

export async function saveProjectAction(name: string, design: unknown): Promise<ActionResult<ProjectSummary>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: 'invalid' }

  // Документ проверяем нашей же схемой персиста: в базу не должно попасть
  // ничего, что редактор потом не сможет открыть.
  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const sb = await getSupabaseServer()
  // user_id ставит сервер, а не клиент: RLS это тоже проверит, но полагаться
  // на присланное значение нельзя даже под политикой.
  const { data, error } = await sb
    .from('projects')
    .insert({ user_id: user.id, name: parsedName.data, design: checked })
    .select('id, name, updated_at')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, data: { id: String(data.id), name: String(data.name), updatedAt: String(data.updated_at) } }
}

export async function loadProjectAction(id: string): Promise<ActionResult<Design>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { data, error } = await sb.from('projects').select('design').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: 'failed' }
  if (!data) return { ok: false, error: 'notFound' }
  try {
    // Документ мог быть сохранён прошлой версией схемы: parseDesign прогонит миграции.
    return { ok: true, data: parseDesign(data.design) }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

export async function deleteProjectAction(id: string): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { error } = await sb.from('projects').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  return { ok: true, data: null }
}
```

Заметки:
- Фильтр `eq('user_id', ...)` в select не пишем сознательно: его уже делает RLS, дублирование создаёт ложное чувство, что политика необязательна. В `delete` и `load` ограничение по владельцу тоже даёт RLS.
- Обновление существующего проекта (`update`) в фазу 7 не входит: «Сохранить» всегда создаёт новую запись. Так проще и честнее для конкурсного срока. Точка расширения помечена комментарием в коде.
- Zod v4: `z.uuid()` вместо устаревшего `z.string().uuid()`.

### Шаг 4.2. `vitest.config.ts`

```ts
include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'app/**/*.test.ts', 'app/**/*.test.tsx'],
```

### Шаг 4.3. Новое значение `StudioView`

В `lib/store/studio.ts`:

```ts
export type StudioView = 'editor' | 'templates' | 'generate' | 'photo' | 'view3d' | 'projects'
```

Больше в сторе не меняется ничего: `view` в localStorage не пишется (`lib/store/persist.ts` сохраняет только `Design`), значит после выхода из аккаунта зависшего состояния не будет.

### Шаг 4.4. `components/StudioTabs.tsx`

Вкладка «Мои проекты» появляется, только когда Supabase настроен и пользователь вошёл:

```tsx
const { user, enabled } = useSession()
const tabs = enabled && user ? [...TABS, { view: 'projects' as const, labelKey: 'tabs.projects' as const }] : TABS
```

Существующие testid `tab-editor` … `tab-view3d` не трогаем, новая вкладка получает `tab-projects` по той же схеме шаблонной строки.

### Шаг 4.5. `components/ProjectsPanel.tsx`

Полноэкранная панель по образцу `TemplateGallery`. Поведение:

- список подтягивается по клику «Обновить» и один раз при открытии вкладки. Первичная загрузка **не** через `useEffect` с `setState`, а через `useTransition` + вызов из обработчика вкладки? Нет: вкладка переключается в `StudioTabs`. Поэтому загрузку делаем в самом компоненте через `useActionState`-подобный паттерн: компонент рендерит кнопку `projects-refresh` и **пустой список с подсказкой «нажмите обновить»**, а первичный автозапрос делает `useEffect` без `setState` напрямую (`startTransition(async () => { const res = await listProjectsAction(); setItems(...) })`). Правило `react-hooks/set-state-in-effect` ругается на синхронный `setState` в теле эффекта; вызов внутри `startTransition` в async-колбэке под него не попадает. Если линтер всё же ругнётся, откатываемся на явный `projects-refresh` без автозагрузки, это допустимая деградация UX и её надо отразить в тексте `projects.empty`.
- «Сохранить текущий проект»: поле имени (дефолт `design.name`), кнопка `projects-save`, вызывает `saveProjectAction(name, selectDesign(useStudio.getState()))`, при успехе дописывает запись в начало списка.
- Строка списка: имя, дата (`Intl.DateTimeFormat(locale)`), кнопки `project-load-<id>` и `project-delete-<id>`. Загрузка зовёт `loadProjectAction`, затем `useStudio.getState().loadDesign(design)` и `setView('editor')`.
- Удаление подтверждается вторым кликом по той же кнопке (состояние «подтвердить») - без модалки.
- Все ошибки печатаются одной строкой `role="alert"` с `data-testid="projects-error"`, текст выбирается по коду: `unauthenticated -> projects.errorAuth`, `invalid -> projects.errorInvalid`, `notFound -> projects.errorNotFound`, `failed -> projects.errorFailed`.

### Шаг 4.6. `components/AccountButton.tsx`

```tsx
'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import { useSession } from '@/components/SessionProvider'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export function AccountButton() {
  const locale = useStudio((s) => s.locale)
  const { user, enabled } = useSession()

  // Без переменных Supabase аккаунта в приложении не существует: не показываем
  // кнопку, которая всё равно приведёт в тупик.
  if (!enabled) return null

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" data-testid="account-login">
        <Link href="/login">
          <LogIn data-icon="inline-start" />
          {t(locale, 'account.signIn')}
        </Link>
      </Button>
    )
  }

  return (
    <form action={signOutAction} className="flex items-center gap-2">
      <span data-testid="account-email" className="max-w-[180px] truncate text-[11px] text-ink-muted">
        {user.email}
      </span>
      <Button type="submit" variant="ghost" size="sm" data-testid="account-signout">
        {t(locale, 'account.signOut')}
      </Button>
    </form>
  )
}
```

Проверить у Base UI `Button`, поддерживается ли `asChild` (в Base UI это чаще `render={<Link />}`). Если `asChild` нет - используем `render={<Link href="/login" />}`; это уточняется на месте по `node_modules/@base-ui/react/button/*.d.ts`, выдумывать проп нельзя.

### Шаг 4.7. `components/StudioShell.tsx`

Две правки, обе аддитивные:

1. В `FULL_WIDTH` добавляется `'projects'`, и в тернар рендера полноэкранных вкладок добавляется ветка `view === 'projects' ? <ProjectsPanel /> : ...`.
2. В шапке, между `LocaleToggle` и `Separator` перед `HistoryControls`, вставляется `<AccountButton />`.

Порядок и вёрстка существующих элементов шапки не меняются, `data-testid="app-header"` остаётся.

### Шаг 4.8. Новые ключи i18n

| ключ | ru | en |
|---|---|---|
| `tabs.projects` | Мои проекты | My projects |
| `account.signIn` | Войти | Sign in |
| `account.signOut` | Выйти | Sign out |
| `projects.title` | Мои проекты | My projects |
| `projects.subtitle` | Проекты в облаке открываются с любого устройства. Локальное автосохранение продолжает работать независимо | Cloud projects open on any device. The local autosave keeps working independently |
| `projects.saveTitle` | Сохранить текущий проект | Save the current project |
| `projects.name` | Название | Name |
| `projects.save` | Сохранить в облако | Save to the cloud |
| `projects.refresh` | Обновить список | Refresh the list |
| `projects.load` | Открыть | Open |
| `projects.delete` | Удалить | Delete |
| `projects.deleteConfirm` | Точно удалить? | Delete for sure? |
| `projects.updatedAt` | Изменён {date} | Updated {date} |
| `projects.empty` | Пока ни одного сохранённого проекта | No saved projects yet |
| `projects.saved` | Проект сохранён | The project is saved |
| `projects.busy` | Секунду | One moment |
| `projects.errorAuth` | Нужно войти в аккаунт | You need to sign in |
| `projects.errorInvalid` | Проект не прошёл проверку и не сохранён | The project failed validation and was not saved |
| `projects.errorNotFound` | Проект не найден, возможно, он уже удалён | The project was not found, it may already be deleted |
| `projects.errorFailed` | Облако не ответило. Попробуйте ещё раз | The cloud did not answer. Try again |
| `aria.projectsPanel` | облачные проекты | cloud projects |

### Шаг 4.9. Тесты задачи 4

`app/actions/projects.test.ts` (моки `@/lib/supabase/server` и `@/lib/supabase/config`):
1. Без пользователя каждая из четырёх функций возвращает `{ ok: false, error: 'unauthenticated' }` и **не** обращается к `from()`.
2. `saveProjectAction('', design)` даёт `invalid` без сетевого вызова.
3. `saveProjectAction('доска', {мусор})` даёт `invalid`, потому что `parseDesign` бросает.
4. Успешный `saveProjectAction` кладёт в `insert` объект с `user_id` из сессии, а не из аргументов.
5. `loadProjectAction('не-uuid')` даёт `invalid`.
6. `loadProjectAction` при `data === null` даёт `notFound`.

`components/ProjectsPanel.test.tsx` (моки `@/app/actions/projects`):
1. Пустой ответ показывает `projects.empty`.
2. Сохранение зовёт `saveProjectAction` с именем из поля и с текущим документом из стора.
3. Клик по `project-load-<id>` вызывает экшен и меняет документ в сторе (`selectDesign(useStudio.getState()).id` совпадает с загруженным) и переключает `view` на `'editor'`.
4. Ошибка `failed` рисует `role="alert"` с русским текстом.
5. Удаление требует двух кликов.

`components/AccountButton.test.tsx`: рендер в обёртке `SessionProvider` с тремя значениями (`enabled:false` -> `null` в DOM, проверяем `container.firstChild === null`; гость -> ссылка `/login`; пользователь -> его почта и кнопка выхода).

**Проверка задачи:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e e2e/templates.spec.ts` (вкладки не разъехались).

**Коммит:** `feat: облачные проекты и кнопка аккаунта в шапке`

---

## Задача 5. Примитивы Popover и Textarea, полифилл ResizeObserver

**Файлы:** `components/ui/popover.tsx` (новый), `components/ui/textarea.tsx` (новый), `vitest.setup.ts`.

Отдельная задача, потому что от неё зависят и обратная связь, и подсказки, и любая ошибка здесь ломает обе фичи разом.

### Шаг 5.1. `vitest.setup.ts`

```ts
import '@testing-library/jest-dom/vitest'

// В jsdom нет ResizeObserver, а позиционирование Base UI (floating-ui) на него
// опирается. Без заглушки падает любой тест с попапом.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}
```

### Шаг 5.2. `components/ui/popover.tsx`

```tsx
"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import * as React from "react"

import { cn } from "@/lib/utils"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({ className, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-sm outline-none transition-colors duration-hover ease-out focus-visible:shadow-focus",
        className
      )}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} collisionPadding={12}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-80 max-w-[calc(100vw-24px)] rounded-lg border border-line-subtle bg-surface-raised p-3.5 text-sm text-ink shadow-lg outline-none",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger, PopoverPrimitive }
```

Проверено по `node_modules/@base-ui/react/popover/index.parts.d.ts`: части называются `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Close`, `Title`, `Description`. `Positioner` принимает `side`, `sideOffset`, `align`, `collisionPadding` (`node_modules/@base-ui/react/internals/useAnchorPositioning.d.ts`).

### Шаг 5.3. `components/ui/textarea.tsx`

Класс тот же, что у `Input`, плюс `min-h-[104px] resize-y py-2 leading-normal`.

### Шаг 5.4. Тест-заглушка

Отдельного теста примитивы не получают: они полностью покрываются тестами задач 6 и 7. Проверка задачи это `pnpm test` (существующие тесты не должны заметить полифилл), `pnpm lint`, `pnpm typecheck`, `pnpm build`.

**Коммит:** `feat: примитивы popover и textarea на Base UI`

---

## Задача 6. Кнопка «Предложить доработку»

**Файлы:** `app/actions/feedback.ts` (новый), `app/actions/feedback.test.ts` (новый), `components/FeedbackButton.tsx` (новый), `components/FeedbackButton.test.tsx` (новый), `components/StudioShell.tsx`, `lib/i18n/ru.ts`, `lib/i18n/en.ts`.

Отличия от донора зафиксированы намеренно: без анимированного робота (простая акцентная кнопка), без скриншота через `html2canvas`, без вложений и приватного бакета, без GitHub issue и Telegram. Собираем текст, маршрут и userAgent.

### Шаг 6.1. `app/actions/feedback.ts`

```ts
'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export const FEEDBACK_MAX_LENGTH = 2000

export type FeedbackResult = { ok: true } | { ok: false; error: 'empty' | 'tooLong' | 'disabled' | 'failed' }

const schema = z.object({
  body: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  route: z.string().max(512).optional(),
  locale: z.enum(['ru', 'en']).optional(),
})

/**
 * Точки расширения на будущее, сознательно не сделанные в фазе 7:
 * скриншот страницы (нужен html2canvas, +200 КБ в бандл), вложение файла
 * (нужен приватный bucket и signed URL), дубль обращения в GitHub issue
 * (Octokit + GITHUB_REPORT_TOKEN) и уведомление в Telegram (Bot API).
 * Все они цепляются здесь же, после успешного insert, и ни один из них не
 * должен ронять ответ пользователю: обращение уже сохранено.
 */
export async function submitFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const raw = typeof input === 'object' && input !== null ? (input as { body?: unknown }).body : ''
    const length = typeof raw === 'string' ? raw.trim().length : 0
    return { ok: false, error: length > FEEDBACK_MAX_LENGTH ? 'tooLong' : 'empty' }
  }

  if (!isSupabaseConfigured()) return { ok: false, error: 'disabled' }

  // userAgent берём из заголовков запроса, а не из присланного клиентом поля:
  // клиенту тут верить не за чем, а заголовок всё равно уже есть.
  const headerList = await headers()
  const userAgent = (headerList.get('user-agent') ?? '').slice(0, 512)

  const sb = await getSupabaseServer()
  const { data } = await sb.auth.getUser()

  const { error } = await sb.from('feedback').insert({
    user_id: data.user?.id ?? null,
    body: parsed.data.body,
    route: parsed.data.route ?? null,
    user_agent: userAgent.length > 0 ? userAgent : null,
    locale: parsed.data.locale ?? null,
  })
  if (error) return { ok: false, error: 'failed' }
  return { ok: true }
}
```

### Шаг 6.2. `components/FeedbackButton.tsx`

Клиентский компонент, монтируется один раз в `StudioShell` (вне `main`, внизу дерева, рядом с `ForkDialog`).

- Плавающая кнопка: `fixed bottom-4 right-4 z-40`, `size="icon"`, вариант `default` (акцентный тил), иконка `MessageSquarePlus` из `lucide-react`, `aria-label={t(locale, 'feedback.open')}`, `data-testid="feedback-button"`.
- Обёрнута в `Popover` из задачи 5, `side="top"`, `align="end"`, ширина попапа `w-[320px]`.
- Внутри: заголовок `feedback.title`, подсказка `feedback.hint`, `Textarea` (`data-testid="feedback-text"`, `maxLength={FEEDBACK_MAX_LENGTH}`), счётчик остатка `data-testid="feedback-counter"` шрифтом `font-mono tabular-nums` (`{used} / 2000`), кнопка `data-testid="feedback-submit"`.
- Кнопка отправки `disabled`, пока текст пустой или идёт отправка (`useTransition`).
- Маршрут собираем в момент отправки: `window.location.pathname + window.location.hash.slice(0, 0)` - **только pathname**, хэш содержит закодированный документ и в базу ему не надо. Пишем `window.location.pathname + window.location.search`.
- Успех: текст очищается, вместо формы показывается `feedback.sent` с `data-testid="feedback-sent"`, попап остаётся открытым.
- Ошибка: `role="alert"`, `data-testid="feedback-error"`, текст по коду (`disabled -> feedback.errorDisabled` и так далее).
- Рядом с заголовком стоит `<HelpHint id="feedback" />` (задача 7), поэтому задача 7 добавляет эту строку последней.

Кнопка показывается **всегда**, в том числе анониму и при ненастроенном Supabase: живая кнопка с честной ошибкой лучше, чем исчезающий элемент, и e2e в CI может проверить открытие попапа без всяких секретов.

### Шаг 6.3. Новые ключи i18n

| ключ | ru | en |
|---|---|---|
| `feedback.open` | Предложить доработку | Suggest an improvement |
| `feedback.title` | Предложить доработку | Suggest an improvement |
| `feedback.hint` | Что мешает или чего не хватает? Пишите конкретно, это читает автор | What gets in the way or is missing? Be specific, the author reads this |
| `feedback.placeholder` | Например: не хватает породы бука в палитре | For example: the palette is missing beech |
| `feedback.submit` | Отправить | Send |
| `feedback.busy` | Отправляем | Sending |
| `feedback.counter` | {used} из {max} | {used} of {max} |
| `feedback.sent` | Спасибо, обращение записано | Thank you, the message is saved |
| `feedback.errorEmpty` | Сначала напишите текст | Write the text first |
| `feedback.errorTooLong` | Слишком длинно, уложитесь в {max} символов | Too long, keep it under {max} characters |
| `feedback.errorDisabled` | Отправка сейчас недоступна | Sending is unavailable right now |
| `feedback.errorFailed` | Не получилось отправить. Попробуйте ещё раз | Could not send it. Try again |

### Шаг 6.4. Тесты задачи 6

`app/actions/feedback.test.ts` (моки `next/headers`, `@/lib/supabase/server`, `@/lib/supabase/config`):
1. Пустой текст -> `error: 'empty'`, `insert` не вызван.
2. 2001 символ -> `error: 'tooLong'`.
3. Ненастроенный Supabase -> `error: 'disabled'`.
4. Аноним: `insert` получает `user_id: null` и `user_agent` из заголовка, а не из тела.
5. Залогиненный: `user_id` равен id из `auth.getUser()`, даже если клиент прислал чужой (проверяем, что поле из входа игнорируется).

`components/FeedbackButton.test.tsx` (мок `@/app/actions/feedback`):
1. Клик по `feedback-button` открывает попап, виден `feedback-text`.
2. Кнопка отправки заблокирована при пустом тексте.
3. Ввод текста и отправка зовут экшен ровно с этим текстом и с `route`.
4. Успех показывает `feedback-sent`.
5. Ошибка `failed` показывает `role="alert"`.
6. Счётчик показывает длину: после ввода 5 символов в `feedback-counter` есть «5».

Портал Base UI рендерится в `document.body`, поэтому в тестах используем `screen.getByTestId`, а не `container.querySelector`.

**Проверка задачи:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

**Коммит:** `feat: кнопка обратной связи с отправкой в Supabase`

---

## Задача 7. Контекстные подсказки HelpHint

**Файлы:** `lib/help/index.ts` (новый), `lib/help/index.test.ts` (новый), `components/ui/help-hint.tsx` (новый), `components/ui/help-hint.test.tsx` (новый), `lib/i18n/ru.ts`, `lib/i18n/en.ts`, плюс точечные вставки в `components/StudioShell.tsx`, `SpeciesPalette.tsx`, `PanelInspector.tsx`, `RowInspector.tsx`, `ComplexityMeter.tsx`, `DiagnosticsPanel.tsx`, `ExportPanel.tsx`, `TemplateGallery.tsx`, `GeneratorPanel.tsx`, `PhotoImport.tsx`, `Board3DPanel.tsx`, `FeedbackButton.tsx`.

От донора берём идею (иконка `CircleHelp`, реестр `id -> запись`, `getHelp` с предупреждением в консоль) и отбрасываем всё остальное: у нас нет варианта `dialog`, нет `ReactNode` в теле, нет внешних ссылок и нет 250 записей про Wildberries. Тело подсказки это ключ словаря, потому что интерфейс двуязычный.

### Шаг 7.1. `lib/help/index.ts`

```ts
import type { MessageKey } from '@/lib/i18n'

export interface HelpEntry {
  readonly id: HelpId
  readonly titleKey: MessageKey
  readonly bodyKey: MessageKey
}

export type HelpId =
  | 'editor'
  | 'palette'
  | 'panels'
  | 'rows'
  | 'meter'
  | 'diagnostics'
  | 'export'
  | 'templates'
  | 'generator'
  | 'evolution'
  | 'photo'
  | 'view3d'
  | 'feedback'

export const HELP_ENTRIES: readonly HelpEntry[] = [
  { id: 'editor', titleKey: 'help.editor.title', bodyKey: 'help.editor.body' },
  { id: 'palette', titleKey: 'help.palette.title', bodyKey: 'help.palette.body' },
  { id: 'panels', titleKey: 'help.panels.title', bodyKey: 'help.panels.body' },
  { id: 'rows', titleKey: 'help.rows.title', bodyKey: 'help.rows.body' },
  { id: 'meter', titleKey: 'help.meter.title', bodyKey: 'help.meter.body' },
  { id: 'diagnostics', titleKey: 'help.diagnostics.title', bodyKey: 'help.diagnostics.body' },
  { id: 'export', titleKey: 'help.export.title', bodyKey: 'help.export.body' },
  { id: 'templates', titleKey: 'help.templates.title', bodyKey: 'help.templates.body' },
  { id: 'generator', titleKey: 'help.generator.title', bodyKey: 'help.generator.body' },
  { id: 'evolution', titleKey: 'help.evolution.title', bodyKey: 'help.evolution.body' },
  { id: 'photo', titleKey: 'help.photo.title', bodyKey: 'help.photo.body' },
  { id: 'view3d', titleKey: 'help.view3d.title', bodyKey: 'help.view3d.body' },
  { id: 'feedback', titleKey: 'help.feedback.title', bodyKey: 'help.feedback.body' },
]

const REGISTRY: ReadonlyMap<HelpId, HelpEntry> = new Map(HELP_ENTRIES.map((entry) => [entry.id, entry]))

/** null означает потерянную подсказку: иконка не рисуется, в консоли предупреждение. */
export function getHelp(id: HelpId): HelpEntry | null {
  const entry = REGISTRY.get(id)
  if (!entry) {
    console.warn(`[help] нет записи для id ${id}`)
    return null
  }
  return entry
}
```

Тип `HelpId` литеральный, поэтому опечатка в `<HelpHint id="pallete" />` ловится на `pnpm typecheck`, а не в рантайме.

### Шаг 7.2. `components/ui/help-hint.tsx`

```tsx
'use client'

import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getHelp, type HelpId } from '@/lib/help'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'
import { cn } from '@/lib/utils'

export function HelpHint({
  id,
  side = 'top',
  className,
}: {
  id: HelpId
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}) {
  const locale = useStudio((s) => s.locale)
  const entry = getHelp(id)
  if (!entry) return null

  const title = t(locale, entry.titleKey)

  return (
    <Popover>
      <PopoverTrigger
        data-testid={`help-${id}`}
        aria-label={t(locale, 'help.aria', { title })}
        className={cn('size-4 shrink-0 text-ink-muted hover:text-ink', className)}
      >
        <CircleHelp className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side={side} data-testid={`help-content-${id}`} className="flex flex-col gap-1.5">
        <p className="font-display text-sm font-semibold text-ink">{title}</p>
        <p className="text-sm leading-normal text-ink-secondary">{t(locale, entry.bodyKey)}</p>
      </PopoverContent>
    </Popover>
  )
}
```

### Шаг 7.3. Куда встают иконки

Двенадцать точек интерфейса плюс одна в форме обратной связи. В брифе точек было названо одиннадцать, здесь их двенадцать: инспекторов у нас два отдельных (щиты и ряды), и объединять их в одну подсказку было бы враньём, это разные этапы работы.

| id | файл | место | `side` |
|---|---|---|---|
| `editor` | `StudioShell.tsx` | в `aria-label`-секции превью доски: над `BoardCanvas` появляется строка с заголовком `board.title` и иконкой | `bottom` |
| `palette` | `SpeciesPalette.tsx` | в `CardHeader`, в существующий `flex items-baseline justify-between`, слева от счётчика | `right` |
| `panels` | `PanelInspector.tsx` | рядом с `CardTitle` (`panels.title`, строка 215) | `top` |
| `rows` | `RowInspector.tsx` | рядом с `CardTitle` (`rows.title`, строка 187) | `top` |
| `meter` | `ComplexityMeter.tsx` | рядом с `CardTitle` (`meter.title`, строка 38) | `left` |
| `diagnostics` | `DiagnosticsPanel.tsx` | рядом с `CardTitle` (`diagnostics.title`, строка 27) | `left` |
| `export` | `ExportPanel.tsx` | рядом с `CardTitle` (`export.title`, строка 74) | `left` |
| `templates` | `TemplateGallery.tsx` | рядом с `<h2>` (`templates.title`, строка 49) | `bottom` |
| `generator` | `GeneratorPanel.tsx` | рядом с `<h2>` (`gen.title`, строка 86) | `bottom` |
| `evolution` | `GeneratorPanel.tsx` | рядом с кнопкой `gen-evolve` (строка 174) | `top` |
| `photo` | `PhotoImport.tsx` | рядом с `<h2>` (`photo.title`, строка 69) | `bottom` |
| `view3d` | `Board3DPanel.tsx` | рядом с заголовком панели (`view3d.title`) | `bottom` |
| `feedback` | `FeedbackButton.tsx` | рядом с заголовком попапа | `left` |

Правило вставки: заголовок и иконка оборачиваются в `<div className="flex items-center gap-1.5">`, существующий `CardTitle`/`h2`/`h3` не переписывается и не разрывается на несколько текстовых узлов. Это важно: `StudioShell.test.tsx` и другие тесты ищут строки через `screen.getByText('Сложность проекта')`, и разбитый текст их сломает.

### Шаг 7.4. Тексты подсказок (полные, ru и en)

`help.aria`: ru «Подсказка: {title}», en «Help: {title}».

**editor**
- ru title: «Рабочее поле»
- ru body: «Здесь видно торец будущей доски: каждая клетка это конец бруска, а не рисунок на поверхности. Клик по клетке красит её выбранной породой. Если новая порода ломает единый щит, студия предложит разделить его надвое и честно посчитает лишнюю склейку.»
- en title: «The work area»
- en body: «This is the end grain of the future board: every cell is the end of a stick, not paint on a surface. Click a cell to paint it with the selected species. If the new species breaks a shared panel, the studio offers to split it in two and counts the extra glue-up honestly.»

**palette**
- ru title: «Палитра пород»
- ru body: «Породы отличаются не только цветом: у каждой своя плотность, цена и усушка, и всё это попадает в расчёт материала и веса. Клик по образцу делает породу активной кистью. Число сверху показывает, сколько пород реально в проекте, и чем их меньше, тем проще закупка.»
- en title: «Species palette»
- en body: «Species differ in more than colour: each has its own density, price and shrinkage, and all of it feeds the material and weight numbers. Click a swatch to make that species the active brush. The counter above shows how many species the design really uses, and fewer species mean an easier lumber run.»

**panels**
- ru title: «Щиты первой склейки»
- ru body: «Щит это набор полос, склеенных по ширине до первого поперечного реза. Из одного щита нарезаются все ряды с одинаковым рисунком, поэтому каждый лишний щит это ещё одна отдельная склейка со струбцинами. Ширина полосы задаётся в миллиметрах и уходит прямо в карту раскроя.»
- en title: «First glue-up panels»
- en body: «A panel is a set of strips glued edge to edge before the first crosscut. All rows with the same pattern are sliced from one panel, so every extra panel means another separate glue-up with clamps. Strip width is set in millimetres and goes straight into the cut list.»

**rows**
- ru title: «Ряды доски»
- ru body: «Ряд это поперечный срез щита: его толщина станет шириной полосы в узоре. Переворот и зеркало позволяют получить шахматку или ёлочку, не заводя новых щитов. Толщина ряда за вычетом пропила и припуска на строгание определяет итоговую длину доски.»
- en title: «Board rows»
- en body: «A row is a crosscut slice of a panel: its thickness becomes the width of a band in the pattern. Flip and mirror give you a checkerboard or a herringbone without adding new panels. Row thickness minus the kerf and the planing allowance sets the final board length.»

**meter**
- ru title: «Сложность проекта»
- ru body: «Склейки и резы показывают настоящую трудоёмкость: узор на двух щитах делается примерно вдвое дольше, чем на одном. Отходы считаются с учётом пропила и припуска на строгание, поэтому цифра ближе к цеховой правде, чем к чистой геометрии. Материал и вес берутся из плотности и цены выбранных пород.»
- en title: «Project complexity»
- en body: «Glue-ups and cuts show the real effort: a pattern on two panels takes roughly twice as long as one on a single panel. Waste accounts for the kerf and the planing allowance, so the number is closer to shop reality than to pure geometry. Material and weight come from the density and price of the chosen species.»

**diagnostics**
- ru title: «Проверки изготовимости»
- ru body: «Здесь собраны причины, по которым доску будет тяжело или невозможно сделать: слишком узкая полоса, щит шире рейсмуса, не хватает припуска на строгание. Каждое замечание указывает на конкретный элемент, а не на проект целиком. Пустой список значит, что геометрия уходит в цех как есть.»
- en title: «Buildability checks»
- en body: «This is the list of reasons the board would be hard or impossible to make: a strip that is too narrow, a panel wider than the planer, not enough planing allowance. Every issue points at a specific element rather than at the design as a whole. An empty list means the geometry goes to the shop as it is.»

**export**
- ru title: «Экспорт»
- ru body: «PNG и SVG нужны, чтобы показать узор заказчику, а CSV и PDF идут в цех. В CSV лежит список деталей с породами и размерами, в PDF собрана пошаговая инструкция: склейка щитов, резы, раскладка рядов, финальная склейка. Размеры выгружаются в тех единицах, что выбраны в шапке.»
- en title: «Export»
- en body: «PNG and SVG are for showing the pattern to a client, while CSV and PDF go to the shop. The CSV holds the part list with species and sizes, the PDF holds the step by step instruction: panel glue-up, crosscuts, row layout, final glue-up. Sizes are exported in the units selected in the header.»

**templates**
- ru title: «Библиотека шаблонов»
- ru body: «Шаблоны это готовые проверенные узоры: шахматка, полоски, ёлочка. Их удобно брать за старт, а породы и размеры потом менять под свой материал. Если в редакторе уже есть правки, студия сначала спросит и только потом заменит проект.»
- en title: «Template library»
- en body: «Templates are ready, proven patterns: checkerboard, stripes, herringbone. They are a good starting point, and you change species and sizes afterwards to fit your stock. If the editor already holds your edits, the studio asks before replacing the design.»

**generator**
- ru title: «Генератор узоров»
- ru body: «Генератор собирает узоры по семействам правил, а не случайными пикселями: каждый вариант остаётся изготовимым щитом из полос. Колонки, ряды и плотность задают крупность рисунка. Понравившийся вариант применяется в редактор одним кликом и дальше правится руками.»
- en title: «Pattern generator»
- en body: «The generator builds patterns from rule families rather than random pixels: every variant stays a buildable panel made of strips. Columns, rows and density set how coarse the pattern is. A variant you like goes into the editor in one click and can be edited by hand from there.»

**evolution**
- ru title: «Эволюция вариантов»
- ru body: «Отметьте звёздочкой то, что нравится, и нажмите эволюцию: следующее поколение соберётся из признаков отмеченных вариантов с небольшими мутациями. Это быстрее перебора, когда направление уже понятно, а деталей ещё нет. Перемешивание, наоборот, начинает поиск с нуля.»
- en title: «Evolving variants»
- en body: «Star the variants you like and press evolve: the next generation is built from their traits with small mutations. That beats blind shuffling once you know the direction but not yet the details. Shuffle, on the contrary, restarts the search from scratch.»

**photo**
- ru title: «Узор из фотографии»
- ru body: «Картинка раскладывается на ограниченное число цветов, и каждый цвет заменяется реальной породой, близкой по тону. Чем меньше цветов и щитов, тем проще будет склеить результат в цеху. Фотография остаётся в браузере и на сервер не уходит.»
- en title: «Pattern from a photo»
- en body: «The image is reduced to a limited number of colours, and each colour is swapped for a real species close in tone. Fewer colours and fewer panels mean an easier glue-up in the shop. The photo stays in your browser and never leaves for a server.»

**view3d**
- ru title: «Превью в 3D»
- ru body: «Сцена показывает доску объёмом: видно, как ряды складываются в толщину и как торцы читаются под углом. Перетаскивание вращает камеру, колесо приближает, правая кнопка сдвигает. На больших узорах сцена показывает часть ячеек, чтобы не ронять слабые видеокарты.»
- en title: «3D preview»
- en body: «The scene shows the board with volume: you see how the rows stack into thickness and how the end grain reads at an angle. Drag to orbit, scroll to zoom, right button to pan. On large patterns the scene shows only part of the cells so weaker graphics cards survive.»

**feedback**
- ru title: «Как писать в обратную связь»
- ru body: «Пишите, что именно мешало и на каком шаге: «после переворота ряда пропала полоса ореха» полезнее, чем «неудобно». Вместе с текстом уходит адрес страницы и версия браузера, файлы и картинки не прикрепляются. Ответа в интерфейсе не будет, обращения читает автор.»
- en title: «How to write feedback»
- en body: «Write what exactly got in the way and at which step: «the walnut strip disappeared after flipping a row» helps far more than «inconvenient». The page address and the browser version go along with the text, no files or images are attached. There is no reply inside the app, the author reads the messages.»

### Шаг 7.5. Тесты задачи 7

`lib/help/index.test.ts`:
1. У каждой записи реестра есть оба ключа в `ru` и в `en` (импортируем словари напрямую и проверяем `toHaveProperty`).
2. `id` записей уникальны.
3. Все значения `HelpId` присутствуют в реестре (сравнение длины списка и множества).
4. `getHelp` на несуществующем id (через приведение типа) возвращает `null` и зовёт `console.warn` (`vi.spyOn`).

`components/ui/help-hint.test.tsx`:
1. Клик по `help-palette` открывает попап, в котором есть русский заголовок «Палитра пород».
2. После `act(() => { useStudio.getState().setLocale('en') })` тот же попап показывает «Species palette».
3. У триггера есть `aria-label`, начинающийся с «Подсказка:».

Проверка запрета длинного тире по новым текстам отдельно не нужна: она уже есть в `lib/i18n/index.test.ts` и покрывает весь словарь.

**Проверка задачи:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e e2e/editor.spec.ts e2e/generate.spec.ts` (иконки не сдвинули существующие элементы).

**Коммит:** `feat: контекстные подсказки по всем панелям студии`

---

## Задача 8. E2E и финальный прогон

**Файлы:** `e2e/help.spec.ts` (новый), `e2e/feedback.spec.ts` (новый), `e2e/auth.spec.ts` (новый, в CI пропускается), `README.md` (раздел про переменные окружения).

### Шаг 8.1. `e2e/help.spec.ts`

Секретов не требует, гоняется в CI всегда.

```ts
import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('подсказка палитры открывается и закрывается', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('help-content-palette')).toBeHidden()
  await page.getByTestId('help-palette').click()
  const content = page.getByTestId('help-content-palette')
  await expect(content).toBeVisible()
  await expect(content).toContainText('плотность')
  await page.keyboard.press('Escape')
  await expect(content).toBeHidden()
})

test('подсказка экспорта говорит про цех', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('help-export').click()
  await expect(page.getByTestId('help-content-export')).toContainText('в цех')
})
```

### Шаг 8.2. `e2e/feedback.spec.ts`

В CI Supabase не настроен, поэтому проверяем только клиентскую часть: попап открывается, кнопка блокируется на пустом тексте, счётчик считает, а отправка даёт понятное сообщение (в CI это будет `feedback.errorDisabled`). Чтобы тест не зависел от того, настроен ли Supabase в окружении запуска, ассертим на факт появления **любого** `role="alert"` или `feedback-sent` после отправки, а не на конкретный текст.

```ts
test('попап обратной связи открывается и валидирует пустой текст', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('feedback-button').click()
  await expect(page.getByTestId('feedback-text')).toBeVisible()
  await expect(page.getByTestId('feedback-submit')).toBeDisabled()
  await page.getByTestId('feedback-text').fill('не хватает бука в палитре')
  await expect(page.getByTestId('feedback-counter')).toContainText('25')
  await expect(page.getByTestId('feedback-submit')).toBeEnabled()
})
```

### Шаг 8.3. `e2e/auth.spec.ts` (локально, в CI пропускается)

Прогонять регистрацию против живого Supabase в CI нельзя: в публичном раннере нет секретов, а каждый прогон плодил бы реальных пользователей в проде и упирался бы в rate limit писем. Поэтому спека помечается флагом окружения и по умолчанию пропускается везде, включая локальный запуск без флага.

```ts
import { expect, test } from '@playwright/test'

const enabled = process.env['E2E_AUTH'] === '1'

test.describe('аккаунт', () => {
  test.skip(!enabled, 'Требует живого Supabase: запускать локально с E2E_AUTH=1')

  test('регистрация нового пользователя и выход', async ({ page }) => {
    const email = `endgrain+${Date.now()}@example.com`
    await page.goto('/register')
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill('очень-длинный-пароль-1')
    await page.getByTestId('auth-submit').click()
    // Либо сразу в студию (подтверждение почты выключено), либо экран «письмо отправлено».
    await expect(
      page.getByTestId('account-email').or(page.getByTestId('auth-confirm-sent')),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('вход существующим пользователем открывает вкладку проектов', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('tab-projects').click()
    await page.getByTestId('projects-save').click()
    await expect(page.getByTestId('projects-error')).toBeHidden()
  })
})
```

Переменные `E2E_AUTH`, `E2E_AUTH_EMAIL`, `E2E_AUTH_PASSWORD` описываем в README, значения нигде не коммитим. `.github/workflows/ci.yml` **не меняется**: спека сама себя пропускает.

### Шаг 8.4. Раздел README

Дописать в README таблицу переменных окружения (только имена и назначение): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (обязательны для аккаунта, без них студия работает локально), `SUPABASE_SERVICE_ROLE_KEY` (в приложении не используется, нужен только для ручного разбора обращений), `E2E_AUTH*` (локальный e2e).

### Шаг 8.5. Финальный прогон

```
pnpm test && pnpm lint && pnpm typecheck && pnpm build && pnpm test:e2e
```

Ожидаемо: 33 существующих e2e + 3 новых зелёные, спека `auth.spec.ts` в статусе skipped.

**Коммит:** `test: e2e для подсказок, обратной связи и локальный смоук аккаунта`

---

## Что делает координатор руками

1. **Дописать в `.env.local`** две строки (значения берутся из существующих `SUPABASE_PROJECT_ID` и `SUPABASE_ANON_KEY`):
   `NEXT_PUBLIC_SUPABASE_URL=https://<SUPABASE_PROJECT_ID>.supabase.co` и `NEXT_PUBLIC_SUPABASE_ANON_KEY=<значение SUPABASE_ANON_KEY>`. Файл в `.gitignore`, в репозиторий не попадает.
2. **Применить миграцию** из задачи 2 через `mcp__supabase__apply_migration` (name `phase7_projects_feedback`). После этого прогнать `mcp__supabase__get_advisors` с типом `security` и убедиться, что нет предупреждений про отключённый RLS.
3. **Проверить настройки Auth в панели Supabase**: включён провайдер Email, решено, требуется ли подтверждение почты (код поддерживает оба варианта), в Redirect URLs добавлены `http://localhost:3000/auth/callback`, `http://127.0.0.1:3100/auth/callback` и продовый `https://<домен>/auth/callback`. Без последнего письмо сброса пароля приведёт в никуда.
4. **Добавить переменные в Vercel** (Production и Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` в Vercel класть **не нужно**: приложение его не читает.
5. **Прогнать локальный смоук аккаунта** один раз: `E2E_AUTH=1 E2E_AUTH_EMAIL=... E2E_AUTH_PASSWORD=... pnpm test:e2e e2e/auth.spec.ts`.
6. Убедиться, что после деплоя первая же анонимная загрузка прода отрабатывает как раньше (это главная проверка того, что фаза 7 никого не заперла).

## Риски

1. **`proxy.ts` вместо `middleware.ts`.** Если исполнитель по привычке создаст `middleware.ts`, Next 16 его либо проигнорирует, либо предупредит о депрекации, а сессия перестанет продлеваться. Симптом плавающий: человека разлогинивает примерно через час. Проверка в задаче 1: файл называется `proxy.ts` и экспортирует `proxy`.
2. **Динамический рендер из-за чтения cookies в root layout.** Все страницы становятся динамическими. Для нашего клиентского приложения цена мала, но если после фазы 7 упадёт Lighthouse на TTFB, откат простой: перенести `SessionProvider` из root layout в отдельный сегмент или заменить на запрос `/api/me` из клиента. Решение сознательное, потому что альтернатива это `setState` в эффекте, запрещённый линтером.
3. **RLS и server actions.** Все запросы идут под anon-ключом с cookie пользователя, service-role не используется вообще. Если кто-то в будущем подключит service-клиент ради удобства, изоляция проектов исчезнет мгновенно и молча. В коде это отмечено комментарием, в плане отдельным пунктом.
4. **Base UI Popover в jsdom.** Без полифилла `ResizeObserver` компонент-тесты подсказок и обратной связи упадут (проверено: jsdom его не даёт). Полифилл вынесен в отдельную задачу 5 именно поэтому.
5. **`asChild` у Base UI Button.** В Base UI композиция чаще делается через `render={...}`, а не `asChild`. Проп проверяется по `.d.ts` на месте, выдумывать нельзя, иначе ссылка «Войти» отрендерится как кнопка без навигации.
6. **Регистрация открытая, спама никто не ограничивает.** На конкурсном сроке это приемлемо, но за пару недель может набежать мусор. Митигация без кода: в панели Supabase включить подтверждение почты и rate limit. Точка расширения на потом: капча или инвайты.
7. **Тексты подсказок пишутся один раз и живут долго.** Если после фазы 7 поменяется поведение панели, подсказка станет враньём быстрее, чем интерфейс. Митигация: тексты хранятся в общем словаре `lib/i18n`, а не в компонентах, и попадают под ту же проверку ключей, что весь остальной интерфейс.
8. **Существующие 33 e2e.** Главный риск фазы это сдвиг вёрстки от иконок подсказок и новой кнопки в шапке. Митигация: иконки вставляются внутрь существующих flex-контейнеров, ни один текстовый узел не разрывается, и после задач 4 и 7 гоняются точечные e2e, а не только юнит-тесты.

## Самопроверка плана

- **Покрытие брифа.** Обвязка Supabase (задача 1), миграция и RLS (2), четыре страницы auth плюс callback (3), облачные проекты и кнопка аккаунта (4), примитивы (5), обратная связь (6), подсказки с реальными текстами (7), тесты (8). Открытая регистрация вместо инвайтов донора учтена. Приложение остаётся публичным: `proxy.ts` не редиректит.
- **Заглушек нет.** Весь SQL приведён целиком и применяется как есть. Код клиентов Supabase, `proxy`, `session`, `callback`, `AuthForm`, обеих server-actions, `HelpHint` и реестра подсказок дан полностью. Схематично, шагами описаны только `ProjectsPanel` и `FeedbackButton` (их разметка длинная и на 90 процентов состоит из повторения уже показанных паттернов формы), но их контракт, все testid и все ключи перечислены поимённо.
- **Согласованность с реальным API репозитория.** `t(locale, key, params)` и `MessageKey` из `lib/i18n/index.ts`, `useStudio`/`selectDesign`/`loadDesign`/`setView` из `lib/store/studio.ts`, `parseDesign` из `lib/persist`, `Design` из `lib/engine`, `Card*` из `components/ui/card.tsx`, `Button` с вариантами `default/outline/ghost/destructive` и размерами `default/sm/icon/icon-sm`. Ни одного выдуманного экспорта.
- **Токены.** Все классы в приведённом коде существуют в `@theme inline` (`bg-surface-raised`, `border-line`, `text-ink-muted`, `text-error-text`, `shadow-focus`, `duration-hover`, `rounded-sm`).
- **Типы.** Учтены `exactOptionalPropertyTypes` (опциональные пропсы `subtitleKey`, `footer` не передаются как `undefined`), `noUncheckedIndexedAccess` (обращений по индексу в новом коде нет), `noUnusedParameters` (пустые методы полифилла без аргументов).
- **Слабое место, которое надо держать в голове при исполнении.** Первичная загрузка списка проектов в `ProjectsPanel` (шаг 4.5) единственное место, где план допускает две реализации в зависимости от того, ругнётся ли `react-hooks/set-state-in-effect`. Запасной вариант описан прямо там же и не требует правки других задач.
