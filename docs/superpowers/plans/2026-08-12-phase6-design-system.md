# Фаза 6: применение дизайн-системы Endgrain ко всему приложению

Источник спеки: `/Users/drtloki/Downloads/design_handoff_endgrain_design_system/` (README.md, globals.css, fonts.ts, tailwind.config.ts).
Репозиторий: `/Users/drtloki/Desktop/Актуальное/Code/MY/endgrain-studio`.

Цель фазы: полный рестайл интерфейса под handoff. Ни одна строчка поведения не меняется: стор, движок, расчёты, экспорт, i18n-ключи и тексты остаются как есть. Меняются только `app/globals.css`, `app/layout.tsx`, новый `app/fonts.ts`, className/обёртки в компонентах и варианты примитивов `components/ui/*`.

---

## Ключевая находка по Tailwind

**У нас Tailwind v4, конфиг только в CSS. Файла `tailwind.config.ts` в репозитории нет и создавать его не надо.**

- `package.json`: `tailwindcss@^4`, `@tailwindcss/postcss@^4`; `postcss.config.mjs` подключает только `@tailwindcss/postcss`.
- `components.json`: `"tailwind": { "config": "", "css": "app/globals.css", "cssVariables": true }` - shadcn уже настроен на CSS-first.
- `app/globals.css` начинается с `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";` плюс блок `@theme inline { ... }`, `:root { ... }`, `.dark { ... }`, `@layer base`.
- Проверено: `shadcn/tailwind.css` резолвится в `node_modules/.pnpm/shadcn@4.16.2/.../dist/tailwind.css` и содержит **только** keyframes и `@utility` (shimmer, scroll-fade). Токенов цвета там нет, конфликтов с нашей палитрой не будет. Импорт оставляем.

**Как переводим `tailwind.config.ts` из handoff в наш setup.** Каждый ключ `theme.extend` становится записью в `@theme inline` под namespace v4:

| handoff (v3 `theme.extend`) | наш v4 `@theme inline` | утилита |
|---|---|---|
| `colors.app` | `--color-app: var(--bg-app)` | `bg-app` |
| `colors.canvas` | `--color-canvas: var(--bg-canvas)` | `bg-canvas` |
| `colors.surface.DEFAULT/raised/sunken/panel` | `--color-surface`, `--color-surface-raised`, `--color-surface-sunken`, `--color-surface-panel` | `bg-surface-raised` и т.д. |
| `colors.ink.*` | `--color-ink`, `--color-ink-secondary`, `--color-ink-muted`, `--color-ink-inverse` | `text-ink-muted` |
| `colors.line.*` | `--color-line-subtle`, `--color-line`, `--color-line-strong` | `border-line-subtle` |
| `colors.accent.*` | `--color-accent`, `--color-accent-hover`, `--color-accent-active`, `--color-accent-soft`, `--color-accent-border`, `--color-accent-fg` | `bg-accent-soft`, `text-accent` |
| `colors.success/warning/error.*` | `--color-success`, `--color-success-soft`, `--color-success-border`, `--color-success-text` (и по аналогии warning/error) | `bg-warning-soft` |
| `fontFamily.display/sans/mono` | `--font-display`, `--font-sans`, `--font-mono` (+ `--font-heading` для shadcn CardTitle) | `font-display`, `font-mono` |
| `borderRadius` | `--radius-xs: 4px` … `--radius-xl: 16px`, `--radius-full: 999px` | `rounded-md` |
| `boxShadow` | `--shadow-sm/-md/-lg/-dialog` + `--shadow-focus` | `shadow-md`, `shadow-dialog` |
| `spacing` | **ничего не пишем**: база v4 `--spacing: 0.25rem` уже даёт 2/4/6/8/12/16/20/24/32/40/48/64 через `0.5 1 1.5 2 3 4 5 6 8 10 12 16` | `p-2`, `gap-1.5` |
| `transitionDuration` | `--duration-fast: 80ms`, `--duration-hover: 120ms`, `--duration-panel: 160ms`, `--duration-modal: 240ms` | `duration-hover` |
| `transitionTimingFunction.out` | `--ease-out: cubic-bezier(0.2, 0.6, 0.2, 1)` | `ease-out` |

`@theme inline` (а не `@theme`) обязателен: утилиты должны ссылаться на `var(--…)`, иначе `.dark` не переопределит их.

**Коллизия `--accent`.** shadcn использует `--accent` как «фон при наведении», handoff использует `--accent` как основной тиловый. Проверено: `bg-accent`/`text-accent-foreground` встречаются ровно в одном месте, `app/global-error.tsx:19` (`hover:bg-accent`). Поэтому имена handoff берём дословно, а `global-error.tsx` переводим на `hover:bg-app` явно. Никаких переименований токенов, никаких выдуманных имён.

**Породы дерева.** `wood-species.ts` из handoff **не применяем**. Наш `lib/species/index.ts` - источник истины: у нас 16 пород с другими id (`red-oak`, `white-oak`, `hickory`, `jatoba`) и другими hex, а e2e проверяют точные значения (`#a5613b`, `#e3caa1`, `#3a2a20`, `#a8422a`). Цвета ячеек по-прежнему берутся из `speciesHex()`, а не из токенов - это и есть требование README («цвет ячейки берётся из SPECIES[].hex, не из токенов»).

---

## Глобальные ограничения

1. **Длинное тире (символ U+2014, em dash) запрещено** везде: код, комментарии, коммиты, UI-тексты. Только дефис, двоеточие или скобки.
2. **Коммиты и любые тексты пользователю - по-русски**, техтермины на английском.
3. **Поведение заморожено.** `lib/store/*`, `lib/engine/*`, `lib/calc/*`, `lib/export/*`, `lib/generators/*`, `lib/photo/*`, `lib/i18n/{ru,en}.ts` не редактируются. Никаких новых фич сверх экранов README.
4. **Все существующие `data-testid` и `aria-label` сохраняются дословно.** Новые testid добавлять можно (они нужны для визуального смоука), удалять и переименовывать - нельзя. `template-confirm`, `generator-confirm`, `photo-confirm`, `fork-dialog`, `gen-card-N`, `species-*`, `row-*`, `panel-*`, `board-*`, `export-*`, `unit-*`, `locale-*`, `tab-*`, `undo`, `redo`, `row-label` - в этот список руками не лезем.
5. **Юнит-тесты ищут по видимому тексту.** `StudioShell.test.tsx` делает `screen.getByText('Сложность проекта')`, `getByText(/Габарит: 60/)`, `getByText(/Габарит: 2\.36"/)`, `fireEvent.click(screen.getByText('EN'))`. Значит строки нельзя разбивать на несколько элементов, оборачивать посимвольно или прятать. Строка `board.size` в `ComplexityMeter` остаётся одним текстовым узлом.
6. **Квирки репозитория:**
   - `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Опциональный проп нельзя передать как `foo={undefined}` - только условным спредом `...(x ? { foo: x } : {})`.
   - Тесты пользуются нативными DOM-проверками (`container.querySelector(...)`, `.getAttribute('fill')`, `expect(...).toBeDefined()`), а не только jest-dom. Новые проверки писать в том же стиле.
   - `fireEvent` из `@testing-library/react` уже обёрнут в `act()`; ручной `act()` добавлять только если появится предупреждение React.
   - `NumberFieldMm` намеренно правит состояние во время рендера (паттерн «сброс состояния при смене пропса»), эту логику не трогаем.
   - `next.config.ts` и `playwright.config.ts` (порт 3100, `pnpm build && pnpm start`, viewport 1280×900, swiftshader для WebGL) не меняем, кроме случая из задачи 7.
7. **Никаких сырых hex в компонентах.** Только токены и утилиты Tailwind. Единственное исключение - `speciesHex()` в inline-`style` для ячеек, свотчей и превью.
8. **Тёмная тема: не отгружаем в этой фазе.** Переменные `.dark` из handoff кладём в `globals.css`, `@custom-variant dark (&:is(.dark *))` оставляем, переключатель не делаем. Приложение стартует и живёт в светлой теме. Причина: тумблер темы это новое поведение и новое состояние стора, а поведение заморожено.
9. **Правило чисел.** Любое число в интерфейсе набирается `font-mono` + `tabular-nums`. Это относится к метру сложности, числовым полям, счётчикам, размерам, номерам рядов, бейджам, статистике генератора и фото.
10. Каждая задача заканчивается зелёными `pnpm test`, `pnpm lint`, `pnpm typecheck` и указанным точечным e2e. Красное не коммитим.

Полезные соответствия hex → rgb (для `toHaveCSS` в задаче 7): `#EFEAE1` = `rgb(239, 234, 225)`, `#E9E3D8` = `rgb(233, 227, 216)`, `#FBF9F5` = `rgb(251, 249, 245)`, `#14615A` = `rgb(20, 97, 90)`, `#DCEAE7` = `rgb(220, 234, 231)`, `#241E19` = `rgb(36, 30, 25)`, `#D2C8B8` = `rgb(210, 200, 184)`.

---

## Задача 1. Фундамент: токены, шрифты, тема Tailwind v4

**Файлы:** `app/globals.css` (перезапись), `app/fonts.ts` (новый), `app/layout.tsx`, `app/global-error.tsx`, `app/error.tsx`.

**Спека.**

`app/fonts.ts` - дословно `fonts.ts` из handoff, но с нашим порядком импортов и без хвостового комментария:

```ts
import { Bitter, Golos_Text, JetBrains_Mono } from 'next/font/google'

export const bitter = Bitter({ subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700'], variable: '--font-bitter', display: 'swap' })
export const golos = Golos_Text({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-golos', display: 'swap' })
export const jetbrains = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '700'], variable: '--font-jetbrains', display: 'swap' })
```

`app/globals.css` - структура файла после переписывания:

1. `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";`
2. `@custom-variant dark (&:is(.dark *));` - оставить как есть.
3. `:root { … }` - **весь блок `:root` из handoff `globals.css` дословно**, все 60+ переменных: фоны, текст, границы, акцент, состояния, `--selection`, `--selection-halo`, `--focus-ring`, `--cell-outline`, радиусы, тени, `--border-hairline`, `--border-active`, длительности, `--ease-out`, три `--font-*`.
4. В том же `:root` - алиасы семантики shadcn на токены Endgrain, чтобы существующие `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring` не поехали:
   ```
   --background: var(--bg-app);      --foreground: var(--text-primary);
   --card: var(--surface);           --card-foreground: var(--text-primary);
   --popover: var(--surface);        --popover-foreground: var(--text-primary);
   --primary: var(--accent);         --primary-foreground: var(--accent-fg);
   --secondary: var(--surface);      --secondary-foreground: var(--text-primary);
   --muted: var(--surface-panel);    --muted-foreground: var(--text-muted);
   --accent-foreground: var(--accent-fg);
   --destructive: var(--error);
   --border: var(--border-default);  --input: var(--border-default);  --ring: var(--accent);
   --radius: 8px;
   ```
   Блоки `--chart-*` и `--sidebar-*` удалить: ни одного потребителя в коде нет (проверено grep), а вместе с ними уходят и соответствующие строки из `@theme inline`.
5. `.dark { … }` - блок `.dark` из handoff дословно. Отгружается как мёртвый код на будущее.
6. `@theme inline { … }` - маппинг по таблице выше. Обязательно:
   - `--font-display: var(--font-bitter), Georgia, serif;`
   - `--font-sans: var(--font-golos), system-ui, sans-serif;`
   - `--font-mono: var(--font-jetbrains), ui-monospace, monospace;`
   - `--font-heading: var(--font-bitter), Georgia, serif;` (`CardTitle` в `components/ui/card.tsx` использует `font-heading`)
   - `--radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-full: 999px;`
   - `--radius-4xl: 999px;` - `components/ui/badge.tsx` использует `rounded-4xl`, бейдж по спеке пилюля.
   - `--shadow-sm/-md/-lg/-dialog` и `--shadow-focus: var(--focus-ring)`.
   - `--duration-fast/-hover/-panel/-modal`, `--ease-out`.
7. `@layer base` - `* { @apply border-line-subtle; }`, `body { background: var(--bg-app); color: var(--text-primary); font-family: var(--font-ui); -webkit-font-smoothing: antialiased; }`, `html { @apply font-sans; }`.

`app/layout.tsx`:
- удалить `Geist`/`Geist_Mono`, импортировать `bitter, golos, jetbrains` из `./fonts`;
- `<html lang="ru" className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}>`;
- `<body className="min-h-full flex flex-col font-sans">` - метаданные и `LayoutProps<"/">` не трогать.

`app/global-error.tsx`: `hover:bg-accent` → `hover:bg-app` (иначе кнопка станет тиловой при наведении). `app/error.tsx` проверить на такие же семантические классы и поправить по тому же принципу.

**Шаги.**
1. Создать `app/fonts.ts`.
2. Переписать `app/globals.css` по структуре выше.
3. Переписать `app/layout.tsx` на новые шрифты.
4. Пройтись grep по `app/` и `components/` за `bg-accent`, `text-accent-foreground`, `bg-chart`, `sidebar` и поправить точечно.
5. `pnpm dev`, открыть `/`, глазами: фон бежевый `#EFEAE1`, текст Golos, заголовки Bitter, ничего не белое и не чёрное.

**Проверки.** `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e e2e/editor.spec.ts` (полностью зелёный: смена палитры не должна ронять ни один сценарий).

---

## Задача 2. Примитивы: кнопки, карточки, бейджи, числовое поле

**Файлы:** `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx`, `components/NumberFieldMm.tsx`, `components/NumberFieldMm.test.tsx`.

**Спека кнопок (README «Кнопки»).** Высота 36px, в плотных панелях 30px, padding `0 16px`, `rounded-md` (8px), body 14 / 600.

| Вариант | default | hover | active | focus | disabled |
|---|---|---|---|---|---|
| primary (`default`) | `bg-accent text-accent-fg shadow-sm` | `bg-accent-hover shadow-md` | `bg-accent-active shadow-none` | ring `rgba(20,97,90,0.28)` | `bg-[#C7D8D5] text-accent-fg` |
| secondary (`outline`) | `bg-surface border-line shadow-sm` | `bg-app border-line-strong` | `bg-surface-sunken` | `border-accent` + `--focus-ring` | `bg-surface-panel text-line-strong` |
| ghost | прозрачный, `text-ink-secondary` | `bg-app text-ink` | `bg-surface-sunken` | `border-accent` + `--focus-ring` | `text-line-strong` |
| destructive | `bg-error text-ink-inverse` | `bg-[#8C2820]` | `bg-[#731F19]` | ring `rgba(166,51,40,0.24)` | `bg-error-border` |

Значения `#C7D8D5`, `#8C2820`, `#731F19` и две rgba-обводки в handoff `globals.css` отдельными переменными не заведены. Не выдумываем новые имена: пишем их как arbitrary-значения ровно в `buttonVariants` (одно место на весь проект) с комментарием «состояния кнопок из README, в токены не вынесены».

Размеры: `default` → `h-9` (36px), `sm` → `h-[30px]` (плотные панели), `icon` → `size-8` (32×32, undo/redo), `icon-sm` → `size-7` (28×28, действия в инспекторах). Иконки `lucide-react`, `size-4` (16px) / `size-[15px]`, `strokeWidth={1.6}`.

Переход: `transition-[background-color,border-color,box-shadow] duration-hover ease-out`. Убрать `active:not-aria-[haspopup]:translate-y-px` - README требует «никаких сдвигов по вертикали».

**Card:** `bg-surface`, `border border-line-subtle` вместо `ring-1 ring-foreground/10`, `rounded-lg` (12px), `--card-spacing: --spacing(3)` (12px). `CardTitle` - caption по README: `font-sans text-[11px] leading-4 font-medium uppercase tracking-[0.12em] text-ink-muted`. Внимание: тесты ищут `getByText('Сложность проекта')` и `getByText('Проверки изготовимости')` - `uppercase` это CSS-трансформация, текстовый узел не меняется, поиск переживёт.

**Badge:** `rounded-full`, `bg-surface-sunken text-ink-secondary font-mono text-[10px] tabular-nums px-[7px] py-0.5 h-auto`.

**Separator:** `bg-line-subtle`, вертикальный вариант используется в шапке как `h-6 w-px`.

**NumberFieldMm.** Добавить пропы `size?: 'default' | 'compact' | 'dense'` (36/34/30px) и `suffix?: string`, оба опциональные - из-за `exactOptionalPropertyTypes` передавать только условным спредом. Разметка:
- обёртка `flex flex-col gap-1`;
- `<label>` над полем: `text-[11px] text-ink-muted` (связь `htmlFor`/`id` сохранить дословно, `getByLabelText` в тестах на ней держится);
- контейнер поля: `flex items-center gap-1 rounded-sm border border-line bg-surface-raised px-2 h-9|h-[34px]|h-[30px] hover:border-line-strong focus-within:border-[1.5px] focus-within:border-accent focus-within:shadow-focus transition-[border-color,box-shadow] duration-hover ease-out`;
- `<input>` внутри: `w-full bg-transparent font-mono text-sm tabular-nums text-ink outline-none border-0`, `appearance-none` плюс скрытие спиннеров (`[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`);
- суффикс: `<span aria-hidden className="font-mono text-[11px] text-ink-muted shrink-0">`;
- disabled: `bg-surface-sunken border-line-subtle text-line-strong`.

Обязательно сохранить: `type="number"`, `step`, `inputMode="decimal"`, `data-testid`, `onChange/onBlur/onKeyDown` и логику черновика. e2e делает `thickness.fill('60')` и `.blur()` - `<input>` должен остаться прямым потомком с тем же testid, обёртка testid не перехватывает.

**Шаги.**
1. Переписать `buttonVariants` под четыре варианта и четыре размера.
2. Обновить `card.tsx`, `badge.tsx`, `separator.tsx`.
3. Переписать разметку `NumberFieldMm`, добавить `size` и `suffix`.
4. В `NumberFieldMm.test.tsx` дописать два кейса: суффикс рендерится и не попадает в `input.value`; `size="dense"` даёт высоту-класс на контейнере (проверять нативно через `container.querySelector('[data-testid="kerf"]')?.parentElement?.className`).
5. Прогнать все юнит-тесты компонентов.

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm test:e2e e2e/editor.spec.ts e2e/export.spec.ts`.

---

## Задача 3. Шапка приложения и каркас редактора

**Файлы:** `components/StudioShell.tsx`, `components/StudioTabs.tsx`, `components/HistoryControls.tsx`, `components/LocaleToggle.tsx`, `components/StudioShell.test.tsx`, `components/StudioTabs.test.tsx`, `components/LocaleToggle.test.tsx`, `components/HistoryControls.test.tsx`.

**Спека шапки (README «Шапка приложения»).** Строка `min-h-14` (56px), `px-4 py-2`, `flex flex-wrap items-center gap-4`, `bg-surface`, `border-b border-line`. Добавить `data-testid="app-header"` (новый testid, нужен смоуку).

- Логотип: квадрат `size-[22px] rounded-xs bg-accent`, внутри буква E: `font-display text-[13px] text-ink-inverse`. Рядом название `font-display text-[17px] font-semibold`. Заголовок `t(locale,'app.title')` перенести из `<h1>` в эту строку, `app.tagline` из шапки убрать (в 56px не помещается) - но только если ни один тест его не ищет; иначе оставить как `sr-only`. **Перед правкой прогнать `grep -rn "app.tagline" components e2e`.**
- Вкладки: `role="tablist"` и `data-testid="tab-*"` сохранить дословно. Каждая вкладка перестаёт быть `<Button variant>` и становится собственной кнопкой: `px-[13px] py-[7px] rounded-sm text-sm transition-colors duration-hover ease-out`. Неактивная `text-ink-secondary font-medium`, hover `hover:bg-app hover:text-ink`, активная `bg-accent-soft text-accent font-semibold`, focus `focus-visible:shadow-focus`. `aria-selected` оставить как есть.
- Сегмент-контролы единиц (мм/in) и языка (RU/EN): обёртка `inline-flex rounded-md bg-surface-sunken p-0.5`, сегмент `px-2 py-1 rounded-sm transition-colors duration-hover`, активный `bg-surface-raised shadow-sm`. Единицы `font-mono text-xs`, язык `font-sans text-xs font-semibold`. testid `unit-mm`/`unit-in`/`locale-ru`/`locale-en` и `aria-label` групп сохранить. **Текст «EN» обязан остаться единственным текстовым узлом внутри кликабельного элемента** - на нём висит `fireEvent.click(screen.getByText('EN'))`.
- Undo/redo: ghost-кнопки `size-8 rounded-sm`, иконки `lucide-react` `Undo2`/`Redo2` `size-4 strokeWidth={1.6}`, disabled `text-line-strong` без hover. testid `undo`/`redo` и `aria-label` сохранить; текстовые подписи заменяются иконками, поэтому кнопкам нужен `aria-label={t(locale,'history.undo')}` - проверить, что тест `HistoryControls.test.tsx` не ищет их по видимому тексту, иначе оставить текст в `sr-only`.
- Разделители между группами: `<Separator orientation="vertical" className="h-6" />`.

Единицы переезжают из `BoardSettings` в шапку. Компонент `BoardSettings` при этом сохраняет свои `unit-mm`/`unit-in`? Нет: два элемента с одним testid сломают Playwright strict mode. Решение: сегмент единиц живёт **только в шапке**, из `BoardSettings.tsx` группа единиц удаляется целиком. Проверить `BoardSettings.test.tsx` и e2e - `page.getByTestId('unit-in').click()` в `editor.spec.ts` продолжит работать, элемент просто переехал.

**Каркас редактора (README «Респонсив»).** В `StudioShell` заменить `grid lg:grid-cols-[minmax(0,1fr)_22rem]` на `grid lg:grid-cols-[minmax(0,236px)_minmax(0,1fr)_minmax(0,268px)]`: слева палитра пород, по центру холст с инспекторами, справа параметры / метр / экспорт / диагностики. Средняя колонка обязана нести `min-w-0 overflow-auto`. Ниже `lg` - одна колонка в порядке холст → палитра → параметры → метр → экспорт → диагностики. Полноширинные вкладки (`templates`, `generate`, `photo`, `view3d`) логику раскладки не меняют.

Фон страницы `bg-app`, шапка на всю ширину вне `max-w-7xl`-контейнера, контент внутри `mx-auto max-w-[1440px] px-4 py-4`.

**Шаги.**
1. `grep -rn "app.tagline\|history.undo\|history.redo" components e2e` - зафиксировать, что можно прятать.
2. Собрать шапку в `StudioShell.tsx` (новый внутренний блок или отдельный `<header>` прямо там, новых файлов не плодим).
3. Переписать `StudioTabs.tsx` с собственными кнопками вместо `Button variant`.
4. Переписать `LocaleToggle.tsx` и `HistoryControls.tsx` под сегмент/ghost-иконки; `useEffect` с `document.documentElement.lang` и хоткеи undo/redo не трогать.
5. Перенести сегмент единиц из `BoardSettings.tsx` в шапку.
6. Обновить трёхколоночную сетку в `StudioShell.tsx`.
7. Поправить `BoardSettings.test.tsx` (кейс с единицами уезжает в `StudioShell.test.tsx`).

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm test:e2e e2e/editor.spec.ts e2e/templates.spec.ts`.

---

## Задача 4. Холст доски и палитра пород

**Файлы:** `components/BoardCanvas.tsx`, `components/BoardSvg.tsx`, `components/SpeciesPalette.tsx` и их тесты.

**Спека холста (README «Холст доски»).**
- Контейнер вокруг `BoardCanvas` в `StudioShell`: `bg-canvas p-[22px] flex items-center justify-center overflow-auto min-w-0 rounded-lg`.
- Подложка доски: обёртка вокруг `<svg>` - `bg-surface p-1.5 rounded-xs shadow-md inline-block`. Именно она видна в зазорах между ячейками.
- Клеевой зазор 2px. У нас доска рисуется в SVG в мм-координатах, а не CSS-гридом, поэтому 2px переводим в мм: `gapMm = 2 / layout.scale`, и каждый `<rect>` ужимаем на `gapMm/2` с каждой стороны (`x + g/2`, `y + g/2`, `width - g`, `height - g`, оба размера через `Math.max(0, …)`). Ячейки без радиуса. `fill` берётся из `speciesHex()` **без изменений** - e2e сверяют атрибут `fill` побайтно.
  - Страховка: если ужатие ломает `BoardSvg.test.tsx` или `layout.test.ts`, откатиться на вариант «зазора нет, вместо него `stroke="var(--cell-outline)" strokeWidth={0.4}`». `lib/render2d/layout.ts` и `lib/export/*` в этой задаче не трогаем ни в каком случае: экспорт остаётся пиксель-в-пиксель прежним.
- Выделение: вместо `stroke="#111111"` использовать `stroke="var(--selection)"` и `strokeWidth` 2px в экранных единицах (`2 / layout.scale`), без сдвига layout.
- Номера рядов: колонка слева шириной 20px, `font-mono` 10px, `fill="var(--text-muted)"`, выравнивание по правому краю (`textAnchor="end"`). `data-testid="row-label"` сохранить.
- Подпись под доской: новая строка `font-mono text-[11px] text-ink-muted tabular-nums`, формат из README «14 полос × 10 рядов · 320 × 240 мм». Новых i18n-ключей не заводим: собираем из уже существующих `board.size` / `templates.size` либо (проще и честнее) из чистых цифр и разделителей `×` и `·`, которые в переводе не нуждаются. Добавить `data-testid="board-caption"`.

**Спека палитры (README «Палитра пород»).**
- Заголовок панели: caption + счётчик пород `font-mono text-[11px] text-accent`.
- Сетка: `grid grid-cols-4 gap-1.5`, свотч `aspect-square rounded-[5px]`, обводка `box-shadow: inset 0 0 0 1px var(--cell-outline)`, hover `scale-[1.06] duration-hover ease-out`.
- Активный свотч: `box-shadow: inset 0 0 0 2px var(--surface), 0 0 0 2px var(--selection)` - светлое кольцо между акцентом и цветом породы. Реализовать через inline-`style.boxShadow` (значение зависит от состояния, arbitrary-класс тут читается хуже).
- Карточка активной кисти под сеткой: `bg-surface border border-line-subtle rounded-md px-2.5 py-2 flex items-center gap-2`, квадрат породы `size-5 rounded-xs`, название `text-[13px] font-medium`, подпись «активная кисть» `text-[11px] text-ink-muted` (взять из уже существующего ключа `palette.brush`).
- `data-testid="species-*"`, `aria-pressed`, `aria-label`, `title`, `data-used` сохранить дословно. Галочка «порода уже в деле» остаётся, перекрасить в `bg-surface text-ink`.
- Строки `palette.inDesign` и `palette.hint` перенести под карточку кисти как `text-[11px] text-ink-muted`, тексты не менять.

**Шаги.**
1. `BoardSvg.tsx`: зазоры, токенное выделение, стилизация номеров рядов.
2. `BoardCanvas.tsx`: подложка + фон холста + строка-подпись.
3. `SpeciesPalette.tsx`: 4-колоночная сетка, кольца, карточка активной кисти.
4. Обновить `BoardSvg.test.tsx`, `BoardCanvas.test.tsx`, `SpeciesPalette.test.tsx` под новые размеры, оставив нативные проверки `fill`.

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm test:e2e e2e/editor.spec.ts e2e/templates.spec.ts e2e/export.spec.ts` (экспорт обязателен: он делит `BoardSvg`-семантику с экраном).

---

## Задача 5. Инспекторы, параметры доски, метр сложности, диагностики, экспорт

**Файлы:** `components/PanelInspector.tsx`, `components/RowInspector.tsx`, `components/BoardSettings.tsx`, `components/ComplexityMeter.tsx`, `components/DiagnosticsPanel.tsx`, `components/ExportPanel.tsx` и их тесты.

**Инспекторы (README «Инспекторы»).** Строка списка: `grid grid-cols-[88px_1fr_120px_120px_96px] gap-3 px-2.5 py-2 rounded-md`, обычная `bg-surface border border-line-subtle`, выделенная `bg-accent-soft border border-accent-border`. На узких ширинах строка деградирует в `flex flex-wrap` (класс `max-lg:flex max-lg:flex-wrap`), иначе 88px-колонка на 375px раздавит поля.
- Превью ряда: миниатюры ячеек `size-4 rounded-[2px] gap-0.5` (только в `RowInspector`, только если данные уже есть; не строить новых вычислений).
- Числовые поля: `<NumberFieldMm size="dense" />` (30px).
- Кнопки действий: `size-7` ghost, иконка 15px `strokeWidth={1.6}`. Сдвиг вверх/вниз - `ChevronUp`/`ChevronDown`, hover `hover:bg-app hover:text-ink`. Удалить - `Trash2`, hover `hover:bg-error-soft hover:text-error`. Разрез - `Scissors`. Добавить - `Plus`. Все `aria-label` и `data-testid` (`*-up`, `*-down`, `*-remove`, `*-add`, `*-split`) сохранить дословно; текстовые заглушки `'<'`, `'>'`, `'^'`, `'v'` заменяются иконками, поэтому у кнопок обязан быть `aria-label` (у `-add`, `-remove`, `-split` в `RowInspector`/`PanelInspector` его сейчас нет там, где текст был подписью, - добавить).
- Действия панели над списком: primary «Добавить ряд» и secondary «Разрезать», высота 30px (`size="sm"`).
- `<select>` пород и панелей: `h-[30px] rounded-sm border border-line bg-surface-raised px-2 text-sm` - тот же вид, что у числового поля.

**Параметры доски.** Сетка полей `grid grid-cols-2 gap-2 sm:grid-cols-3` остаётся, все поля переводятся на `size="compact"` (34px) и получают `suffix` из существующих ключей `units.mm`/`units.in`. Поле имени - тот же контейнер, что у числового, но `font-sans`. Кнопка «Скопировать ссылку» - secondary `size="sm"`; строка `share.copied` - `text-[11px] text-ink-muted`.

**Метр сложности (README «Метр сложности»).** Карточка `bg-surface border border-line-subtle rounded-lg p-3.5`. Внутри `grid grid-cols-2 gap-x-2.5 gap-y-3`:
- ячейка: подпись `text-[11px] text-ink-muted`, значение `font-mono text-xl leading-6 font-medium tabular-nums`, единица `font-mono text-[11px] text-ink-muted` на общей базовой линии (`flex items-baseline gap-1`);
- значение вне допустимого диапазона окрашивается в `text-warning`. Единственный критерий, который у нас уже посчитан и не требует новой логики: `calc.wastePct` (в макете подсвечены отходы 18%). Порог берём из уже существующей диагностики отходов, а если её нет - оставляем подсветку выключенной и фиксируем это в отчёте. Новых правил валидации не изобретаем;
- итог себестоимости отделён `border-t border-line-subtle pt-3`: слева подпись `text-[13px] text-ink-secondary`, справа `font-mono text-[28px] leading-8 font-semibold tabular-nums`;
- строка `board.size` («Габарит: …») остаётся отдельным `<p>` одним текстовым узлом - на ней держатся `getByText(/Габарит: 60/)` и `getByText(/Габарит: 2\.36"/)`;
- блок «по породам» и дублирующий список диагностик внутри метра оставить, но привести к `text-[11px] text-ink-muted` и `font-mono tabular-nums` для чисел.

**Диагностики (README «Панель диагностик»).** Вертикальный список `flex flex-col gap-2`. Строка: `flex gap-[9px] px-3 py-[11px] rounded-md border`.
- warning: `bg-warning-soft border-warning-border`, иконка `AlertTriangle` `text-warning`, заголовок `text-warning-text`;
- error: `bg-error-soft border-error-border`, иконка `AlertCircle` `text-error`, заголовок `text-error-text`;
- success (когда `diagnostics.length === 0`): `bg-success-soft border-success-border`, иконка `CheckCircle2` `text-success`, заголовок `text-success-text`, текст берём из существующего ключа `diagnostics.none` - вместо нынешнего `<Badge>`;
- заголовок `text-[13px] font-semibold`, описание `text-[13px] leading-[1.45] text-ink-secondary`, иконка `size-4 strokeWidth={1.6} shrink-0 mt-px`;
- `data-testid="diagnostics-list"`, `data-testid="diagnostics-counts"`, `data-level` сохранить дословно.

**Экспорт.** Карточка в том же ключе; четыре кнопки secondary `size="sm"` в `flex flex-wrap gap-2`, testid `export-png|svg|csv|pdf` и `disabled` при `busy` сохранить. Ошибка `export-error` переводится с `text-red-600` на строку-диагностику варианта error (`bg-error-soft border-error-border text-error-text`), `role="alert"` и testid остаются.

**Шаги.**
1. `DiagnosticsPanel.tsx` (самый маленький, задаёт язык статусов) → `ExportPanel.tsx`.
2. `ComplexityMeter.tsx`.
3. `BoardSettings.tsx` (после того, как в задаче 3 из него ушли единицы).
4. `RowInspector.tsx`, затем `PanelInspector.tsx`.
5. Обновить пять тестовых файлов: иконки вместо текста означают проверку по `aria-label`, а не по `getByText('^')`.

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm test:e2e e2e/editor.spec.ts e2e/export.spec.ts`.

---

## Задача 6. Полноширинные вкладки и диалоги

**Файлы:** `components/TemplateGallery.tsx`, `components/GeneratorPanel.tsx`, `components/PhotoImport.tsx`, `components/Board3DPanel.tsx`, `components/ConfirmReplace.tsx`, `components/ForkDialog.tsx` и их тесты.

**Галерея шаблонов (README «Галерея шаблонов»).** Сетка `grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]`. Карточка: `bg-surface-raised border border-line-subtle rounded-lg overflow-hidden shadow-sm`, hover `hover:shadow-md hover:border-accent-border duration-hover ease-out`, выбранная - `border-accent-border` постоянно.
- превью: `bg-surface-panel p-2.5`, ячейки без радиуса;
- подвал: `px-3 py-2.5 border-t border-line-subtle`, название `text-sm font-semibold`, бейдж числа пород `<Badge>` (`bg-surface-sunken rounded-full px-[7px] py-0.5 font-mono text-[10px] text-ink-secondary`), метаданные размера `font-mono text-[10px] text-ink-muted tabular-nums`;
- `data-testid="template-*"` и `data-testid="template-gallery"` сохранить; заголовки групп - caption-стиль.

**Генератор (README «Генератор»).**
- Кнопки семейств: пилюли `px-2.5 py-1 rounded-full text-xs transition-colors duration-hover`, неактивная `bg-surface-sunken text-ink-secondary font-medium`, активная `bg-accent-soft text-accent font-semibold`. testid `gen-family-*` и `aria-pressed` сохранить.
- Сетка превью: `grid grid-cols-3 gap-2` (на мобиле `grid-cols-2`), карточка `aspect-square rounded-md border border-line-subtle`, внутри превью на `bg-surface-panel p-1 gap-px`, выбранный вариант `border-accent`. testid `gen-card-N` остаётся на `<li>`; e2e сравнивают `innerHTML` карточки, поэтому внутрь `gen-card-N` не добавлять ничего, что меняется между рендерами (никаких случайных id, `key`-суффиксов, дат).
- Звезда избранного: круг `size-5` в правом верхнем углу карточки, `bg-[rgba(251,249,245,0.92)]`, иконка `Star` 12px. Не в избранном - `stroke text-ink-muted fill-none`; в избранном - `fill-[#D9B31A] text-warning`. testid `gen-fav-N` и `aria-pressed` сохранить (кнопка «Применить» `gen-apply-N` остаётся отдельной).
- Ползунки cols/rows/density и счётчик `gen-generation`: подпись `text-[13px] text-ink-secondary`, значение `font-mono text-xs tabular-nums`.
- Кнопки внизу: primary «Сгенерировать 9» на всю ширину (у нас это `gen-shuffle`, ярлык не меняем) и secondary «Эволюция» (`gen-evolve`).

**Импорт фото (README «Импорт фото»).**
- Дроп-зона: `border-[1.5px] border-dashed border-line-strong rounded-lg bg-surface-sunken p-[26px] flex flex-col items-center gap-2 text-center`, иконка `ImagePlus` 26px `text-ink-muted`, заголовок `text-sm font-semibold`, подпись `text-xs text-ink-muted`. Состояние перетаскивания: `border-accent bg-accent-soft` через локальный `useState<boolean>` на `onDragEnter`/`onDragLeave`. Это единственное новое состояние во всей фазе, оно чисто визуальное, живёт в компоненте и не касается стора.
- Ползунки: подпись `text-[13px] text-ink-secondary` слева, значение `font-mono text-xs tabular-nums` справа. Дорожка 4px `rounded-full bg-surface-sunken`, заполнение `bg-accent`, ручка `size-3.5 bg-surface-raised border-[1.5px] border-accent shadow-sm`, focus `shadow-focus`. Стилизовать нативный `<input type="range">` через `[&::-webkit-slider-thumb]` / `[&::-moz-range-thumb]`; **`type="range"`, `min`, `max`, `step`, `value` и testid `photo-colors`/`photo-panels` не менять** - e2e двигают их через `fill()`.
- `photo-error` перевести на диагностику варианта error, `role="alert"` и testid сохранить.

**3D-панель.** Контейнер `rounded-lg border border-line-subtle bg-surface-panel overflow-hidden`, скелет и `view3d-unsupported` - `text-[13px] text-ink-muted` на `bg-surface-panel`, предупреждение об усечении - строка-диагностика варианта warning. testid `view3d`, `view3d-loading`, `view3d-unsupported` сохранить.

**Диалоги (README «Диалог подтверждения»).** Оба диалога получают одинаковую оболочку:
- подложка `fixed inset-0 z-50 bg-[var(--overlay)] flex items-center justify-center p-4`;
- окно `bg-surface rounded-lg shadow-dialog p-5 max-w-[380px] w-full flex flex-col gap-3`;
- заголовок `font-display text-lg font-semibold`, текст `text-sm leading-normal text-ink-secondary`;
- кнопки справа внизу `flex justify-end gap-2`: ghost «Отмена» и primary (или destructive там, где действие разрушительное - у нас замена документа, оставляем primary как в макете).
- **Важно:** `ConfirmReplace` сейчас рендерится как всплывашка снизу (`fixed inset-x-4 bottom-4`) без подложки. Переводим на центрированную с подложкой, но `data-testid={testId + '-confirm-dialog'}` обязан остаться на том же элементе с `role="dialog"` и `aria-modal`, потому что e2e ждут `toBeVisible`/`toBeHidden` именно на нём, а клики по `template-cancel` / `generator-confirm` не должны перехватываться подложкой (подложка ниже по z-index или `pointer-events-none` на ней и `pointer-events-auto` на окне).
- `ForkDialog`: `fork-dialog`, `fork-cancel`, `fork-confirm`, `fork-glueups`, `fork-cuts`, `fork-lumber` сохранить, числа в списке - `font-mono tabular-nums`. Обработчик Escape не трогать.

**Шаги.**
1. `ConfirmReplace.tsx` + `ForkDialog.tsx` (общая оболочка первой, от неё зависят три вкладки).
2. `TemplateGallery.tsx`.
3. `GeneratorPanel.tsx`.
4. `PhotoImport.tsx`.
5. `Board3DPanel.tsx`.
6. Обновить тесты шести компонентов.

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm test:e2e` (весь набор: `templates`, `generate`, `photo`, `view3d`, `editor`, `export`).

---

## Задача 7. Верификация: полный e2e плюс визуальный смоук

**Файлы:** `e2e/visual.spec.ts` (новый), при необходимости `playwright.config.ts`.

**Что уже есть.** 32 e2e-теста в шести спеках (`editor` 4, `export` 7, `generate` 8, `photo` 7, `templates` 3, `view3d` 3). Все обязаны остаться зелёными без правок селекторов. Если какой-то спек пришлось править - это баг рестайла, а не тест: чинить компонент.

**Новый спек `e2e/visual.spec.ts`.** Не пиксельный diff (`toHaveScreenshot` даст флаки на разных машинах и на подгрузке Google Fonts). Вместо этого:

1. **Скриншоты-артефакты.** Для каждой из пяти вкладок (`editor`, `templates`, `generate`, `photo`, `view3d`) при 1280×900 и 375×812: `await page.screenshot({ path: `test-results/visual/${tab}-${width}.png`, fullPage: true })`. Это артефакт для глазами-ревью, никаких ассертов на нём.
2. **Ассерты вычисленных стилей** (устойчивые, машинонезависимые):
   - шапка: `await expect(page.getByTestId('app-header')).toHaveCSS('min-height', '56px')` и `toHaveCSS('background-color', 'rgb(251, 249, 245)')`;
   - активная вкладка: `await expect(page.getByTestId('tab-editor')).toHaveCSS('background-color', 'rgb(220, 234, 231)')` и `toHaveCSS('color', 'rgb(20, 97, 90)')`; неактивная `tab-photo` - не `rgb(220, 234, 231)`;
   - холст: контейнер вокруг `board-canvas` даёт `background-color: rgb(233, 227, 216)`;
   - моноширинность метрики: `const ff = await page.getByTestId('board-caption').evaluate((el) => getComputedStyle(el).fontFamily); expect(ff).toContain('JetBrains')` плюс `getComputedStyle(el).fontVariantNumeric` содержит `tabular-nums`;
   - числовое поле: `await expect(page.getByTestId('board-thickness')).toHaveCSS('font-family', /JetBrains/)`;
   - body: `font-family` содержит `Golos`;
   - заголовок продукта в шапке: `font-family` содержит `Bitter`.
3. **Отсутствие горизонтального скролла на 375px:** `expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)` на каждой вкладке. Это ловит именно ту поломку, от которой README предупреждает («средняя колонка обязана иметь min-width: 0»).
4. **Мобильный viewport** ставится через `page.setViewportSize({ width: 375, height: 812 })` внутри теста - отдельный проект в `playwright.config.ts` не заводим, чтобы не удваивать время сборки.

Каждый тест начинается с `await page.addInitScript(() => window.localStorage.clear()); await page.goto('/'); await expect(page.getByTestId('board-canvas')).toBeVisible()` - тот же `openStudio`, что в существующих спеках.

Шрифты грузятся через `next/font/google`, то есть self-hosted на сборке: сети в рантайме не требуется, ассерты на `font-family` детерминированы. Если в CI всё же всплывёт гонка загрузки, добавить `await page.evaluate(() => document.fonts.ready)` перед ассертами шрифтов.

**Шаги.**
1. Написать `e2e/visual.spec.ts` (5 вкладок × 2 ширины + блок ассертов стилей).
2. Прогнать полный `pnpm test:e2e` и убедиться, что зелёные все 32 старых теста плюс новые.
3. Открыть скриншоты из `test-results/visual/` и сверить глазами с `Endgrain Design System.dc.html`.
4. Финальный прогон `pnpm build` - `next build` ловит то, чего не ловит `tsc --noEmit` (например, `next/font` в клиентском компоненте).

**Проверки.** `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `pnpm test:e2e` (весь набор, ноль падений).

---

## Самопроверка покрытия README

| Раздел README | Задача |
|---|---|
| Design Tokens (globals.css) | 1 |
| Typography (Bitter / Golos / JetBrains, 11 стилей) | 1 |
| Шапка приложения (56px, вкладки, сегменты, undo/redo, разделители) | 3 |
| Холст доски (bg-canvas, подложка, зазор 2px, номера рядов, подпись) | 4 |
| Палитра пород (4 колонки, кольца, карточка кисти, счётчик) | 4 |
| Инспекторы (grid-строки, превью ряда, ghost-действия, destructive hover) | 5 |
| Числовое поле (36/34/30, mono, суффикс, focus, disabled) | 2 |
| Метр сложности (2 колонки, warning, итог себестоимости) | 5 |
| Панель диагностик (warning / error / success) | 5 |
| Галерея шаблонов (карточки, бейдж, hover) | 6 |
| Генератор (пилюли, сетка 3×3, звезда избранного) | 6 |
| Импорт фото (дроп-зона, drag-состояние, ползунки) | 6 |
| Диалог подтверждения (overlay, shadow-dialog) | 6 |
| Кнопки (4 варианта × 5 состояний) | 2 |
| Interactions & Behavior (длительности, ease-out) | 1 (токены) + 2, 3, 4, 6 (применение) |
| Респонсив (три колонки, min-width: 0, flex-wrap шапки) | 3, проверяется в 7 |
| State Management | ничего не меняем: всё перечисленное уже в сторе |
| Assets (иконки lucide 15-16px, stroke 1.6) | 2, 3, 5, 6 |

Выдуманных токенов нет. Пять сырых значений (`#C7D8D5`, `#8C2820`, `#731F19`, `rgba(20,97,90,0.28)`, `rgba(166,51,40,0.24)`) и `rgba(251,249,245,0.92)` со звезды взяты дословно из README и живут строго в двух местах (`buttonVariants`, звезда генератора), потому что в handoff `globals.css` для них переменных нет.

## Риски

1. **Клеевой зазор в SVG.** Самое хрупкое место фазы: доска рисуется в мм-координатах, а зазор задан в px. Ужатие `<rect>` может задеть `BoardSvg.test.tsx` и косвенно экспорт. Митигация: `lib/render2d/layout.ts` и `lib/export/*` не трогаем, при первых же красных тестах откатываемся на hairline-обводку `--cell-outline`.
2. **Иконки вместо текста в кнопках.** Юнит-тесты и e2e местами кликают по видимому тексту. Перед каждой заменой текста иконкой - grep по `components/*.test.tsx` и `e2e/*.spec.ts`, и обязательный `aria-label` на кнопке.
3. **Переезд сегмента единиц в шапку.** Два элемента с `data-testid="unit-in"` уронят Playwright strict mode. Группа должна остаться ровно одна.
4. **Диалоги с подложкой.** Новая `fixed inset-0` подложка может перехватывать клики по `*-cancel` / `*-confirm`. Проверять на `templates.spec.ts` и `generate.spec.ts`, там сценарии «отмена, потом подтверждение».
5. **Трёхколоночная сетка на 375px.** Фиксированная ширина доски выдавит боковые панели, если потерять `min-w-0`. Ловится ассертом на `scrollWidth` в задаче 7.
6. **`getByText(/Габарит: 60/)`.** Строка `board.size` не должна разъехаться по нескольким узлам при рестайле метра сложности.
7. **Коллизия `--accent`** shadcn против handoff. Разрулено на уровне задачи 1, но если появится новый shadcn-компонент с `bg-accent`, он приедет тиловым. При каждом `npx shadcn add` проверять диф.
8. **Параллельная работа.** По репозиторию сейчас коммитит другой агент. Перед стартом фазы 6 сделать `git pull`/`git status` и убедиться, что дерево чистое, иначе конфликты в `components/*.tsx` неизбежны.
