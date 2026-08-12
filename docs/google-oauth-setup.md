# Настройка входа через Google

Код на стороне приложения уже готов: кнопка «Войти через Google» появляется на `/login` и `/register`, а `app/auth/callback/route.ts` принимает код от Supabase. Осталось руками подключить сам OAuth-провайдер в Google Cloud и в Supabase. Инструкция ниже - пошаговая, с точными ссылками и значениями под этот проект.

## 1. Google Cloud Console

1. Откройте [console.cloud.google.com](https://console.cloud.google.com/) и создайте новый проект (или выберите существующий), если под Endgrain Studio его ещё нет.
2. Перейдите в **APIs & Services -> OAuth consent screen**.
   - User type: **External**.
   - App name: `Endgrain Studio`.
   - User support email: ваша почта.
   - Authorized domain: `endgrain.app`.
   - Developer contact email: ваша почта.
   - Остальные поля (логотип, ссылки на политику) можно пропустить для старта - без них экран согласия покажет предупреждение «unverified app», это не блокирует вход (см. раздел «Частые ошибки» ниже).
3. Перейдите в **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Endgrain Studio Web` (произвольно, только для вас).
   - **Authorized JavaScript origins** - добавьте все три:
     - `https://app.endgrain.app`
     - `https://endgrain.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs** - добавьте ровно один адрес, это callback самого Supabase (не вашего приложения):
     - `https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/callback`
4. Нажмите **Create**. Google покажет **Client ID** и **Client Secret** - скопируйте оба, они понадобятся на следующем шаге.

## 2. Supabase Dashboard

1. Откройте [Auth Providers проекта](https://supabase.com/dashboard/project/fusexddgetnyadxnyaqz/auth/providers).
2. Найдите **Google** в списке провайдеров, включите тумблер **Enable**.
3. Вставьте **Client ID** и **Client Secret** из шага 1.4.
4. Сохраните.

## 3. Supabase URL Configuration

1. Откройте [URL Configuration проекта](https://supabase.com/dashboard/project/fusexddgetnyadxnyaqz/auth/url-configuration).
2. **Site URL**: `https://app.endgrain.app`.
3. **Redirect URLs** - добавьте все, по одному на строку:
   - `https://app.endgrain.app/auth/callback`
   - `https://endgrain.app/auth/callback`
   - `https://endgrain-studio.vercel.app/auth/callback`
   - `https://endgrain-studio-*.vercel.app/**`
   - `http://localhost:3000/**`
4. Сохраните.

## Как проверить, что заработало

1. Локально: `pnpm dev`, откройте `http://localhost:3000/login`, нажмите «Войти через Google».
2. Должен открыться экран выбора Google-аккаунта (возможно, с пометкой «This app isn't verified» - см. ниже), после согласия браузер вернётся на `/auth/callback?code=...` и тут же редиректом уйдёт на `/`.
3. Проверьте, что в шапке появился авторизованный статус (кнопка «Выйти» вместо «Войти»).
4. Повторите на проде (`https://app.endgrain.app/login`) после деплоя переменных окружения Supabase (они уже в проекте, новых переменных для Google не требуется - ключи хранятся в Supabase, а не в Vercel).
5. Проверьте гео-скрытие: с IP из РФ кнопка Google не должна отрисовываться вовсе (это косметическая мера, сам вход через Google при этом не запрещён - можно дойти по прямой ссылке `/login` и увидеть обычную форму почта/пароль). Список скрытых стран задаётся в `lib/auth/geo.ts` (`GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT`, сейчас только `RU`) и может быть переопределён переменной окружения `NEXT_PUBLIC_GOOGLE_AUTH_HIDDEN_COUNTRIES` (страны через запятую, например `RU,BY`).

## Частые ошибки

- **`redirect_uri_mismatch`** - Google ругается, что redirect URI не совпадает ни с одним из разрешённых. Проверьте, что в Google Cloud Console в Authorized redirect URIs указан именно `https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/callback` (без слэша на конце, без опечаток в project ref). Это единственный redirect URI, который видит Google - он ведёт в Supabase, а не в ваше приложение.
- **Redirect после входа уводит не туда / отброшенный `redirectTo`** - Supabase учитывает `redirectTo` только если он совпадает с одним из адресов в Redirect URLs (шаг 3). Если адрес там не перечислен, Supabase молча подставит Site URL. Добавьте недостающий адрес в список (в том числе wildcard для preview-деплоев Vercel).
- **Экран «This app isn't verified»** - нормально для приложения без пройденной верификации Google (она нужна только при большом трафике или чувствительных scope). Пользователь может нажать «Advanced -> Go to Endgrain Studio (unsafe)» и продолжить - это не блокирует вход, просто предупреждение.
- **Кнопка Google не появляется вообще** - либо не заданы `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (проверьте `lib/supabase/config.ts`), либо запрос пришёл из страны в списке скрытых (см. раздел про гео-скрытие выше) - это ожидаемое поведение, а не баг.
- **`invalid_client` / `unauthorized_client`** - Client ID или Client Secret в Supabase не совпадают с тем, что выдал Google, или провайдер Google не включён (шаг 2.2).
