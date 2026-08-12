# Фаза 8: лендинг endgrain.app, подписка на почту, Amazon-блоки, бренд

Репозиторий: `/Users/drtloki/Desktop/Актуальное/Code/MY/endgrain-studio`.
Ветка исполнения: `phase8`, отведённая от `main` **после** мержа `phase7` в `main`. План писался против дерева `phase7`, различий с будущим `main` не ожидается.

Цель фазы: у продукта появляется лицо. Корневой домен `endgrain.app` показывает яркий лендинг с бобром-маскотом и живым показом узоров, `app.endgrain.app` показывает ту же студию, что и сегодня. Плюс три сквозные вещи: подписка на почту через Resend, партнёрские блоки Amazon (инструменты и литература) и бренд-набор (логотип, фавикон, слоганы).

**Студия не должна заметить фазу 8.** Ни один существующий маршрут не меняет поведения, ни один из 43 e2e-сценариев не переписывается ради лендинга (кроме одного теста числа вкладок, см. квирк 7). Человек, который сегодня открывает `/`, завтра на том же URL видит ровно то же самое.

---

## Ключевые находки, без которых фаза будет сделана неправильно

**1. У нас Next 16.3, и `middleware.ts` переименован в `proxy.ts`.**
Файл `proxy.ts` уже лежит в корне и экспортирует функцию `proxy` плюс `config.matcher`. Никакого `middleware.ts` заводить нельзя.

**2. Proxy выполняется РАНЬШЕ, чем `rewrites` из `next.config`.**
Проверено в `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, раздел про порядок маршрутизации:

```
3. Proxy (`rewrites`, `redirects`, etc.)
4. `beforeFiles` (`rewrites`) from `next.config.js`
...
6. `afterFiles` (`rewrites`)
8. `fallback` (`rewrites`)
```

Значит host-роутинг можно делать либо в `proxy.ts`, либо через `next.config` `rewrites` с `has: [{ type: 'host' }]`. Мы выбираем `proxy.ts`, обоснование ниже в задаче 1.

**3. Rewrite из proxy не перезапускает proxy.**
Переписанный запрос идёт сразу в рендер, повторного круга нет. Поэтому рекурсии `/` -> `/landing` -> `/` не будет и защита от неё не нужна.

**4. `'use server'`-файл не может экспортировать константы.**
Зафиксировано в фазе 7 болью: из модуля с `'use server'` наружу разрешены только async-функции. Поэтому лимиты, типы результата подписки и признак «Resend настроен» живут в `lib/subscribe.ts` и `lib/resend/config.ts`, а `app/actions/subscribe.ts` содержит только `export async function`. Тип `SubscribeResult` объявляется в `lib/subscribe.ts` и импортируется в экшен, а не наоборот.

**5. `BoardSvg` это обычный серверный компонент.**
`components/BoardSvg.tsx` не помечен `'use client'`, не держит состояние и не трогает браузерные API. Лендинг рендерит витрину узоров прямо на сервере: `compile(TEMPLATES[i].build())` -> `<BoardSvg model=... locale=... maxPx=220 />`. Никакого клиентского JS ради картинок не появляется, и это главный источник «живости» лендинга бесплатно.

**6. Секретов в CI нет и не будет.**
`.github/workflows/ci.yml` гоняет `typecheck`, `lint`, `test`, `build` и `test:e2e` без единого секрета. Значит `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` и `NEXT_PUBLIC_AMAZON_TAG` обязаны отсутствовать штатно, а не аварийно. Гвард `isResendConfigured()` копирует ровно паттерн `isSupabaseConfigured()` из `lib/supabase/config.ts`, включая комментарий о точечной нотации `process.env.NEXT_PUBLIC_*` (Next инлайнит только статически разобранные обращения, `process.env['NEXT_PUBLIC_...']` в бандл не попадает).

**7. `components/StudioTabs.test.tsx` проверяет ровно 5 вкладок.**
Добавление вкладки «Литература» этот тест уронит. Он правится в задаче 4 осознанно, а не «чинится» задним числом.

**8. `FULL_WIDTH` в `StudioShell.tsx` это список видов на всю ширину.**
Новый вид `books` обязан туда попасть, иначе литература отрендерится в узкой средней колонке трёхколоночной сетки редактора.

**9. Локаль студии живёт в zustand (`lib/store/studio.ts`, `locale: 'ru'`) и не доступна серверу.**
Лендинг серверный, поэтому у него своя механика: cookie `eg-locale`. Корневой `app/layout.tsx` уже асинхронный и уже читает cookies через `getCurrentUser()`, так что чтение ещё одной cookie ничего не удорожает и не ломает статику.

**10. `public/fonts/PTSans-Regular.ttf` и `PTSans-Bold.ttf` уже лежат в репозитории** (заведены под кириллический PDF в фазе 5). Это готовый кириллический шрифт для `ImageResponse` в OG-картинке: тянуть Google Fonts на билд-этапе не нужно.

**11. Playwright с Chromium уже установлен.** Значит скриншоты студии для лендинга и PNG-иконки из SVG делаются существующим инструментом, без `sharp`, `svgexport` и прочих новых зависимостей.

---

## Глобальные ограничения (действуют на каждую задачу)

- **Длинное тире «—» (U+2014) запрещено везде**: код, комментарии, UI-тексты ru и en, JSON партнёрских блоков, коммиты, названия файлов. Только дефис, двоеточие или скобки. Перед коммитом каждой задачи: `grep -rn $'—' app components lib e2e public/brand docs --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' --include='*.svg'` должен дать пусто.
- **Коммиты по-русски**, техтермины английские. Формат существующей истории: `фаза 8, задача N: краткая суть`.
- **Только токены дизайн-системы.** Сырые hex в компонентах запрещены (единственное исключение уже есть в кодовой базе: `speciesHex` для цветов пород). Лендинг набирается теми же `bg-app`, `bg-canvas`, `surface`, `accent`, `ink`, `line`, радиусами и тенями из `app/globals.css`. «Яркость» лендинга берётся композицией, масштабом и движением, а не новой палитрой.
- **`data-testid` обязателен** на каждом новом интерактивном или проверяемом элементе. Тексты в тестах ищем по testid, не по копирайту (кроме двух-трёх смысловых `toContainText`, как это уже сделано в `help.spec.ts`).
- **43 существующих e2e остаются зелёными** без правок. Перед задачей 1 зафиксировать базовую строку: `pnpm test:e2e 2>&1 | tail -5`, записать число passed в отчёт задачи. Любое расхождение после = регресс, а не «плавающий тест».
- **Секреты только в env**, значения никогда не попадают в репозиторий, план и коммиты. В коде и документации фигурируют только имена переменных.
- **Ключевая проверка сборки после каждой задачи** (гейт): `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. E2E прогоняется в задачах 3, 4 и 6.
- **Никаких новых рантайм-зависимостей.** Resend дёргается голым `fetch` по REST, не SDK. Анимации только CSS. Партнёрские данные это статический JSON в репозитории.
- **Amazon: ничего скрейпленного.** Никаких картинок с амазоновских CDN, никаких рейтингов, никаких цен числом. Только собственный редакционный текст, диапазон цены обычным текстом и ссылка. Это условие лицензии PA-API и оно не обсуждается до получения доступа к API.

---

## Решение по host-роутингу: один проект, rewrite в `proxy.ts`

**Выбрано: лендинг живёт в том же Next-проекте `endgrain-studio`, в route-группе `app/(landing)/`, а домен разводится по заголовку `Host` в `proxy.ts`.**

Почему не отдельный Vercel-проект:

- Токены, шрифты, `lib/i18n`, `BoardSvg`, `TEMPLATES` и движок нужны лендингу целиком. Отдельный проект означает либо копипаст палитры и словарей (два источника правды, расхождение через неделю), либо вынос в пакет и превращение репозитория в монорепо ради одной страницы. Обе цены выше выгоды.
- Живая витрина узоров на лендинге это `compile(TEMPLATES[i].build())`. В отдельном проекте её пришлось бы заменить статическими картинками, то есть убить главную фишку лендинга.
- Один деплой, один CI, один набор env, один прогон e2e. Дедлайн конкурса 17 августа, второй пайплайн это чистый расход.
- Лендинг это 5-7 серверных секций без клиентского состояния. Он не утяжеляет бандл студии: route-группы дают раздельные бандлы по маршрутам, а лендинг вообще почти без `'use client'`.

Почему `proxy.ts`, а не `has: [{ type: 'host' }]` в `next.config`:

- В `proxy.ts` уже лежит вся логика запроса (обновление сессии Supabase). Разнести маршрутизацию по двум файлам значит гарантированно потом искать, где же оно решилось.
- Нужен не только rewrite, но и redirect: глубокие маршруты студии (`/login`, `/reset-password`, `/auth/callback`), пришедшие на корневой домен, должны уезжать на `app.endgrain.app`. `redirects()` в конфиге умеет `has`, но комбинация «rewrite для одного пути + redirect для остальных на том же хосте» в конфиге читается заметно хуже, чем восемь строк в proxy.
- На лендинге сессия Supabase не нужна вообще. В proxy мы её просто не запрашиваем, экономя поход в сеть на каждом хите главной страницы. Конфиг такой возможности не даёт: rewrite сработает, а proxy всё равно отработает раньше и сходит за сессией.

Конкретная схема (см. код в задаче 1):

| Хост | Путь | Что делает proxy |
|---|---|---|
| `endgrain.app`, `www.endgrain.app` | `/` | `NextResponse.rewrite('/landing')`, без обращения к Supabase |
| `endgrain.app`, `www.endgrain.app` | `/landing` | пропускает как есть (canonical-путь, чтобы Vercel-превью и e2e могли открыть лендинг напрямую) |
| `endgrain.app`, `www.endgrain.app` | любой другой | `NextResponse.redirect('https://app.endgrain.app' + path + search, 307)` |
| `app.endgrain.app` | `/landing` | `NextResponse.redirect('https://endgrain.app/landing', 308)`, чтобы не было двух индексируемых копий |
| `app.endgrain.app` | всё остальное | `updateSession(request)`, как сегодня |
| любой незнакомый хост (`localhost`, `127.0.0.1`, `*.vercel.app`) | всё | `updateSession(request)`, как сегодня; лендинг доступен по `/landing` |

Последняя строка это то, что сохраняет 43 e2e зелёными: Playwright ходит на `http://127.0.0.1:3100`, роль хоста там `unknown`, `/` остаётся студией.

Настройка на стороне Vercel (ручные шаги владельца, задача 6 их только проверяет):

1. В проекте `endgrain-studio` (`prj_yQgagc9DZ49NTUTALjylBFzEckGF`) вкладка Settings -> Domains добавить три домена: `endgrain.app`, `www.endgrain.app`, `app.endgrain.app`. Все три указывают на одну и ту же ветку `main` (Production).
2. `www.endgrain.app` в Vercel пометить как Redirect to `endgrain.app` (301). Тогда код про `www` не отработает ни разу, но остаётся страховкой, если редирект отключат.
3. В Porkbun DNS: `A @ 76.76.21.21` и `CNAME www cname.vercel-dns.com`, `CNAME app cname.vercel-dns.com`. Точные значения Vercel показывает в диалоге добавления домена, брать оттуда, а не из этого плана.
4. Переменные окружения (Production и Preview): `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `NEXT_PUBLIC_AMAZON_TAG`, `NEXT_PUBLIC_APP_ORIGIN=https://app.endgrain.app`, `NEXT_PUBLIC_SITE_ORIGIN=https://endgrain.app`.

---

## Задача 1: host-роутинг и скелет лендинга

**Ветка:** `phase8`. **Коммит:** `фаза 8, задача 1: host-роутинг и скелет лендинга`.

### Шаг 1.1. Модуль ролей хоста

Новый файл `lib/routing/host.ts`:

```ts
/**
 * Один продукт живёт на двух доменах: корневой endgrain.app показывает лендинг,
 * app.endgrain.app показывает студию. Разводит их proxy.ts по заголовку Host,
 * и это единственное место, где имена доменов записаны буквами.
 */
export const SITE_ORIGIN: string = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://endgrain.app'
export const APP_ORIGIN: string = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://app.endgrain.app'

/** Canonical-путь лендинга внутри приложения. Корень сайта переписывается сюда. */
export const LANDING_PATH = '/landing'

const SITE_HOSTS: readonly string[] = ['endgrain.app', 'www.endgrain.app']
const APP_HOSTS: readonly string[] = ['app.endgrain.app']

export type HostRole = 'site' | 'app' | 'unknown'

/**
 * unknown это localhost, 127.0.0.1 и превью-домены *.vercel.app. Для них ничего
 * не разводится: приложение ведёт себя ровно как до фазы 8, а лендинг открывается
 * по прямому пути /landing. Без этого 43 существующих e2e (они ходят на 127.0.0.1)
 * увидели бы на / лендинг вместо студии.
 */
export function hostRole(hostHeader: string | null): HostRole {
  if (!hostHeader) return 'unknown'
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? ''
  if (SITE_HOSTS.includes(host)) return 'site'
  if (APP_HOSTS.includes(host)) return 'app'
  return 'unknown'
}
```

Тест `lib/routing/host.test.ts`: `hostRole('endgrain.app') === 'site'`, `hostRole('ENDGRAIN.APP:443') === 'site'`, `hostRole('www.endgrain.app') === 'site'`, `hostRole('app.endgrain.app') === 'app'`, `hostRole('127.0.0.1:3100') === 'unknown'`, `hostRole('endgrain-studio.vercel.app') === 'unknown'`, `hostRole(null) === 'unknown'`, и что подделка `evil-endgrain.app` даёт `unknown` (проверка на точное совпадение, а не `endsWith`).

### Шаг 1.2. Переписать `proxy.ts`

```ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { APP_ORIGIN, LANDING_PATH, SITE_ORIGIN, hostRole } from '@/lib/routing/host'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const role = hostRole(request.headers.get('host'))
  const path = request.nextUrl.pathname

  if (role === 'site') {
    // Лендинг статичен и анонимен: за сессией Supabase не ходим вовсе.
    if (path === '/') return NextResponse.rewrite(new URL(LANDING_PATH, request.url))
    if (path === LANDING_PATH) return NextResponse.next()
    // Всё остальное на корневом домене это студия: отправляем на поддомен,
    // сохраняя путь и query (например ссылку восстановления пароля из письма).
    return NextResponse.redirect(new URL(path + request.nextUrl.search, APP_ORIGIN), 307)
  }

  // Одна страница по двум адресам это две записи в индексе: канон у корневого домена.
  if (role === 'app' && path === LANDING_PATH) {
    return NextResponse.redirect(new URL(LANDING_PATH, SITE_ORIGIN), 308)
  }

  return updateSession(request)
}

// Матчер исключает статику и картинки: без него proxy отрабатывает даже на
// _next/static и превращает раздачу ассетов в поход за сессией.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
}
```

Матчер расширен на `ico|txt|xml`: в задаче 5 появятся `robots.txt`, `sitemap.xml` и иконки, гонять их через host-логику незачем.

### Шаг 1.3. Route-группа лендинга

`app/(landing)/landing/page.tsx` и `app/(landing)/layout.tsx`.

Группа `(landing)` нужна, чтобы лендинг имел свой layout (без `SessionProvider`-зависимой обвязки, со своей метаданной и своим фоном), но остался внутри корневого `app/layout.tsx` со шрифтами и `globals.css`.

`app/(landing)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-app">{children}</div>
}
```

`app/(landing)/landing/page.tsx` в этой задаче содержит только каркас: шапку, пустой `<main>` с якорями секций и подвал-заглушку. Наполнение в задаче 2.

```tsx
import type { Metadata } from 'next'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { getLandingLocale } from '@/lib/landing/locale'
import { t } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Endgrain Studio' } // расширяется в задаче 5

export default async function LandingPage() {
  const locale = await getLandingLocale()
  return (
    <>
      <LandingHeader locale={locale} />
      <main data-testid="landing" className="flex flex-col">
        <p className="px-6 py-24 text-center font-display text-3xl">{t(locale, 'landing.hero.title')}</p>
      </main>
      <LandingFooter locale={locale} />
    </>
  )
}
```

### Шаг 1.4. Серверная локаль лендинга

`lib/landing/locale.ts`:

```ts
import { cookies } from 'next/headers'
import type { Locale } from '@/lib/i18n'

/**
 * Лендинг рендерится на сервере, а локаль студии живёт в zustand на клиенте и
 * серверу недоступна. Поэтому у лендинга своя cookie: SSR получается
 * детерминированным (никакого мигания языка), поисковик видит финальный текст,
 * а e2e просто выставляет cookie перед переходом.
 */
export const LOCALE_COOKIE = 'eg-locale'

export async function getLandingLocale(): Promise<Locale> {
  const store = await cookies()
  return store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ru'
}
```

Экшен переключения `app/actions/locale.ts`:

```ts
'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE } from '@/lib/landing/locale'
import { LANDING_PATH } from '@/lib/routing/host'

export async function setLandingLocaleAction(next: string): Promise<void> {
  const value = next === 'en' ? 'en' : 'ru'
  const store = await cookies()
  store.set(LOCALE_COOKIE, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath(LANDING_PATH)
}
```

`components/landing/LandingLocaleToggle.tsx` (клиентский, повторяет вид `components/LocaleToggle.tsx`, но дёргает экшен внутри `useTransition`, testid `landing-locale-ru` / `landing-locale-en`).

Корневой `app/layout.tsx`: `lang` перестаёт быть жёстко `"ru"`, читается из той же cookie:

```tsx
const lang = await getLandingLocale()
...
<html lang={lang} ...>
```

Комментарий в коде: студия дополнительно правит `document.documentElement.lang` на клиенте (`LocaleToggle`), серверное значение это стартовое.

### Шаг 1.5. Шапка и подвал лендинга

`components/landing/LandingHeader.tsx` (серверный): бобровая марка (в задаче 1 ещё квадрат-заглушка `E`, как в студии; в задаче 5 меняется на бобра), название, слоган мелким шрифтом, `LandingLocaleToggle`, кнопка «Открыть студию» -> `APP_ORIGIN` с `data-testid="landing-cta-header"`.

`components/landing/LandingFooter.tsx` (серверный): три колонки, ссылки на студию, `mailto:` обратной связи, строка Amazon-дисклеймера (заглушка до задачи 4), строка про приватность, копирайт. testid `landing-footer`.

### Шаг 1.6. Ключи i18n каркаса

В `lib/i18n/ru.ts` и `en.ts` добавить (важно: `en.ts` типизирован как `Record<keyof typeof ru, string>`, поэтому любой ключ обязан появиться в обоих файлах, иначе `pnpm typecheck` красный):

```
'landing.hero.title'      ru: 'Пилим как надо'            en: 'Rip it right'
'landing.nav.openApp'     ru: 'Открыть студию'            en: 'Open the studio'
'landing.locale.aria'     ru: 'Язык лендинга'             en: 'Landing language'
```

### Гейт задачи 1

`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, плюс ручная проверка: `pnpm dev`, открыть `http://localhost:3000/` (студия), `http://localhost:3000/landing` (каркас лендинга), и с подменой хоста `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: endgrain.app' http://localhost:3000/login` -> ожидается `307 https://app.endgrain.app/login`.

---

## Задача 2: секции лендинга и анимации

**Коммит:** `фаза 8, задача 2: секции лендинга, витрина узоров и анимации`.

### Шаг 2.1. CSS-слой анимаций

В конец `app/globals.css` добавить `@layer utilities` с четырьмя вещами и одним выключателем:

```css
@layer utilities {
  /* Бегущая лента узоров. Двигаем -50%, потому что список дублируется ровно
     дважды: на стыке рисунок совпадает и шва не видно. */
  @keyframes eg-marquee {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  .eg-marquee-track {
    display: flex;
    width: max-content;
    animation: eg-marquee var(--eg-marquee-dur, 60s) linear infinite;
  }
  .eg-marquee-reverse { animation-direction: reverse; }
  .eg-marquee:hover .eg-marquee-track { animation-play-state: paused; }

  /* Наклон карточки под курсором: только transform и тень, никаких сдвигов
     соседей. Длительность из токена --dur-panel. */
  .eg-tilt {
    transition: transform var(--dur-panel) var(--ease-out), box-shadow var(--dur-panel) var(--ease-out);
    will-change: transform;
  }
  .eg-tilt:hover {
    transform: perspective(800px) rotateX(2.5deg) rotateY(-2.5deg) translateY(-4px);
    box-shadow: var(--shadow-lg);
  }

  /* Медленное покачивание маскота. Амплитуда намеренно маленькая:
     это фон настроения, а не аттракцион. */
  @keyframes eg-bob {
    0%, 100% { transform: translateY(0) rotate(-1deg); }
    50%      { transform: translateY(-10px) rotate(1deg); }
  }
  .eg-bob { animation: eg-bob 6s ease-in-out infinite; }

  /* Проявление секции при прокрутке. Scroll-driven animations есть не везде,
     поэтому базовое состояние видимое, а анимация только добавляется сверху. */
  @supports (animation-timeline: view()) {
    .eg-reveal {
      animation: eg-fade-up linear both;
      animation-timeline: view();
      animation-range: entry 10% cover 32%;
    }
    @keyframes eg-fade-up {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: none; }
    }
  }

  /* Один выключатель на всё. Без него лендинг нарушает prefers-reduced-motion. */
  @media (prefers-reduced-motion: reduce) {
    .eg-marquee-track, .eg-bob, .eg-reveal { animation: none !important; }
    .eg-tilt:hover { transform: none; }
  }
}
```

### Шаг 2.2. Витрина узоров (главная фишка)

`components/landing/PatternMarquee.tsx`, серверный компонент:

```tsx
import { compile } from '@/lib/engine'
import { TEMPLATES } from '@/lib/designs/templates'
import { BoardSvg } from '@/components/BoardSvg'
import type { Locale } from '@/lib/i18n'

/**
 * Витрина не картинки, а живой рендер: каждая доска компилируется движком из того
 * же шаблона, который откроется в студии по клику. Считается на сервере при сборке
 * страницы, поэтому в браузер уезжает готовый SVG и ноль килобайт JS.
 */
const ROW_A = TEMPLATES.slice(0, 8)
const ROW_B = TEMPLATES.slice(8, 16)

function Row({ ids, locale, reverse, testId }: { ids: typeof ROW_A; locale: Locale; reverse?: boolean; testId: string }) {
  const items = [...ids, ...ids] // дубль для бесшовной петли
  return (
    <div className="eg-marquee overflow-hidden" data-testid={testId}>
      <div className={reverse ? 'eg-marquee-track eg-marquee-reverse' : 'eg-marquee-track'}>
        {items.map((tpl, i) => (
          <a
            key={`${tpl.id}-${i}`}
            href={`${APP_ORIGIN}/?tpl=${tpl.id}`}
            className="eg-tilt mx-3 block shrink-0 rounded-lg bg-surface p-3 shadow-sm"
            aria-hidden={i >= ids.length}
            tabIndex={i >= ids.length ? -1 : undefined}
          >
            <BoardSvg model={compile(tpl.build())} locale={locale} maxPx={200} />
          </a>
        ))}
      </div>
    </div>
  )
}
```

Дубликаты помечены `aria-hidden` и убраны из таб-порядка: без этого скринридер и клавиатура получают каждый шаблон дважды.

Скорость лент разная (`style={{ ['--eg-marquee-dur' as string]: '72s' }}` и `'54s'`), направления встречные. Секция на `bg-canvas`, с мягкими градиентными масками по краям через `mask-image: linear-gradient(to right, transparent, black 6%, black 94%, transparent)`.

**Уточнение по ссылке `?tpl=`:** параметр применения шаблона из URL в студии сегодня не поддержан. Чтобы не тащить фичу, ссылки витрины ведут просто на `APP_ORIGIN` (без query), а `?tpl=` остаётся комментарием-заделом в коде. Так лендинг не обещает того, чего студия не умеет.

### Шаг 2.3. Герой

`components/landing/LandingHero.tsx`:

- Двухколоночная сетка, на мобиле одна колонка: слева текст, справа бобёр `/brand/beaver.svg` в `<img>` 380x380 с классом `eg-bob` (файл появляется в задаче 5; до неё держим `public/brand/.gitkeep` и `<img>` с `onError`-безопасным поведением, то есть просто пустой alt-блок).
- H1: слоган, `font-display`, `clamp(40px, 7vw, 84px)`, `tracking-tight`. Слово-акцент («надо» / «right») в `text-accent`.
- Подзаголовок: `landing.hero.subtitle`, `text-ink-secondary`, `max-w-[52ch]`.
- Две кнопки: primary «Открыть студию бесплатно» -> `APP_ORIGIN` (`data-testid="landing-cta-hero"`), secondary «Посмотреть узоры» -> `#patterns`.
- Строка доверия под кнопками: «Без регистрации. Работает в браузере. Проект сохраняется локально.»
- Фон секции: `bg-app` плюс декоративная сетка из полос-пород (три-четыре `<div>` с `speciesHex`-цветами, `opacity-[0.07]`, `rotate-12`, `pointer-events-none`, `aria-hidden`). Это и даёт «небанальность» без выхода за палитру.

### Шаг 2.4. Сетка возможностей

`components/landing/FeatureGrid.tsx`, шесть карточек `eg-tilt eg-reveal`, каждая с иконкой `lucide-react` (16-20px, stroke 1.6, как в дизайн-системе), заголовком `font-display text-lg` и текстом `text-[13px] text-ink-secondary`:

| Ключ | Иконка | RU заголовок | EN заголовок |
|---|---|---|---|
| `f3d` | `Box` | Превью в 3D | 3D preview |
| `fphoto` | `ImageDown` | Фото в узор | Photo to pattern |
| `fpdf` | `FileText` | PDF с раскроем | Cutting plan PDF |
| `fgen` | `Sparkles` | Генератор и эволюция | Generator and evolution |
| `fcost` | `Calculator` | Материал и себестоимость | Lumber and cost |
| `funits` | `Ruler` | Миллиметры и дюймы | Millimetres and inches |

### Шаг 2.5. Как это работает

`components/landing/HowItWorks.tsx`: четыре шага нумерованной лентой, номер моноширинным `metric` 28px в кружке `bg-accent-soft text-accent`, соединительная линия `border-line` между шагами на десктопе.

### Шаг 2.6. Полоса скриншотов

`components/landing/ShotStrip.tsx`: горизонтальный скролл-снап (`overflow-x-auto snap-x snap-mandatory`, на десктопе просто flex), пять `<img>` из `public/landing/shots/*.png` с явными `width`/`height` (чтобы не было сдвига макета) и `loading="lazy"`.

Скриншоты снимаются один раз существующим Playwright. Новый файл `e2e/shots.spec.ts`, полностью пропускаемый без флага (тот же приём, что уже применён к `e2e/auth.spec.ts` с `E2E_AUTH`):

```ts
import { expect, test } from '@playwright/test'

const enabled = process.env['SHOTS'] === '1'
test.skip(!enabled, 'Съёмка скриншотов лендинга: pnpm shots')

const VIEWS = [
  { tab: 'editor', marker: 'board-canvas', file: 'editor.png' },
  { tab: 'templates', marker: 'template-gallery', file: 'templates.png' },
  { tab: 'generate', marker: 'generator-panel', file: 'generator.png' },
  { tab: 'photo', marker: 'photo-panel', file: 'photo.png' },
  { tab: 'view3d', marker: 'view3d', file: 'view3d.png' },
] as const
```

Скрипт в `package.json`: `"shots": "SHOTS=1 playwright test e2e/shots.spec.ts"`. PNG-файлы коммитятся. В CI спека пропускается и на 43 теста не влияет.

### Шаг 2.7. Полный копирайт лендинга

Все строки идут в `lib/i18n/ru.ts` и `en.ts` (парность обязательна). Ниже финальные тексты, менять при реализации нельзя без причины.

```
'landing.hero.title'        ru: 'Пилим как надо'
                            en: 'Rip it right'
'landing.hero.accent'       ru: 'надо'
                            en: 'right'
'landing.hero.subtitle'     ru: 'Студия торцевых разделочных досок: придумываете узор, а получаете схему распила, список деталей, расход материала и честную себестоимость. Не рисовалка, а инструмент цеха.'
                            en: 'A studio for end-grain cutting boards: you design the pattern, you get the cutting plan, the part list, the lumber you need and an honest cost. Not a drawing toy, a shop tool.'
'landing.hero.ctaPrimary'   ru: 'Открыть студию, это бесплатно'
                            en: 'Open the studio, it is free'
'landing.hero.ctaSecondary' ru: 'Посмотреть узоры'
                            en: 'See the patterns'
'landing.hero.trust'        ru: 'Без регистрации. Работает прямо в браузере. Проект остаётся у вас.'
                            en: 'No signup. Runs in the browser. The project stays yours.'
'landing.hero.mascotAlt'    ru: 'Бобёр в кепке, маскот Endgrain Studio'
                            en: 'Beaver in a flat cap, the Endgrain Studio mascot'

'landing.patterns.title'    ru: 'Шестнадцать узоров уже внутри'
                            en: 'Sixteen patterns already inside'
'landing.patterns.body'     ru: 'Шахматка, кирпич, полоски, диагонали, рамка, инкрустация. Каждая доска здесь нарисована тем же движком, который потом посчитает вам распил.'
                            en: 'Checkerboard, brick, stripes, diagonals, frame, inlay. Every board here is drawn by the same engine that will later work out your cuts.'

'landing.features.title'    ru: 'Что студия делает за вас'
                            en: 'What the studio does for you'
'landing.features.f3d.title'   ru: 'Превью в 3D'          en: '3D preview'
'landing.features.f3d.body'    ru: 'Доска в объёме до того, как вы купили первую доску ореха. Видно, как ряды складываются в толщину и как торец читается под углом.'
                               en: 'The board in volume before you buy the first walnut plank. You see how rows stack into thickness and how the end grain reads at an angle.'
'landing.features.fphoto.title' ru: 'Фото в узор'          en: 'Photo to pattern'
'landing.features.fphoto.body'  ru: 'Бросьте картинку: она раскладывается на ограниченное число цветов, и каждый становится реальной породой. Фото не уходит на сервер.'
                                en: 'Drop an image: it is reduced to a few colours and each one becomes a real species. The photo never leaves your browser.'
'landing.features.fpdf.title'   ru: 'PDF с раскроем'       en: 'Cutting plan PDF'
'landing.features.fpdf.body'    ru: 'Пошаговая инструкция для цеха: склейка щитов, поперечные резы, раскладка рядов, финальная переклейка. С кириллицей и в ваших единицах.'
                                en: 'A step by step shop instruction: panel glue-up, crosscuts, row layout, final glue-up. In your units, ready to print.'
'landing.features.fgen.title'   ru: 'Генератор и эволюция' en: 'Generator and evolution'
'landing.features.fgen.body'    ru: 'Девять вариантов за клик, по семействам правил, а не случайными пикселями. Отметьте удачные звёздочкой, и следующее поколение соберётся из них.'
                                en: 'Nine variants per click, built from rule families rather than random pixels. Star the good ones and the next generation grows out of them.'
'landing.features.fcost.title'  ru: 'Материал и себестоимость' en: 'Lumber and cost'
'landing.features.fcost.body'   ru: 'Пропил, припуск на строгание, отходы, вес и цена по каждой породе. Цифра ближе к цеховой правде, чем к чистой геометрии.'
                                en: 'Kerf, planing allowance, waste, weight and price per species. The number is closer to shop reality than to pure geometry.'
'landing.features.funits.title' ru: 'Миллиметры и дюймы'   en: 'Millimetres and inches'
'landing.features.funits.body'  ru: 'Переключатель в шапке меняет и интерфейс, и экспорт. Внутри всё всегда в миллиметрах, дюймы это только представление.'
                                en: 'One switch changes both the interface and the exports. Internally everything stays in millimetres, inches are just a view.'

'landing.how.title'         ru: 'Четыре шага до доски'
                            en: 'Four steps to a board'
'landing.how.s1.title'      ru: 'Возьмите старт'        en: 'Pick a start'
'landing.how.s1.body'       ru: 'Шаблон, генератор или фотография. Или чистый холст, если узор уже в голове.'
                            en: 'A template, the generator or a photo. Or a blank canvas if the pattern is already in your head.'
'landing.how.s2.title'      ru: 'Правьте руками'        en: 'Edit by hand'
'landing.how.s2.body'       ru: 'Клик по клетке красит её породой. Студия сама скажет, если узор перестал быть изготовимым.'
                            en: 'Click a cell to paint it with a species. The studio speaks up as soon as the pattern stops being buildable.'
'landing.how.s3.title'      ru: 'Проверьте цифры'       en: 'Check the numbers'
'landing.how.s3.body'       ru: 'Склейки, резы, отходы, вес, себестоимость. Всё пересчитывается на каждое движение кисти.'
                            en: 'Glue-ups, cuts, waste, weight, cost. Everything recalculates on every brush stroke.'
'landing.how.s4.title'      ru: 'Забирайте в цех'       en: 'Take it to the shop'
'landing.how.s4.body'       ru: 'PNG и SVG заказчику, CSV и PDF на верстак. Дальше дело струбцин.'
                            en: 'PNG and SVG for the client, CSV and PDF for the bench. The clamps take it from there.'

'landing.shots.title'       ru: 'Как выглядит внутри'
                            en: 'What it looks like inside'

'landing.finalCta.title'    ru: 'Доска не сделается сама'
                            en: 'The board will not glue itself'
'landing.finalCta.body'     ru: 'Открывайте студию и соберите первый узор за пять минут. Регистрация нужна только чтобы хранить проекты между устройствами.'
                            en: 'Open the studio and put together your first pattern in five minutes. An account is only needed to sync projects between devices.'

'landing.footer.product'    ru: 'Продукт'       en: 'Product'
'landing.footer.openApp'    ru: 'Студия'        en: 'Studio'
'landing.footer.contact'    ru: 'Связаться'     en: 'Get in touch'
'landing.footer.feedback'   ru: 'Написать автору'  en: 'Write to the author'
'landing.footer.privacyTitle' ru: 'Данные'      en: 'Data'
'landing.footer.privacy'    ru: 'Проект хранится в вашем браузере. Почта нужна только для писем о студии, отписка в один клик. Фотографии на сервер не уходят.'
                            en: 'Your project lives in your browser. Email is used only for studio news, one click to unsubscribe. Photos never leave your device.'
'landing.footer.rights'     ru: 'Endgrain Studio, {year}'
                            en: 'Endgrain Studio, {year}'
```

### Гейт задачи 2

Стандартный гейт плюс ручной осмотр на 1280 и 375 px, и проверка `prefers-reduced-motion`: в DevTools включить эмуляцию, убедиться, что лента стоит, бобёр не качается.

---

## Задача 3: подписка на почту через Resend

**Коммит:** `фаза 8, задача 3: подписка на рассылку через Resend`.

### Шаг 3.1. Конфиг и гвард

`lib/resend/config.ts`:

```ts
/**
 * Гвард ровно по образцу lib/supabase/config.ts: без ключей приложение работает,
 * форма рендерится, а отправка честно отвечает «почта пока не подключена».
 * В CI секретов нет, и это штатное состояние, а не поломка.
 * Обе переменные серверные: ключ Resend в клиентский бандл попасть не должен,
 * поэтому никакого NEXT_PUBLIC_ у них нет и быть не может.
 */
export const RESEND_API_KEY: string = process.env['RESEND_API_KEY'] ?? ''
export const RESEND_AUDIENCE_ID: string = process.env['RESEND_AUDIENCE_ID'] ?? ''

export function isResendConfigured(): boolean {
  return RESEND_API_KEY.length > 0 && RESEND_AUDIENCE_ID.length > 0
}
```

Индексная нотация здесь корректна: в отличие от `NEXT_PUBLIC_*`, серверные переменные Next не инлайнит статическим разбором, и `process.env['X']` требуется правилом `noPropertyAccessFromIndexSignature` в `tsconfig` (проверить фактическую настройку и привести к тому же виду, что в `lib/flags.ts`, где уже написано `process.env['NEXT_PUBLIC_PRO_UNLOCK']`; там это работает потому, что переменная всё равно попадает в бандл через `env` секцию сборки, но для нового кода на клиенте нотацию надо брать точечную, как в `lib/supabase/config.ts`).

### Шаг 3.2. Типы и валидация вне `'use server'`

`lib/subscribe.ts`:

```ts
import { z } from 'zod'

export const EMAIL_MAX_LENGTH = 254

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(EMAIL_MAX_LENGTH).email(),
  locale: z.enum(['ru', 'en']).optional(),
  // Ловушка для ботов: настоящий человек это поле не видит и не заполняет.
  company: z.string().max(0).optional(),
})

export type SubscribeError = 'invalid' | 'disabled' | 'failed' | 'bot'
export type SubscribeResult = { ok: true; already: boolean } | { ok: false; error: SubscribeError }
```

### Шаг 3.3. Серверный экшен

`app/actions/subscribe.ts`:

```ts
'use server'

import { RESEND_API_KEY, RESEND_AUDIENCE_ID, isResendConfigured } from '@/lib/resend/config'
import { subscribeSchema, type SubscribeResult } from '@/lib/subscribe'

/**
 * Resend REST напрямую, без SDK: один POST не стоит 300 КБ зависимости.
 * Аудитория бесплатного тарифа держит 1000 контактов, этого хватит надолго.
 * Дубль адреса Resend возвращает как 200 с уже существующим контактом, поэтому
 * повторная подписка для пользователя выглядит успехом, а не ошибкой.
 */
export async function subscribeAction(input: unknown): Promise<SubscribeResult> {
  const parsed = subscribeSchema.safeParse(input)
  if (!parsed.success) {
    const company = typeof input === 'object' && input !== null ? (input as { company?: unknown }).company : ''
    if (typeof company === 'string' && company.length > 0) return { ok: false, error: 'bot' }
    return { ok: false, error: 'invalid' }
  }

  if (!isResendConfigured()) return { ok: false, error: 'disabled' }

  try {
    const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: parsed.data.email, unsubscribed: false }),
      // Ответ Resend кэшировать нечего и опасно.
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: 'failed' }
    const body = (await res.json()) as { id?: string }
    return { ok: true, already: typeof body.id !== 'string' }
  } catch {
    // Сеть упала или Resend недоступен: пользователю честная ошибка, а не белый экран.
    return { ok: false, error: 'failed' }
  }
}
```

Ответ боту сознательно неотличим от успеха на уровне UI (показываем то же «спасибо»), но контакт не создаётся. Внутри `SubscribeResult` ошибка `'bot'` нужна тесту.

### Шаг 3.4. Форма

`components/landing/SubscribeForm.tsx`, клиентский:

- `<form>` с `onSubmit`, `useTransition`, состояние `idle | sent | error`.
- Поле email: `type="email"`, `required`, `maxLength={EMAIL_MAX_LENGTH}`, `data-testid="subscribe-email"`, стиль по `components/ui/input.tsx`.
- Скрытое поле-ловушка: `<input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute h-0 w-0 opacity-0" />`. Не `display:none`: часть ботов такие поля пропускает.
- Кнопка `data-testid="subscribe-submit"`, текст из `landing.subscribe.submit`, в pending `landing.subscribe.busy`.
- Успех: `data-testid="subscribe-sent"`. Ошибка: `role="alert" data-testid="subscribe-error"`.
- Карта ошибок в ключи, как `ERROR_KEYS` в `FeedbackButton.tsx`.

Секция `components/landing/SubscribeSection.tsx`: карточка на `bg-accent-soft` с рамкой `border-accent-border`, заголовок, текст, форма, мелкая строка про приватность.

Копирайт:

```
'landing.subscribe.title'   ru: 'Письма про доски, а не про нас'
                            en: 'Letters about boards, not about us'
'landing.subscribe.body'    ru: 'Раз в пару недель: новые узоры, приёмы склейки, что нового в студии. Без потока и без продаж чужого.'
                            en: 'Once every couple of weeks: new patterns, glue-up tricks, what changed in the studio. No firehose, no selling you other people stuff.'
'landing.subscribe.placeholder' ru: 'you@example.com'      en: 'you@example.com'
'landing.subscribe.submit'  ru: 'Подписаться'          en: 'Subscribe'
'landing.subscribe.busy'    ru: 'Отправляем'           en: 'Sending'
'landing.subscribe.sent'    ru: 'Готово. Проверьте почту, письмо уже летит.'
                            en: 'Done. Check your inbox, the letter is on its way.'
'landing.subscribe.note'    ru: 'Отписка в один клик из любого письма. Адрес никому не передаём.'
                            en: 'One click to unsubscribe from any letter. We never pass your address on.'
'landing.subscribe.errInvalid'  ru: 'Похоже, в адресе опечатка. Проверьте?'
                                en: 'That address looks off. Mind checking it?'
'landing.subscribe.errDisabled' ru: 'Почта пока не подключена. Загляните позже, подписка скоро заработает.'
                                en: 'Email is not wired up yet. Come back a bit later, subscription is coming.'
'landing.subscribe.errFailed'   ru: 'Не получилось отправить. Попробуйте ещё раз через минуту.'
                                en: 'Could not send that. Try again in a minute.'
```

### Шаг 3.5. Тесты

Юнит `lib/subscribe.test.ts`: схема отбивает пустое, отбивает `не-почту`, приводит к нижнему регистру и триммит, отбивает адрес длиннее 254, отбивает заполненную ловушку.

Юнит `app/actions/subscribe.test.ts` по образцу `app/actions/feedback.test.ts`: с замоканным `isResendConfigured -> false` возвращается `disabled`; с `true` и замоканным `global.fetch` (200 с `{id}`) возвращается `{ ok: true, already: false }`; при 422 возвращается `failed`; при брошенном исключении из fetch возвращается `failed`; заполненная ловушка даёт `bot` и fetch не вызывается вовсе.

E2E `e2e/landing.spec.ts` (часть про подписку):

```ts
test('форма подписки валидирует адрес и честно сообщает, что почта не подключена', async ({ page }) => {
  await page.goto('/landing')
  await page.getByTestId('subscribe-email').fill('не-почта')
  await page.getByTestId('subscribe-submit').click()
  await expect(page.getByTestId('subscribe-error')).toBeVisible()

  await page.getByTestId('subscribe-email').fill('stas@example.com')
  await page.getByTestId('subscribe-submit').click()
  // В CI переменных Resend нет: экшен обязан ответить честной заглушкой,
  // а не молча притвориться успехом.
  await expect(page.getByTestId('subscribe-error')).toContainText('пока не подключена')
})
```

Тест детерминирован именно потому, что CI без секретов. Локально у разработчика ключи в `.env.local` тоже отсутствуют до задачи владельца, а если появятся, тест начнёт слать реальные адреса: чтобы этого не случилось, использовать адрес на `@example.com` (Resend отбивает его как невалидный домен и вернёт `failed`) и в тесте ждать любой из двух ключей через регулярку `/пока не подключена|Не получилось отправить/`. Записать этот компромисс комментарием в спеке.

---

## Задача 4: партнёрские данные Amazon, блок инструментов и раздел «Литература»

**Коммит:** `фаза 8, задача 4: партнёрские блоки Amazon, инструменты и литература`.

### Шаг 4.1. Границы, которые нельзя перейти

Записать в шапке `lib/affiliate/index.ts` комментарием, чтобы следующий агент не «улучшил»:

```ts
/**
 * Что здесь СОЗНАТЕЛЬНО не делается и делаться не должно, пока нет доступа к
 * Amazon Product Advertising API:
 *  - не тянем и не храним картинки товаров с амазоновских CDN;
 *  - не показываем рейтинги, число отзывов и Prime-значки;
 *  - не показываем цену числом: только собственный текстовый диапазон,
 *    потому что кэшированная цена без API это прямое нарушение условий;
 *  - не скрейпим страницы товара ничем и никогда.
 * Всё, что видит пользователь, это наш редакционный текст плюс ссылка.
 */
```

### Шаг 4.2. Формат данных

`lib/affiliate/types.ts`:

```ts
export type PriceBand = 'under10' | 'b10_25' | 'b25_50' | 'b50_100'

export interface AffiliateItem {
  readonly id: string
  readonly asin: string
  readonly brand: string
  readonly title: { readonly ru: string; readonly en: string }
  readonly note: { readonly ru: string; readonly en: string }
  readonly band: PriceBand
  /** Не проверен вручную владельцем: ссылка ведёт на поиск по названию, а не на ASIN. */
  readonly unverified?: boolean
}

export interface AffiliateBook extends AffiliateItem {
  readonly author: string
  readonly year: number
  /** Одна строка «почему редакция советует». Не отзыв с Amazon. */
  readonly why: { readonly ru: string; readonly en: string }
}
```

`lib/affiliate/index.ts`:

```ts
import products from './products.json'
import books from './books.json'
import type { AffiliateBook, AffiliateItem } from './types'

export const AMAZON_TAG: string = process.env.NEXT_PUBLIC_AMAZON_TAG ?? ''

/**
 * Тега нет (локальная разработка, CI, форк) - ссылка всё равно рабочая, просто
 * без партнёрского хвоста. Блок не должен исчезать из-за отсутствия переменной:
 * подборка полезна сама по себе.
 */
export function amazonUrl(asin: string): string {
  const base = `https://www.amazon.com/dp/${asin}`
  return AMAZON_TAG.length > 0 ? `${base}?tag=${encodeURIComponent(AMAZON_TAG)}` : base
}

/** Для непроверенных позиций ведём на поиск, чтобы битый ASIN не дал 404. */
export function amazonSearchUrl(query: string): string {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
  return AMAZON_TAG.length > 0 ? `${base}&tag=${encodeURIComponent(AMAZON_TAG)}` : base
}

export function itemUrl(item: AffiliateItem): string {
  return item.unverified === true ? amazonSearchUrl(`${item.brand} ${item.title.en}`) : amazonUrl(item.asin)
}

export const PRODUCTS: readonly AffiliateItem[] = products as readonly AffiliateItem[]
export const BOOKS: readonly AffiliateBook[] = books as readonly AffiliateBook[]
```

Важно: `NEXT_PUBLIC_AMAZON_TAG` читается точечной нотацией, иначе Next не инлайнит его в клиентский бандл (та же ловушка, что описана в `lib/supabase/config.ts`).

Для импорта JSON в `tsconfig.json` должен быть `"resolveJsonModule": true`. Проверить и добавить, если нет.

### Шаг 4.3. Курированный список инструментов (`lib/affiliate/products.json`)

Двенадцать позиций, $5-99, всё реально существующие ходовые товары для склейки торцевой доски. **Каждый ASIN обязан быть проверен владельцем перед продом** (процедура в шаге 4.7). До проверки у всех стоит `"unverified": true`, и ссылки ведут на поиск: битая ссылка хуже, чем лишний клик.

| id | ASIN (проверить) | brand | RU название | Диапазон |
|---|---|---|---|---|
| `glue-titebond3` | `B0000224B4` | Titebond | Клей Titebond III Ultimate, 473 мл | b10_25 |
| `glue-brush` | `B01N7RQP4X` | Rockler | Силиконовая кисть и лоток для клея | under10 |
| `clamps-bar-24` | `B0002YV1LU` | Bessey | Струбцина корпусная 610 мм, пара | b25_50 |
| `clamps-pipe` | `B00002X21U` | Pony | Трубные струбцины 3/4", комплект | b25_50 |
| `caliper-digital` | `B000GSLKIW` | Neiko | Штангенциркуль цифровой 150 мм | b10_25 |
| `square-combo` | `B00004T7NF` | Empire | Комбинированный угольник 300 мм | b10_25 |
| `oil-mineral` | `B01AN0BR8O` | Thirteen Chefs | Минеральное масло пищевое, 473 мл | under10 |
| `wax-boardcream` | `B01N6XPCT2` | Walrus Oil | Воск-крем для разделочных досок | b10_25 |
| `sled-miter-gauge` | `B00J8Y9WBW` | Kreg | Угловой упор с точной шкалой | b50_100 |
| `scraper-card` | `B0002YSLGK` | Bahco | Цикля-скребок, набор | under10 |
| `sandpaper-set` | `B07T5VNCJH` | Diablo | Шлифовальные диски 125 мм, ассорти | b10_25 |
| `feet-rubber` | `B07BLPS8LB` | SoftTouch | Ножки-подпятники силиконовые, набор | under10 |

Редакционные подписи (`note`), RU / EN, писать своими словами и по делу. Примеры финального тона, остальные по образцу:

- `glue-titebond3` ru: «Водостойкий класс D3 и почти час открытого времени. На торцевой доске это разница между спокойной укладкой рядов и гонкой со струбцинами.» en: «Waterproof D3 with nearly an hour of open time. On an end-grain board that is the difference between laying rows calmly and racing the clamps.»
- `clamps-bar-24` ru: «Струбцин всегда не хватает ровно на одну. Для щита шириной 300 мм нужно минимум четыре, иначе середина останется голодной до клея.» en: «You are always one clamp short. A 300 mm panel wants four at the very least, or the middle stays starved of glue.»
- `caliper-digital` ru: «Студия считает в миллиметрах и требует того же от вас. Дешёвый цифровой штангель окупается на первой же ошибке в толщине ряда.» en: «The studio counts in millimetres and expects the same from you. A cheap digital caliper pays for itself on the first row thickness mistake.»
- `oil-mineral` ru: «Пищевое минеральное масло не сохнет и не горкнет. Первая пропитка торцевой доски съедает неприлично много, берите большой флакон.» en: «Food grade mineral oil never dries and never goes rancid. The first soak on an end-grain board drinks an indecent amount, buy the big bottle.»
- `sled-miter-gauge` ru: «Поперечный рез щита должен быть строго 90 градусов, иначе финальная переклейка разъедется веером. Точный упор дешевле переделанной доски.» en: «The crosscut has to be a true 90 degrees or the final glue-up fans open. A precise gauge is cheaper than a board made twice.»

### Шаг 4.4. Курированная литература (`lib/affiliate/books.json`)

Восемь книг, все существующие. ASIN для книг совпадает с ISBN-10, поэтому проверяются они быстрее товаров, но всё равно проверяются.

| id | ASIN / ISBN-10 (проверить) | Автор | Название | Год |
|---|---|---|---|---|
| `hoadley-understanding-wood` | `1561583588` | R. Bruce Hoadley | Understanding Wood: A Craftsman's Guide to Wood Technology | 2000 |
| `flexner-finishing` | `1565239288` | Bob Flexner | Understanding Wood Finishing | 2010 |
| `korn-basics` | `1561586200` | Peter Korn | Woodworking Basics: Mastering the Essentials of Craftsmanship | 2003 |
| `schwarz-toolchest` | `0982378130` | Christopher Schwarz | The Anarchist's Tool Chest | 2011 |
| `hylton-cabinetmaking` | `1565233697` | Bill Hylton | Illustrated Cabinetmaking | 2008 |
| `pekovich-why-how` | `1631869310` | Michael Pekovich | The Why and How of Woodworking | 2018 |
| `spagnuolo-hybrid` | `1440323844` | Marc Spagnuolo | Hybrid Woodworking | 2013 |
| `jackson-day-manual` | `0679766111` | Albert Jackson, David Day | The Complete Manual of Woodworking | 1996 |

Строка `why` («редакция рекомендует»), примеры финального тона:

- `hoadley-understanding-wood` ru: «Единственная книга, которая объясняет, почему торцевая доска ведёт себя не как обычная. Усушка поперёк волокон, движение по сезонам, почему щит трескается. Без неё расчёты студии останутся цифрами без смысла.» en: «The one book that explains why an end-grain board behaves unlike any other. Cross-grain shrinkage, seasonal movement, why panels crack. Without it the studio numbers stay numbers without meaning.»
- `flexner-finishing` ru: «Финиш это половина впечатления от готовой доски. Флекснер разбирает химию по полочкам и отдельно объясняет, что можно класть на то, с чего едят.» en: «Finish is half of how the finished board reads. Flexner lays the chemistry out plainly and covers separately what may go on a surface people eat from.»
- `schwarz-toolchest` ru: «Не про доски, а про то, какой минимум инструмента реально нужен. Отрезвляет раньше, чем вы потратите вторую тысячу долларов на железо.» en: «Not about boards but about the minimum kit you actually need. It sobers you up before the second thousand dollars goes into steel.»

Остальные пять подписей писать так же: одна мысль, один конкретный довод, без «must-read» и «библия столяра».

### Шаг 4.5. Компоненты

`components/affiliate/AffiliateShelf.tsx` (клиентский, потому что читает `locale` из zustand):

- Сворачиваемый блок на нативном `<details data-testid="affiliate-shelf">` с `<summary>`. Нативный элемент даёт клавиатуру и скринридер бесплатно, а анимацию раскрытия делаем через `::details-content` с `interpolate-size: allow-keywords` и запасным вариантом «просто раскрылось».
- `<summary>`: иконка `Wrench`, заголовок «Инструменты для мастерской», справа мелким `text-ink-muted` число позиций.
- Внутри: сетка `minmax(200px, 1fr)`, карточки как в галерее шаблонов (`bg-surface-raised`, `border-line-subtle`, `rounded-lg`, hover -> `shadow-md` и `border-accent-border`).
- Карточка: бренд caption-стилем, название `text-sm font-semibold`, подпись `text-[13px] text-ink-secondary`, бейдж диапазона цены (`bg-surface-sunken rounded-full font-mono text-[10px]`), ссылка на всю карточку с `target="_blank" rel="sponsored noopener noreferrer"` (атрибут `sponsored` обязателен, это требование Google к партнёрским ссылкам).
- Под сеткой строка дисклеймера `data-testid="affiliate-disclosure"`.

`components/affiliate/LiteratureSection.tsx` (клиентский): та же логика, но карточка книги крупнее, автор и год моноширинным, блок `why` с левой линией `border-l-2 border-accent-border` и подписью «редакция рекомендует». testid `literature-section`, у каждой карточки `book-card-{id}`.

Дисклеймер (обязателен возле каждого блока, оба места):

```
'affiliate.disclosure' ru: 'Как участник партнёрской программы Amazon, автор получает комиссию с покупок по этим ссылкам. Цена для вас не меняется, а подборка собрана до того, как появились ссылки.'
                       en: 'As an Amazon Associate the author earns from qualifying purchases. The price for you does not change, and the list was picked before the links were added.'
'affiliate.tools.title'   ru: 'Инструменты для мастерской'  en: 'Tools for the shop'
'affiliate.tools.subtitle' ru: 'Что реально держат в руках при склейке торцевой доски'
                           en: 'What you actually hold while gluing up an end-grain board'
'affiliate.books.title'   ru: 'Литература'                 en: 'Books'
'affiliate.books.subtitle' ru: 'Восемь книг, которые отвечают на вопросы, которых студия не заменит'
                           en: 'Eight books that answer what the studio cannot'
'affiliate.books.why'     ru: 'Редакция рекомендует'       en: 'Why we picked it'
'affiliate.price.under10' ru: 'до $10'    en: 'under $10'
'affiliate.price.b10_25'  ru: '$10-25'    en: '$10-25'
'affiliate.price.b25_50'  ru: '$25-50'    en: '$25-50'
'affiliate.price.b50_100' ru: '$50-100'   en: '$50-100'
'tabs.books'              ru: 'Литература' en: 'Books'
```

### Шаг 4.6. Вставка в приложение

1. `lib/store/studio.ts`: `StudioView` получает `'books'`.
2. `components/StudioTabs.tsx`: в `TABS` добавляется `{ view: 'books', labelKey: 'tabs.books' }` после `view3d`. Вкладка видна всем, в отличие от `projects`.
3. `components/StudioTabs.test.tsx`: тест на 5 вкладок правится на 6, плюс новая проверка, что `tab-books` отрисован и для гостя.
4. `components/StudioShell.tsx`: `FULL_WIDTH` получает `'books'`, ветка рендера получает `view === 'books' ? <LiteratureSection /> : ...`.
5. `AffiliateShelf` монтируется в двух местах: в конце `<main>` для `view === 'editor'` и внизу `TemplateGallery`. Свёрнут по умолчанию (`<details>` без `open`), чтобы не отжимать рабочее поле.
6. Лендинг получает лёгкую версию: секция `components/landing/BooksTeaser.tsx` с тремя книгами и ссылкой «вся подборка» -> `APP_ORIGIN` вкладка литературы, и дисклеймер в подвале.

### Шаг 4.7. Тесты и процедура проверки ASIN

Юнит `lib/affiliate/index.test.ts`:

- каждый ASIN ровно 10 символов и соответствует `/^[A-Z0-9]{10}$/`;
- ASIN уникальны внутри файла и между файлами;
- у каждой позиции непустые `title.ru`, `title.en`, `note.ru`, `note.en` (и `why.*` у книг), и ru отличается от en (защита от «забыли перевести»);
- `band` из допустимого множества;
- `amazonUrl` без тега не содержит `tag=`, с тегом содержит `?tag=` ровно один раз;
- ни в одном значении нет символа U+2014.

E2E `e2e/affiliate.spec.ts`:

```ts
test('полка инструментов сворачивается и несёт дисклеймер', async ({ page }) => {
  await openStudio(page)
  const shelf = page.getByTestId('affiliate-shelf')
  await expect(shelf).toBeVisible()
  await expect(page.getByTestId('affiliate-disclosure')).toBeHidden()
  await shelf.getByRole('button').or(shelf.locator('summary')).first().click()
  await expect(page.getByTestId('affiliate-disclosure')).toContainText('Amazon')
})

test('вкладка литературы показывает восемь книг с партнёрскими ссылками', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-books').click()
  await expect(page.getByTestId('literature-section')).toBeVisible()
  const links = page.getByTestId('literature-section').getByRole('link')
  await expect(links).toHaveCount(8)
  await expect(links.first()).toHaveAttribute('rel', /sponsored/)
  await expect(links.first()).toHaveAttribute('href', /amazon\.com/)
})
```

Процедура проверки ASIN владельцем (ручная, вынести в `docs/affiliate-verify.md` и в отчёт задачи):

1. Открыть `https://www.amazon.com/dp/<ASIN>` для каждой позиции из таблиц выше.
2. Если открылась карточка того самого товара и цена попадает в заявленный диапазон, снять `"unverified": true` у этой позиции.
3. Если 404 или другой товар, найти правильный ASIN в адресной строке нужной карточки и заменить в JSON.
4. Если товара нет в наличии совсем, удалить позицию из JSON: пустая ссылка хуже, чем на одну карточку меньше.

Пока хоть у одной позиции стоит `unverified`, ссылка ведёт на поиск по бренду и названию: пользователь всё равно попадает куда надо, а партнёрский тег на поиске работает так же.

---

## Задача 5: бренд, фавикон, слоганы, SEO

**Коммит:** `фаза 8, задача 5: бобёр в бренде, фавикон, слоганы и метаданные`.

### Шаг 5.1. Ассеты в репозиторий

```
public/brand/beaver.svg       <- копия scratchpad/logo/beaver-logo.svg   (маскот для героя, 1024x1024)
public/brand/beaver-mark.svg  <- копия scratchpad/logo/beaver-simple.svg (марка, читается с 32px)
```

Точные исходники:
`/private/tmp/claude-501/-Users-drtloki-Desktop------------Code-MY-endgrain-studio/2249bb86-5828-43c6-9469-22c88dfaa8ab/scratchpad/logo/beaver-logo.svg` и `beaver-simple.svg`.

При копировании прогнать по обоим файлам проверку на U+2014 (в комментариях палитры внутри SVG вполне может оказаться длинное тире) и заменить на дефис.

### Шаг 5.2. Фавикон

Next 16 берёт иконки из файловых конвенций в `app/`. Делаем:

- `app/icon.svg` = копия `beaver-mark.svg`. Современные браузеры возьмут SVG.
- `app/favicon.ico` уже существует (дефолтный Next). Заменить на бобра.
- `app/apple-icon.png` 180x180.

PNG и ICO генерируем уже установленным Chromium, без новых зависимостей. Скрипт `scripts/brand-icons.mjs`:

```js
// Рендерит public/brand/beaver-mark.svg в PNG нужных размеров через Chromium,
// который уже стоит для Playwright. Никаких sharp и ImageMagick.
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const SIZES = [
  { size: 180, out: 'app/apple-icon.png' },
  { size: 512, out: 'public/brand/beaver-512.png' },
  { size: 32,  out: 'public/brand/beaver-32.png' },
]
// ... открыть file:// на SVG, setViewportSize, screenshot({ omitBackground: true })
```

Скрипт в `package.json`: `"brand:icons": "node scripts/brand-icons.mjs"`. Результаты коммитятся, скрипт в CI не запускается.

`favicon.ico` собрать из `beaver-32.png` вручную (любой конвертер) либо, если возни много, удалить `app/favicon.ico` совсем: `app/icon.svg` покрывает всё, кроме очень старых браузеров, а `apple-icon.png` покрывает iOS. Рекомендация: удалить ico и не тратить время.

### Шаг 5.3. Марка в шапке студии

В `components/StudioShell.tsx` заменить квадрат с буквой `E`:

```tsx
<div className="flex items-center gap-2">
  <img
    src="/brand/beaver-mark.svg"
    alt=""
    width={24}
    height={24}
    className="size-6 shrink-0"
  />
  <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
</div>
```

`alt=""` намеренно: название рядом текстом, дублировать его для скринридера незачем. `next/image` не используем: SVG в `next/image` требует `dangerouslyAllowSVG`, а выигрыша ноль.

То же в `components/landing/LandingHeader.tsx`.

Дизайн-система в `docs/design/handoff/README.md` описывает логотип как «квадрат 22px с буквой E». Это расхождение зафиксировать: дописать в README один абзац «Логотип с фазы 8: марка-бобёр `public/brand/beaver-mark.svg`, 24px, без подложки. Описание квадрата с буквой E оставлено как история».

### Шаг 5.4. Слоганы в i18n и в метаданные

```
'app.slogan' ru: 'Пилим как надо'  en: 'Rip it right'
```

Использование: под названием в шапке лендинга мелким `text-ink-muted` (на мобиле скрыт), в `<title>` лендинга, в OG-картинке, в `app/(landing)/landing/page.tsx` как H1.

В студии слоган не показываем: там работают, а не читают лозунги.

### Шаг 5.5. Метаданные

Корневой `app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: { default: 'Endgrain Studio', template: '%s · Endgrain Studio' },
  description: 'Проект торцевой разделочной доски: узор, распил, материал, себестоимость',
}
```

`app/(landing)/landing/page.tsx` (метаданные зависят от локали, поэтому `generateMetadata`):

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  const title = `${t(locale, 'app.title')}: ${t(locale, 'app.slogan')}`
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title,
    description: t(locale, 'landing.hero.subtitle'),
    alternates: { canonical: SITE_ORIGIN },
    openGraph: {
      type: 'website',
      url: SITE_ORIGIN,
      siteName: 'Endgrain Studio',
      title,
      description: t(locale, 'landing.hero.subtitle'),
      locale: locale === 'ru' ? 'ru_RU' : 'en_US',
    },
    twitter: { card: 'summary_large_image', title, description: t(locale, 'landing.hero.subtitle') },
  }
}
```

`app/(landing)/landing/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Endgrain Studio: Пилим как надо'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  // PT Sans уже лежит в public/fonts с фазы 5 (кириллический PDF).
  // Второй раз тащить шрифт из сети на билд-этапе незачем.
  const bold = await readFile(join(process.cwd(), 'public/fonts/PTSans-Bold.ttf'))
  return new ImageResponse(
    (/* фон #EFEAE1, слева слоган 84px #241E19 с акцентным словом #14615A,
        справа четыре полосы цветов пород, снизу endgrain.app мелким */),
    { ...size, fonts: [{ name: 'PT Sans', data: bold, weight: 700, style: 'normal' }] },
  )
}
```

Картинка рисуется примитивами (прямоугольники цветов пород из `SPECIES`), без растровых ассетов: `ImageResponse` умеет ограниченный CSS, и сложный SVG-бобёр туда тащить рискованно. Если захочется бобра, вставлять его как `<img src="data:image/svg+xml;base64,...">` только после проверки, что билд не падает.

### Шаг 5.6. robots и sitemap

`app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/routing/host'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/auth/', '/reset-password'] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
```

`app/sitemap.ts`: две записи, `SITE_ORIGIN` (priority 1.0) и `APP_ORIGIN` (0.8).

Ограничение честно записать комментарием: robots и sitemap отдаются с обоих доменов одинаковые, потому что проект один. Для конкурсного продукта это приемлемо; если понадобится разводить, делается через route handler с чтением заголовка Host.

### Шаг 5.7. README

Дописать в `README.md` таблицу переменных:

| Переменная | Назначение |
|---|---|
| `RESEND_API_KEY` | Ключ Resend для подписки. Серверная, в клиентский бандл не попадает. Без неё форма подписки работает, но честно отвечает, что почта не подключена. |
| `RESEND_AUDIENCE_ID` | Идентификатор аудитории Resend, куда добавляются контакты. Нужен вместе с ключом. |
| `NEXT_PUBLIC_AMAZON_TAG` | Партнёрский тег Amazon Associates. Без неё блоки рендерятся, ссылки идут без тега. |
| `NEXT_PUBLIC_SITE_ORIGIN` | Корневой домен лендинга, по умолчанию `https://endgrain.app`. |
| `NEXT_PUBLIC_APP_ORIGIN` | Домен студии, по умолчанию `https://app.endgrain.app`. |

Плюс раздел «Домены» с таблицей host-роутинга из этого плана.

---

## Задача 6: e2e лендинга и полные гейты

**Коммит:** `фаза 8, задача 6: e2e лендинга и партнёрских блоков, финальные гейты`.

### Шаг 6.1. `e2e/landing.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test'

async function openLanding(page: Page, locale: 'ru' | 'en' = 'ru'): Promise<void> {
  await page.context().addCookies([
    { name: 'eg-locale', value: locale, url: 'http://127.0.0.1:3100' },
  ])
  await page.goto('/landing')
  await expect(page.getByTestId('landing')).toBeVisible()
}
```

Сценарии:

1. **Лендинг открывается на русском и несёт слоган.** `await expect(page.getByRole('heading', { level: 1 })).toContainText('Пилим как надо')`.
2. **Переключатель языка меняет копирайт.** Клик `landing-locale-en`, ждём `'Rip it right'` в H1, cookie выставлена.
3. **Витрина рендерит доски.** `await expect(page.getByTestId('pattern-marquee-a').locator('svg')).toHaveCount(16)` (8 шаблонов на два прохода дубля), и хотя бы один `rect` внутри имеет `fill` из палитры пород.
4. **Кнопки ведут на поддомен студии.** `await expect(page.getByTestId('landing-cta-hero')).toHaveAttribute('href', /app\.endgrain\.app/)`.
5. **Подписка** (из задачи 3).
6. **Подвал несёт дисклеймер Amazon и строку про приватность.**
7. **Студия на `/` не изменилась.** `await page.goto('/')`, `board-canvas` видим, `landing` отсутствует. Это страховка от того, что host-роутинг однажды сломает корень локально.

Дополнительно, отдельный маленький тест на движение: проверить наличие класса `eg-marquee-track` и то, что при `page.emulateMedia({ reducedMotion: 'reduce' })` вычисленный `animation-name` равен `none`. Без него `prefers-reduced-motion` тихо отвалится при первой правке CSS.

### Шаг 6.2. `e2e/affiliate.spec.ts`

Из задачи 4, плюс сценарий: полка на вкладке шаблонов тоже присутствует и тоже свёрнута.

### Шаг 6.3. Обновить `e2e/visual.spec.ts`

В массив `TABS` добавить `{ tab: 'books', marker: 'literature-section' }`, чтобы новая вкладка попала в существующую визуальную проверку на десктопе и мобиле. Это добавит 2 теста к базовым.

### Шаг 6.4. Финальные гейты

1. `pnpm typecheck` без ошибок.
2. `pnpm lint` без предупреждений.
3. `pnpm test` зелёный, число тестов выросло на добавленные юниты.
4. `pnpm build` собирается, и в выводе видно, что `/landing` статический либо динамический без ошибок.
5. `pnpm test:e2e`: 43 базовых зелёных плюс новые. Записать итоговое число в отчёт задачи.
6. `grep -rn $'—'` по всему `app`, `components`, `lib`, `e2e`, `public/brand`, `README.md` пусто.
7. Ручная проверка host-роутинга на локальном билде через подмену заголовка:
   ```
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: endgrain.app' http://127.0.0.1:3100/
   curl -s -H 'Host: endgrain.app' http://127.0.0.1:3100/ | grep -c 'Пилим как надо'
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: endgrain.app' http://127.0.0.1:3100/login
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: app.endgrain.app' http://127.0.0.1:3100/landing
   ```
   Ожидания: `200`, `1` и больше, `307 https://app.endgrain.app/login`, `308 https://endgrain.app/landing`.
8. После деплоя: открыть `https://endgrain.app` (лендинг), `https://www.endgrain.app` (редирект на apex), `https://app.endgrain.app` (студия), `https://endgrain.app/login` (редирект на поддомен), `https://endgrain.app/opengraph-image` (картинка рисуется), прогнать URL через отладчик OG в Telegram (просто отправить ссылку себе).

---

## Самопроверка плана

**Покрытие требований задания.** Host-роутинг с обоснованием и конкретной схемой Vercel: задача 1 и отдельный раздел. Лендинг с бобром, слоганами, живой витриной, сеткой возможностей, скриншотами, CTA и подвалом: задача 2. Подписка на Resend с гвардом по образцу `isSupabaseConfigured`: задача 3. Amazon без скрейпа, статический JSON, тег из env с гвардом, дисклеймер у каждого блока, сворачиваемая полка на редакторе и шаблонах, отдельный раздел литературы: задача 4. Бренд, фавикон, слоганы в i18n и метаданных, OG: задача 5. E2E и гейты: задача 6. Полный ru/en копирайт лендинга дан текстом, а не описанием.

**Плейсхолдеров не осталось**, кроме двух осознанных мест, и оба помечены прямо в шагах: реальные значения ASIN требуют ручной проверки владельцем (механика деградации на поиск описана и покрыта флагом `unverified`), и пять PNG-скриншотов студии снимаются скриптом `pnpm shots` в момент исполнения задачи 2, а не выдумываются планом.

**Корректность host-роутинга для Vercel.** Ключевой риск был в порядке слоёв: proxy отрабатывает раньше `beforeFiles` rewrites, это проверено по документации Next 16.3 в `node_modules`, поэтому логика в proxy авторитетна и конфликта с конфигом не возникнет. Второй риск, рекурсия rewrite, снят: rewrite из proxy не перезапускает proxy. Третий риск, поломка 43 e2e, снят ролью `unknown` для `127.0.0.1` и `localhost`. Четвёртый риск, две индексируемые копии лендинга, снят редиректом 308 с `app.endgrain.app/landing`. Пятый риск, потеря cookies Supabase при rewrite, снят тем, что ветка лендинга вообще не трогает сессию, а ветка студии возвращает нетронутый `updateSession(request)`.

**Слабое место, которое стоит держать в голове.** `next.config.ts` остаётся пустым, и это сознательно: вся маршрутизация в одном файле. Если Vercel когда-нибудь начнёт кэшировать корень на CDN до proxy, лендинг может залипнуть, но для этого нужен явный `Cache-Control` на `/`, которого мы не ставим.

---

## Риски и ручные шаги владельца

| Что | Кто делает | Когда | Что будет, если не сделать |
|---|---|---|---|
| DNS в Porkbun: `A @`, `CNAME www`, `CNAME app` по значениям из диалога Vercel | Станислав | до задачи 6 | Домены не резолвятся, лендинг живёт только по `/landing` на `*.vercel.app` |
| Три домена в Settings -> Domains проекта `endgrain-studio`, `www` как Redirect на apex | Станислав | до задачи 6 | Vercel не отдаст запрос приложению, host-логика не отработает ни разу |
| `RESEND_API_KEY` и `RESEND_AUDIENCE_ID` в Vercel (Production и Preview) | Станислав | до релиза, не блокирует разработку | Форма подписки работает, но честно отвечает «почта пока не подключена». Ни одна сборка не падает |
| Домен-отправитель в Resend (DKIM, SPF на `endgrain.app`) | Станислав | до первой рассылки | Контакты собираются, но письма уходят в спам или не уходят |
| `NEXT_PUBLIC_AMAZON_TAG` (заявка в Amazon Associates, тег вида `endgrain-20`) | Станислав | до релиза | Блоки рендерятся, ссылки без тега, комиссии нет |
| Проверка 12 ASIN товаров и 8 ASIN книг по процедуре шага 4.7 | Станислав | до релиза | Ссылки уходят на поиск вместо карточки товара. Не ломается, но конверсия ниже |
| Юридический минимум Amazon Associates: аккаунт должен быть одобрен, а дисклеймер обязан быть виден без прокрутки рядом со ссылками | Станислав | до релиза | Риск блокировки партнёрского аккаунта |
| `favicon.ico`: либо сконвертировать, либо удалить в пользу `icon.svg` | решение Станислава | задача 5 | Останется дефолтная иконка Next, что выглядит как недоделка |

Технические риски, которые снимаются внутри фазы:

- **Дедлайн 17 августа.** Фаза 8 это шесть задач, из них по-настоящему тяжёлые только 2 и 4. Если время поджимает, режется в таком порядке: полоса скриншотов (шаг 2.6), scroll-driven анимации (`eg-reveal`), OG-картинка (заменяется статическим PNG). Лендинг, подписка и партнёрские блоки не режутся.
- **`ImageResponse` на билде.** Если `next/og` начнёт падать на кириллице, откат: положить готовый `public/brand/og.png` и указать его в `openGraph.images` вместо файла-конвенции. Проверить это до задачи 6, а не после деплоя.
- **`<details>` и анимация раскрытия.** `::details-content` поддержан не везде. Базовое поведение (мгновенное раскрытие) обязано быть рабочим, анимация только сверху через `@supports`.
- **Рост e2e-времени.** Playwright сейчас собирает прод-билд перед прогоном, и новые сценарии добавят к нему секунды, а не минуты. Если время выйдет за 10 минут в CI, лендинг-спеку разделить на отдельный проект Playwright с `testMatch`.
