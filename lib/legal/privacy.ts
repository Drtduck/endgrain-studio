import type { LegalDocByLocale } from './types'

/**
 * Privacy Policy. Содержательный минимум из docs/research/us-cookie-compliance.md:
 * категории данных, цели, третьи лица поимённо, права потребителя, контакт,
 * прямая фраза о непродаже данных, обработка сигнала GPC.
 * Реквизиты оператора - плейсхолдер, реальные данные вписываются перед публикацией
 * (см. раздел 11 спеки, ручной чеклист).
 */
export const privacyDoc: LegalDocByLocale = {
  ru: {
    title: 'Политика конфиденциальности',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Кто мы',
        paragraphs: [
          'Endgrain Studio - сервис для проектирования торцевых разделочных досок. Оператор: [заполнить перед публикацией: ФИО или наименование юрлица, адрес]. Контакт по всем вопросам конфиденциальности: hello@endgrain.app.',
        ],
      },
      {
        heading: 'Какие данные мы собираем',
        paragraphs: [
          'Учётная запись: адрес электронной почты и идентификатор аккаунта, которые вы указываете при регистрации или получаете через вход с Google.',
          'Платёжные данные обрабатывает Stripe напрямую на своей странице оплаты. Номер карты и другие платёжные реквизиты мы не видим и не храним.',
          'Сохранённые проекты: узор доски, размеры и параметры распила, которые вы решили сохранить в облаке под своим аккаунтом.',
          'Обезличенная статистика посещений через Google Analytics 4 - только с вашего согласия либо в режиме уведомления, если вы не отключили её (раздел «Согласие на аналитику» ниже).',
        ],
      },
      {
        heading: 'Зачем нам эти данные',
        paragraphs: [
          'Вход в аккаунт и сохранение ваших проектов между сеансами и устройствами.',
          'Обработка платежей за платную подписку и предоставление доступа к платным функциям.',
          'Обезличенная аналитика использования сервиса, чтобы понимать, какие функции полезны, а какие нет.',
          'Ответ на обращения, отправленные на hello@endgrain.app.',
        ],
      },
      {
        heading: 'Кому мы передаём данные',
        paragraphs: [
          'Мы передаём данные только поставщикам инфраструктуры, необходимым для работы сервиса, и никому больше:',
          'Supabase - хранение аккаунта и сохранённых проектов.',
          'Vercel - хостинг приложения и обработка запросов.',
          'Stripe - обработка платежей (мы не видим платёжные реквизиты).',
          'Google Analytics - обезличенная статистика посещений, при вашем согласии.',
          'Google OAuth - вход через аккаунт Google, если вы выбрали этот способ.',
          'Kit - рассылка, на которую вы подписались отдельно на лендинге, по вашему email.',
          'Resend - техническая отправка писем (подтверждение подписки, сброс пароля).',
        ],
      },
      {
        heading: 'Мы не продаём ваши данные',
        paragraphs: [
          'Мы не продаём и не передаём персональные данные третьим лицам в рекламных целях. Рекламы в продукте нет: рекламные параметры Google Consent Mode (ad_storage, ad_user_data, ad_personalization) остаются отключёнными всегда, независимо от вашего выбора по аналитике.',
        ],
      },
      {
        heading: 'Сигнал Global Privacy Control',
        paragraphs: [
          'Если ваш браузер отправляет сигнал Global Privacy Control (navigator.globalPrivacyControl), мы воспринимаем его как явный отказ от аналитики и немедленно отключаем её, показывая видимое подтверждение обработки сигнала. Осознанный выбор, сделанный вами позже вручную через переключатель на этой странице, имеет приоритет над сигналом.',
        ],
      },
      {
        heading: 'Ваши права',
        paragraphs: [
          'Вы можете запросить доступ к своим данным, их исправление или удаление, а также отказаться от аналитики в любой момент через переключатель ниже или в настройках браузера. Для запроса на удаление или исправление данных напишите на hello@endgrain.app - мы ответим в разумный срок.',
        ],
      },
      {
        heading: 'Cookie',
        paragraphs: [
          'Технически необходимые cookie (сессия входа, выбор языка) устанавливаются всегда и согласия не требуют. Аналитическая cookie согласия eg-consent хранит только ваш выбор по аналитике: версию, значение, регион на момент выбора, источник и дату. Подробности - на странице «Согласие на использование cookie».',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          'Endgrain Studio is a tool for designing end-grain cutting boards. Operator: [fill in before publishing: individual or entity name, address]. Contact for all privacy questions: hello@endgrain.app.',
        ],
      },
      {
        heading: 'What data we collect',
        paragraphs: [
          'Account: the email address and account identifier you provide at sign-up, or receive through Google sign-in.',
          'Payment data is handled directly by Stripe on its own checkout page. We never see or store your card number or other payment details.',
          'Saved projects: board patterns, dimensions, and cut-plan parameters you choose to save in the cloud under your account.',
          'Anonymized analytics via Google Analytics 4 - only with your consent, or in notice mode unless you opt out (see "Analytics consent" below).',
        ],
      },
      {
        heading: 'Why we use this data',
        paragraphs: [
          'Signing in and keeping your projects available across sessions and devices.',
          'Processing payments for a paid subscription and granting access to paid features.',
          'Anonymized usage analytics to understand which features are useful.',
          'Responding to messages sent to hello@endgrain.app.',
        ],
      },
      {
        heading: 'Who we share data with',
        paragraphs: [
          'We only share data with infrastructure providers required to run the service, and nobody else:',
          'Supabase - account and saved project storage.',
          'Vercel - application hosting and request handling.',
          'Stripe - payment processing (we never see your card details).',
          'Google Analytics - anonymized visit statistics, with your consent.',
          'Google OAuth - sign-in with a Google account, if you choose that method.',
          'Kit - the newsletter you separately subscribed to on the landing page, sent to your email.',
          'Resend - transactional email delivery (subscription confirmation, password reset).',
        ],
      },
      {
        heading: 'We do not sell your data',
        paragraphs: [
          'We do not sell or share personal data with third parties for advertising purposes. There is no advertising in the product: the advertising parameters of Google Consent Mode (ad_storage, ad_user_data, ad_personalization) always stay denied, regardless of your analytics choice.',
        ],
      },
      {
        heading: 'Global Privacy Control signal',
        paragraphs: [
          'If your browser sends a Global Privacy Control signal (navigator.globalPrivacyControl), we treat it as an explicit opt-out from analytics and disable it immediately, showing a visible acknowledgement that the signal was processed. A conscious choice you make later through the toggle on this page takes priority over the signal.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can request access to your data, correction, or deletion, and opt out of analytics at any time via the toggle below or your browser settings. To request deletion or correction, email hello@endgrain.app - we respond within a reasonable time.',
        ],
      },
      {
        heading: 'Cookies',
        paragraphs: [
          'Strictly necessary cookies (login session, language choice) are always set and do not require consent. The eg-consent analytics cookie stores only your analytics choice: version, value, the region at the time of the choice, its source, and the date. See "Cookie consent" for details.',
        ],
      },
    ],
  },
}
