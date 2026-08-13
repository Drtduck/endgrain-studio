import type { LegalDocByLocale } from './types'

/**
 * Политика обработки персональных данных, ст. 18.1 152-ФЗ, ориентир - приказ
 * Роскомнадзора №996 от 17.07.2020. Содержательный минимум из
 * docs/research/ru-152fz-compliance.md: оператор и контакты, правовые основания,
 * перечень ПДн, цели, перечень действий, сроки хранения, отзыв согласия, права
 * субъекта, трансграничная передача с указанием стран, меры защиты.
 * Реквизиты оператора - плейсхолдер, вписываются перед публикацией.
 */
export const personalDataDoc: LegalDocByLocale = {
  ru: {
    title: 'Политика обработки персональных данных',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Оператор персональных данных',
        paragraphs: [
          'Оператор: [заполнить перед публикацией: ФИО или наименование юрлица, ОГРНИП/ОГРН, адрес]. Контакт по вопросам обработки персональных данных: hello@endgrain.app.',
          'Настоящая политика разработана в соответствии со статьёй 18.1 Федерального закона от 27.07.2006 №152-ФЗ «О персональных данных» и рекомендациями Роскомнадзора (Приказ №996 от 17.07.2020).',
        ],
      },
      {
        heading: 'Правовые основания обработки',
        paragraphs: [
          'Согласие субъекта персональных данных, полученное отдельным документом при регистрации (см. страницу «Согласие на обработку персональных данных»), и необходимость исполнения договора об оказании услуг сервиса, стороной которого является субъект персональных данных.',
        ],
      },
      {
        heading: 'Перечень обрабатываемых персональных данных',
        paragraphs: [
          'Адрес электронной почты, идентификатор учётной записи, данные о сохранённых проектах (узоры досок и параметры распила), сведения об использовании сервиса в обезличенном виде для аналитики.',
          'Платёжные данные (номер карты и иные реквизиты) оператор не собирает и не хранит: их обрабатывает платёжный партнёр Stripe напрямую.',
        ],
      },
      {
        heading: 'Цели обработки',
        paragraphs: [
          'Регистрация и авторизация пользователя, предоставление доступа к функциям сервиса, сохранение и синхронизация проектов пользователя, обработка платежей за платную подписку, обезличенная статистика использования сервиса, ответы на обращения пользователей.',
        ],
      },
      {
        heading: 'Перечень действий с персональными данными',
        paragraphs: [
          'Сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передача (предоставление, доступ) в объёме, необходимом для работы сервиса, блокирование, удаление, уничтожение.',
        ],
      },
      {
        heading: 'Сроки хранения',
        paragraphs: [
          'Данные учётной записи и сохранённых проектов хранятся до удаления аккаунта пользователем либо до отзыва согласия. Обезличенная аналитическая cookie согласия хранится не дольше 180 суток, после чего согласие запрашивается заново.',
        ],
      },
      {
        heading: 'Порядок отзыва согласия',
        paragraphs: [
          'Согласие на обработку персональных данных может быть отозвано в любой момент направлением письма на hello@endgrain.app либо удалением аккаунта в настройках сервиса. Согласие на обработку cookie для аналитики отзывается переключателем на странице «Политика конфиденциальности» в любой момент.',
        ],
      },
      {
        heading: 'Права субъекта персональных данных',
        paragraphs: [
          'Субъект персональных данных вправе получить сведения об обработке своих данных, требовать их уточнения, блокирования или уничтожения в случае, если данные являются неполными, устаревшими, недостоверными, незаконно полученными или не являются необходимыми для заявленной цели обработки, а также обжаловать действия или бездействие оператора в уполномоченный орган по защите прав субъектов персональных данных или в судебном порядке.',
        ],
      },
      {
        heading: 'Трансграничная передача данных',
        paragraphs: [
          'В связи с использованием зарубежной инфраструктуры персональные данные передаются за пределы Российской Федерации следующим поставщикам: Vercel и Supabase (США), Stripe (США), Google Analytics и Google OAuth (США). Передача осуществляется в объёме, необходимом для функционирования сервиса, с применением технических и организационных мер защиты, предусмотренных договорами с указанными поставщиками (шифрование канала связи, ограничение доступа).',
        ],
      },
      {
        heading: 'Меры по защите персональных данных',
        paragraphs: [
          'Оператор применяет организационные и технические меры защиты, включая шифрование канала передачи данных (HTTPS), разграничение доступа к данным на уровне базы данных (row-level security), хранение платёжных реквизитов исключительно у сертифицированного платёжного партнёра.',
        ],
      },
    ],
  },
  en: {
    title: 'Personal Data Processing Policy',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Data controller',
        paragraphs: [
          'Controller: [fill in before publishing: individual or entity name, registration number, address]. Contact for personal data processing questions: hello@endgrain.app.',
          'This policy is prepared in accordance with Article 18.1 of Federal Law No. 152-FZ "On Personal Data" and the guidance of Roskomnadzor (Order No. 996 of 17.07.2020), for visitors from the Russian Federation.',
        ],
      },
      {
        heading: 'Legal basis for processing',
        paragraphs: [
          'The consent of the data subject, obtained as a separate document at registration (see the "Personal data consent" page), and the necessity of performing the service agreement to which the data subject is a party.',
        ],
      },
      {
        heading: 'Categories of personal data processed',
        paragraphs: [
          'Email address, account identifier, data about saved projects (board patterns and cut-plan parameters), anonymized usage data for analytics.',
          'Payment details (card number and other credentials) are not collected or stored by the controller: they are processed directly by the payment partner Stripe.',
        ],
      },
      {
        heading: 'Purposes of processing',
        paragraphs: [
          'User registration and authentication, granting access to the service features, saving and syncing user projects, processing payments for a paid subscription, anonymized usage analytics, responding to user inquiries.',
        ],
      },
      {
        heading: 'Processing operations',
        paragraphs: [
          'Collection, recording, systematization, accumulation, storage, updating, retrieval, use, transfer (provision, access) to the extent required for the service to function, blocking, deletion, destruction.',
        ],
      },
      {
        heading: 'Retention period',
        paragraphs: [
          'Account and saved project data is stored until the user deletes the account or withdraws consent. The anonymized analytics consent cookie is stored for no longer than 180 days, after which consent is requested again.',
        ],
      },
      {
        heading: 'Withdrawing consent',
        paragraphs: [
          'Consent to personal data processing can be withdrawn at any time by emailing hello@endgrain.app or deleting the account in the service settings. Consent to analytics cookies can be withdrawn via the toggle on the "Privacy Policy" page at any time.',
        ],
      },
      {
        heading: 'Rights of the data subject',
        paragraphs: [
          'The data subject has the right to receive information about the processing of their data, to demand correction, blocking, or destruction if the data is incomplete, outdated, inaccurate, unlawfully obtained, or not necessary for the stated purpose, and to appeal actions or inaction of the controller to the authorized body for personal data protection or to a court.',
        ],
      },
      {
        heading: 'Cross-border data transfer',
        paragraphs: [
          'Due to the use of foreign infrastructure, personal data is transferred outside the Russian Federation to the following providers: Vercel and Supabase (USA), Stripe (USA), Google Analytics and Google OAuth (USA). The transfer is limited to what is necessary for the service to function, using the technical and organizational protection measures provided for in agreements with these providers (encrypted transport, restricted access).',
        ],
      },
      {
        heading: 'Data protection measures',
        paragraphs: [
          'The controller applies organizational and technical protection measures, including encrypted data transport (HTTPS), database-level access control (row-level security), and storing payment credentials exclusively with a certified payment partner.',
        ],
      },
    ],
  },
}
