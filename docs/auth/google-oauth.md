# Вход через Google: настройка и политика одной почты

Документ заменяет `docs/google-oauth-setup.md` (та инструкция короче и не разбирает конфликт identity). Здесь всё, что нужно, чтобы включить Google-вход, плюс решение по ситуации «на одну почту есть и пароль, и Google».

## Состояние на 13 августа 2026 (проверено)

Код на стороне приложения уже написан и задеплоен, руками осталось только подключить провайдера.

| Что | Состояние | Где проверено |
| --- | --- | --- |
| Кнопка «Войти через Google» в форме | Готово | `components/auth/AuthForm.tsx:210-230` |
| `signInWithOAuth` с корректным `redirectTo` | Готово | `components/auth/AuthForm.tsx:91-107` |
| Route `/auth/callback` с `exchangeCodeForSession` | Готово | `app/auth/callback/route.ts` |
| Гео-скрытие кнопки для RU | Готово | `lib/auth/googleAuth.ts`, `lib/auth/geo.ts` |
| Cookie-домен `.endgrain.app` для двух хостов | Готово | `lib/supabase/cookies.ts`, `lib/routing/cookieDomain.ts` |
| Провайдер Google в Supabase | **Выключен** (`external.google: false`) | `GET https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/settings` |
| Подтверждение email | **Включено** (`mailer_autoconfirm: false`), это важно для безопасности | там же |
| Реальные identity в базе | только `email`, 3 штуки, ни одной `google` | `select provider, count(*) from auth.identities` |

Supabase project ref: `fusexddgetnyadxnyaqz`, регион us-east-2.

## 1. Google Cloud Console

1. Откройте [console.cloud.google.com](https://console.cloud.google.com/), создайте проект `Endgrain App` или выберите существующий.
2. **APIs & Services -> OAuth consent screen** (в новом интерфейсе это раздел **Google Auth Platform -> Branding / Audience**):
   - User type / Audience: **External**.
   - App name: `Endgrain App`.
   - User support email: `drtloki@gmail.com`.
   - App logo: можно пропустить (логотип требует верификации приложения, а она нам пока не нужна).
   - Authorized domains: `endgrain.app` и `supabase.co`. Второй домен обязателен, потому что redirect URI ведёт именно туда.
   - Developer contact email: `drtloki@gmail.com`.
   - Scopes: только базовые, ничего добавлять не надо. Supabase просит `email`, `profile`, `openid` - это non-sensitive scopes, верификация Google для них не требуется.
   - Publishing status: пока приложение в **Testing**, войти смогут только аккаунты из списка Test users (максимум 100). Для прода нажмите **Publish app** и переведите в **In production**. С non-sensitive scopes это происходит сразу, без ревью Google.
3. **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Endgrain App Web` (видно только вам).
   - **Authorized JavaScript origins** (откуда стартует запрос):
     - `https://app.endgrain.app`
     - `https://endgrain.app`
     - `https://endgrain-studio.vercel.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs** - ровно один адрес, это callback Supabase, а не приложения:
     - `https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/callback`
4. **Create**. Скопируйте **Client ID** и **Client secret**.

Почему redirect URI один. Google возвращает код не в приложение, а в Supabase. Supabase меняет его на свой код и уже своим редиректом отправляет браузер на `redirectTo` из `signInWithOAuth`. Поэтому адреса вида `https://app.endgrain.app/auth/callback` в Google Cloud указывать не нужно вообще, они живут в allowlist Supabase (шаг 2). Preview-деплои Vercel по той же причине не требуют новых записей в Google: их адреса Google не видит.

Wildcard в Authorized redirect URIs Google не поддерживает, а в JavaScript origins он не нужен, потому что `signInWithOAuth` уводит браузер полной навигацией и origin в проверке не участвует. Если preview-домены Vercel всё-таки начнут ругаться, добавляйте конкретный адрес деплоя руками либо тестируйте Google-вход только на проде и localhost.

## 2. Supabase Dashboard

### Провайдер

1. [Auth -> Providers](https://supabase.com/dashboard/project/fusexddgetnyadxnyaqz/auth/providers), найдите **Google**.
2. Включите **Enable Sign in with Google**.
3. **Client IDs**: вставьте Client ID из Google.
4. **Client Secret (for OAuth)**: вставьте Client secret.
5. **Skip nonce checks**: оставьте выключенным.
6. Callback URL под полями должен совпасть с тем, что вы вписали в Google: `https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/callback`.
7. Save.

### URL Configuration

[Auth -> URL Configuration](https://supabase.com/dashboard/project/fusexddgetnyadxnyaqz/auth/url-configuration):

- **Site URL**: `https://app.endgrain.app`. Это фолбэк: если `redirectTo` не совпал ни с одной строкой allowlist, Supabase молча подставит сюда.
- **Redirect URLs** (сейчас в проекте не хватает двух последних строк):
  - `https://app.endgrain.app/auth/callback`
  - `https://endgrain.app/auth/callback`
  - `https://endgrain-studio.vercel.app/auth/callback`
  - `https://endgrain-studio-*.vercel.app/**`
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3100/auth/callback` (нужен e2e-прогонам, уже есть)

Про wildcard. Supabase матчит эти шаблоны глобом: `*` не проходит через точку, `**` проходит. Для preview-деплоев Vercel поэтому нужны обе звёздочки в пути (`/**`), иначе `?next=` в query собьёт совпадение.

### Что менять не надо

- **Confirm email** остаётся включённым. Это не косметика, а несущая часть защиты от захвата аккаунта, разбор в разделе 4.
- **Allow manual linking** (`security_manual_linking_enabled`) пока не включаем: методы `linkIdentity`/`unlinkIdentity` в коде не используются. Включим, когда появится страница настроек аккаунта с кнопкой «Привязать Google».

## 3. Код

Менять ничего не нужно, всё уже на месте. Ниже - карта, что где лежит, на случай доработок.

**`components/auth/AuthForm.tsx`** - кнопка и запуск OAuth. Ключевое место:

```ts
const { error: oauthError } = await sb.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${originBase()}/auth/callback?next=${encodeURIComponent(nextFromLocation())}`,
  },
})
```

`originBase()` возвращает `redirectOrigin ?? window.location.origin`. Модалка входа на лендинге (`components/landing/AuthCta.tsx:82`) передаёт сюда `appOriginForClient()`, то есть `https://app.endgrain.app`. Без этого человек, вошедший из модалки на `endgrain.app`, вернулся бы на лендинг, а не в студию.

**`app/auth/callback/route.ts`** - обмен кода на сессию. Один route обслуживает и OAuth, и ссылку подтверждения почты, и сброс пароля. Отмена входа на экране согласия Google приходит как `?error=`, а не `?code=`, поэтому проверка ошибки идёт первой. `next` режется до собственных путей, чтобы не получить открытый редирект.

**Cookie-домен** (`lib/supabase/cookies.ts`) - самая неочевидная часть, и она уже решена. Cookie называется `sb-egs-auth`, домен считается от реального хоста запроса через `registrableCookieDomain()`:

- на проде получается `.endgrain.app`, cookie видна и лендингу, и `app.endgrain.app`;
- на localhost и на `*.vercel.app` домен не ставится вовсе, cookie остаётся host-only (иначе браузер выбросил бы её вместе с сессией).

Для PKCE это важно отдельно. `signInWithOAuth` пишет `code_verifier` в cookie на том origin, где нажали кнопку. Если человек начал вход из модалки на `endgrain.app`, а вернулся на `app.endgrain.app`, verifier обязан доехать - и доезжает ровно потому, что `cookieOptions` с доменом `.endgrain.app` применяются ко всем cookie клиента, а не только к токену сессии. Если кто-то когда-нибудь сделает cookie host-only, вход через Google с лендинга сломается с ошибкой обмена кода, а с `/login` продолжит работать. Симптом характерный, стоит запомнить.

Цена этого решения записана в комментарии к `supabaseCookieOptions`: auth-cookie читает любой поддомен `endgrain.app`, поэтому на поддоменах нельзя размещать пользовательский или чужой контент.

**`lib/auth/googleAuth.ts` + `lib/auth/geo.ts`** - кнопка не рисуется для стран из `GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT` (сейчас `RU`), список переопределяется переменной `NEXT_PUBLIC_GOOGLE_AUTH_HIDDEN_COUNTRIES`. Страна берётся из заголовка `x-vercel-ip-country`, который прокидывает `proxy.ts`. Это косметическая мера: сам вход через Google не запрещён.

**Новых переменных окружения не появляется.** Client ID и secret живут в Supabase, в Vercel их класть не надо.

## 4. Одна почта, два способа входа

### Что делает Supabase по умолчанию

В GoTrue есть автоматическая линковка identity, и она не отключается настройкой. Логика при возврате от Google такая:

1. Есть ли identity с такой парой `provider = google` и `provider_id = <sub>`? Если да, это повторный вход, пускаем в тот же аккаунт. Дальше не смотрим.
2. Если нет, ищем пользователя с таким же email, но **только среди подтверждённых** identity. Для `email`-провайдера подтверждённость это `email_confirmed_at` у пользователя, для OAuth это claim `email_verified` от провайдера.
3. Нашли ровно одного - **линкуем**: к существующему пользователю добавляется вторая строка в `auth.identities`, `user_id` тот же самый. Человек попадает в свой аккаунт со всеми проектами.
4. Не нашли никого - создаём нового пользователя.
5. Нашли нескольких - ошибка, вход не проходит.

Практический вывод для нас: человек, у которого уже есть аккаунт с паролем на подтверждённой почте, жмёт «Войти через Google» и просто попадает внутрь. Никакого «этот email уже занят», никакого второго аккаунта, проекты на месте. Пароль при этом продолжает работать: identity две, пользователь один.

Обратный порядок работает так же. Человек, который завёлся через Google, потом сможет зарегистрироваться по паролю на ту же почту? Нет: `signUp` вернёт ошибку, потому что пользователь с таким email уже существует. Правильный путь для него - «Забыли пароль», Supabase пришлёт recovery-ссылку, и человек задаст пароль своему существующему аккаунту.

### Где линковка НЕ срабатывает

Три случая, и все три надо знать.

**Почта в аккаунте с паролем не подтверждена.** У нас `mailer_autoconfirm: false`, то есть после регистрации до клика по письму `email_confirmed_at` пустой. Такая identity в кандидаты на линковку не попадает, а создать второго пользователя с тем же email не даёт уникальный индекс на `auth.users.email`. Результат: вход через Google падает с невнятной ошибкой. Сценарий редкий (надо зарегистрироваться по паролю, не подтвердить почту и тут же пойти через Google), но именно он даёт основную часть жалоб. Лечится тем, что человек дочитывает письмо и подтверждает почту.

**Google вернул `email_verified: false`.** Бывает у части аккаунтов Google Workspace, где админ домена не подтверждал почту. Кандидатом такая identity не становится, дальше упирается в тот же уникальный индекс. Ошибка та же.

**У Google другой email.** Если человек регистрировался по паролю на `stas@example.com`, а в Google у него `stas@gmail.com`, это два разных аккаунта, и так и должно быть. Линковка идёт строго по совпадению email.

### Что выбираем мы

**Оставляем автоматическую линковку Supabase как есть и не строим свою.** Причины: она дефолтная и проверенная, при включённом подтверждении почты она безопасна, а любая самодельная надстройка (например, сверка identity через service role перед входом) добавила бы поверхность для user enumeration и своих багов ради нулевой выгоды. Один человек = один `user_id` = один набор проектов - именно то поведение, которое ждёт столяр, а не «почему мои доски пропали».

Ручную линковку (`linkIdentity`) добавим позже вместе со страницей настроек аккаунта, где кнопка «Привязать Google» нажимается осознанно уже вошедшим человеком. Это ортогонально автоматической и её не отменяет.

### Что показываем человеку

Автоматическая линковка тем и хороша, что в успешном сценарии показывать нечего: нажал Google, оказался внутри. Отдельный текст нужен только в двух местах.

**Вход по паролю не удался, а аккаунт мог быть заведён через Google.** Определить это на клиенте нельзя и не нужно: любой ответ вида «такая почта есть, но через Google» - готовый user enumeration. Поэтому подсказка показывается всем и ничего не подтверждает. Под существующим `auth.errorBadCredentials` стоит добавить строку:

- ru: `Если вы заходили через Google, войдите тем же способом. Пароль можно задать через «Забыли пароль»`
- en: `If you signed up with Google, use that button. You can set a password via "Forgot password"`

**Вход через Google не удался.** Сейчас показывается общий `auth.errorOAuth` («Не получилось войти через Google. Попробуйте ещё раз»). С учётом разобранного выше самая частая причина - неподтверждённая почта у существующего аккаунта, и об этом стоит сказать прямо:

- ru: `Не получилось войти через Google. Если на эту почту уже есть аккаунт с паролем, сначала подтвердите почту по ссылке из письма`
- en: `Could not sign in with Google. If an account with a password already exists for this email, confirm your email using the link we sent first`

Тексты живут в `lib/i18n/ru.ts` и `lib/i18n/en.ts` (блок `auth.*`, строки 249-279). Ключи предлагаются такие: `auth.hintGoogleMaybe` для первого, расширение `auth.errorOAuth` для второго.

### Риск безопасности и чем он закрыт

Опасность в автоматической линковке ровно одна: **захват аккаунта через провайдера, который врёт про подтверждённость почты**. Схема классическая. Злоумышленник заводит аккаунт у слабого провайдера, вписывает туда чужой адрес, провайдер отдаёт `email_verified: true` без всякой проверки, GoTrue линкует эту identity к чужому аккаунту с паролем, и злоумышленник входит внутрь. Пароль ему при этом не нужен.

Что нас защищает:

1. **Провайдер только один, и это Google.** Google действительно верифицирует почту и корректно отдаёт `email_verified: false` там, где не уверен. Это главный барьер, и он же главное ограничение на будущее: **нельзя включать провайдера, который позволяет человеку вписать произвольный email**. Github с непроверенной почтой, мелкие OIDC, любая самописная интеграция - каждый такой провайдер, добавленный в Supabase, становится ключом ко всем аккаунтам с паролем. Проверка перед включением любого нового провайдера ровно одна: гарантирует ли он владение почтой.
2. **Confirm email включён.** Это защита в обратную сторону. Если выключить подтверждение (`mailer_autoconfirm: true`), то любой сможет зарегистрировать по паролю чужой gmail, эта identity сразу станет «подтверждённой», и когда настоящий владелец придёт через Google, GoTrue залинкует его **в аккаунт злоумышленника**. То есть жертва своими руками принесёт свои данные в чужой аккаунт, к которому у злоумышленника есть пароль. Поэтому галка Confirm email в этом проекте не про качество базы адресов, а про безопасность, и снимать её нельзя даже временно ради демо.
3. **`next` санитизируется** в `app/auth/callback/route.ts:11` и в `safeNextPath`: OAuth-редирект нельзя развернуть на чужой домен.
4. **Allowlist redirect URLs** в Supabase не даёт увести код сессии на посторонний адрес.

Остаточный риск: пользователь, у которого угнали Google-аккаунт, теряет и наш аккаунт. Это неизбежная плата за любой social login и закрывается на стороне Google (2FA), не на нашей.

## 5. Чеклист проверки

Инфраструктура:

- [ ] `GET https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/settings` показывает `"google": true`
- [ ] Там же `"mailer_autoconfirm": false`
- [ ] В Redirect URLs присутствуют все шесть адресов из раздела 2
- [ ] Google-проект переведён в **In production**, иначе войдут только Test users

Сценарии (проверять на проде `https://app.endgrain.app/login`, локально Google тоже работает):

- [ ] Новый человек, которого в базе нет: жмёт Google, проходит согласие, попадает в студию, в шапке его email
- [ ] Тот же человек второй раз: вход без экрана согласия, тот же `user_id`
- [ ] **Линковка.** Аккаунт с паролем на подтверждённой почте, жмёт Google на ту же почту: попадает в **свой** аккаунт, проекты на месте. Проверить в базе: `select user_id, provider from auth.identities where email = '<почта>'` - две строки, один `user_id`
- [ ] После линковки вход по паролю на ту же почту продолжает работать
- [ ] **Вход с лендинга.** Модалка на `https://endgrain.app`, кнопка Google, возврат должен быть на `app.endgrain.app` и внутрь студии (это проверка того, что PKCE-verifier проехал между поддоменами)
- [ ] **Отмена.** На экране Google нажать «Назад» или отказать в доступе: возврат на `/login?error=oauth` с человеческим текстом, без белого экрана
- [ ] **`next` соблюдается.** Открыть `/login?next=%2Fprojects`, войти через Google, приземлиться на `/projects`
- [ ] **Гео.** С российского IP кнопка Google на `/login` не рисуется, форма почта/пароль работает
- [ ] Выход через «Выйти» гасит сессию и на `app.endgrain.app`, и на `endgrain.app`

Регресс (Google не должен ничего сломать):

- [ ] Регистрация по паролю: письмо приходит, ссылка ведёт в студию
- [ ] Сброс пароля: письмо приходит, новый пароль работает
- [ ] e2e-прогон `e2e/auth.spec.ts` зелёный

## Частые ошибки

- **`redirect_uri_mismatch`** - в Google Cloud в Authorized redirect URIs должен быть ровно `https://fusexddgetnyadxnyaqz.supabase.co/auth/v1/callback`, без слэша на конце и без опечаток в ref. Это единственный redirect URI, который видит Google.
- **После входа выкинуло на лендинг вместо студии** - `redirectTo` не совпал ни с одной строкой Redirect URLs, и Supabase подставил Site URL. Добавьте недостающий адрес.
- **Вход с лендинга падает, а с `/login` работает** - не доехал PKCE `code_verifier`, смотрите домен cookie в разделе 3.
- **`Database error saving new user` или невнятная 500 при первом входе через Google** - почти всегда коллизия email с существующим неподтверждённым аккаунтом, разбор в разделе 4.
- **`invalid_client` / `unauthorized_client`** - Client ID или secret в Supabase не совпадают с выданными Google, либо провайдер не включён.
- **`access_blocked` / `Error 403: org_internal`** - в Google Cloud выбран User type **Internal** вместо External, либо проект остался в Testing, а почта не в списке Test users.
- **Кнопка Google не появляется** - либо не заданы `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, либо запрос пришёл из скрытой страны. Это ожидаемое поведение, а не баг.
