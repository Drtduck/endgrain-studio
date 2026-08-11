# Портирование фич из bets-supa

Источник: /Users/drtloki/Desktop/Актуальное/Code/WB/bets-supa (монорепо, фронт в apps/web: Next.js 15, React 19, Tailwind 3.4 + shadcn/ui, @supabase/ssr 0.10.3 + supabase-js 2.45, react-hook-form + zod, @octokit/rest, html2canvas; миграции в supabase/migrations/*.sql, типы через supabase gen types).

## Фича 1: кнопка «Предложить доработку» (feedback)

- Вход: apps/web/components/feedback/feedback-button.tsx (client), глобально в app/(app)/layout.tsx, фиксированный угол top-1.5 right-4. Анимированная иконка-робот: components/feedback/dancing-robot.tsx, иконка components/ui/icons/claude.tsx.
- UI: Radix Popover, textarea (лимит 2000), прикрепление файла (до 2 МБ), paste-картинка из буфера, рядом HelpHint id="feedback".
- Собирает: текст, route/url, userAgent, viewport, последние 25 действий из ActionTracker (sessionStorage, ключ feedback_actions_v1), вложение base64, скриншот через динамический html2canvas (игнорирует data-feedback-ui).
- Сабмит: server action app/actions/feedback.ts (submitFeedback), zod-валидация, требует авторизованного юзера. Вложения в приватный bucket feedback-attachments (signed URL 30 дней). Основной канал: GitHub issue через Octokit (GITHUB_REPORT_TOKEN, лейблы feedback/user-report). Telegram-уведомление через pgmq RPC enqueue_feedback_notification с fallback на Bot API (TELEGRAM_BOT_TOKEN, TELEGRAM_FEEDBACK_CHAT_ID).
- Вспомогательное: lib/feedback/action-tracker.ts (кольцевой буфер), lib/feedback/format.ts (title/body issue), lib/feedback/enqueue-error.ts, components/feedback/action-tracker-provider.tsx.
- Порт: UI-ядро (feedback-button, dancing-robot, action-tracker, provider) переносится почти as-is; submitFeedback переписать под наш канал; тексты в t() ru/en.

## Фича 2: контекстные подсказки (HelpHint)

- Компонент: apps/web/components/ui/help-hint.tsx - HelpHint({id, side, className}), иконка CircleHelp (lucide). Рендер: Radix Popover (короткая справка) или Dialog (длинная), выбор через variant записи.
- Тексты: реестр TS/TSX-файлов apps/web/lib/help/<name>.tsx (~250 шт.), тип HelpEntry в lib/help/types.ts (id, variant, title, intro?, body: ReactNode, externalLink?), агрегатор lib/help/index.ts (ENTRIES, HELP_REGISTRY, getHelp(id) с console.warn).
- Порт: HelpHint + структуру реестра берём, но body/title заменяем на ключи нашего t(locale, key) словаря ru/en. Библиотеку из 250 WB-подсказок не тащим, пишем свои по разделам Endgrain.

## Фича 3: Supabase auth

- Клиенты: lib/supabase/browser.ts (createBrowserClient, синглтон), server.ts (createServerClient + cookies, async), service.ts (service-role), session.ts (getCurrentUser через React cache()), middleware.ts (updateSession, ручной перенос куки carryCookies).
- Флоу: login (signInWithPassword + Google OAuth), forgot-password (resetPasswordForEmail -> /auth/callback?next=/reset-password), reset-password (getSession -> updateUser({password}), минимум 8 символов), app/auth/callback/route.ts (exchangeCodeForSession). Регистрация в bets-supa только по инвайтам; нам нужен открытый signup (email+password) - добавить.
- Защита: корневой middleware.ts -> updateSession; неавторизованных на /login (кроме auth-роутов); их RBAC/access-резолвер НЕ тащим, только базовая проверка сессии.
- Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
- Креды Supabase-проекта Стас выдаст позже: до этого моки/заглушки, код готов к подключению.

## Гэпы ресерча

dancing-robot.tsx и claude.tsx не дочитаны (анимация), lib/feedback/format.ts частично, инвайт-флоу и детальная схема RLS не осмотрены (нам и не нужны).
