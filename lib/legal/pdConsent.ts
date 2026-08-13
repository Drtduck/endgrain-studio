import type { LegalDocByLocale } from './types'

/**
 * Согласие на обработку персональных данных - самостоятельный документ, а не
 * раздел политики и не пункт оферты (требование с 01.09.2025): перечень ПДн,
 * перечень действий, цели, срок действия согласия, порядок отзыва, формулировка
 * активного согласия при регистрации.
 */
export const pdConsentDoc: LegalDocByLocale = {
  ru: {
    title: 'Согласие на обработку персональных данных',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Предмет согласия',
        paragraphs: [
          'Нажимая чекбокс согласия при регистрации на Endgrain App, вы даёте согласие оператору сервиса (см. «Политика обработки персональных данных») на обработку ваших персональных данных на условиях, изложенных в настоящем документе. Это самостоятельный документ, отдельный от политики конфиденциальности, политики обработки персональных данных и любого пользовательского соглашения.',
        ],
      },
      {
        heading: 'Перечень персональных данных',
        paragraphs: [
          'Адрес электронной почты, идентификатор учётной записи, дата и время предоставления согласия, язык интерфейса на момент регистрации.',
        ],
      },
      {
        heading: 'Перечень действий с персональными данными',
        paragraphs: [
          'Сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, передача поставщикам инфраструктуры сервиса в объёме, необходимом для его работы, блокирование, удаление, уничтожение.',
        ],
      },
      {
        heading: 'Цели обработки',
        paragraphs: [
          'Создание и обслуживание учётной записи, предоставление доступа к функциям сервиса, сохранение проектов пользователя, обработка платежей за платную подписку.',
        ],
      },
      {
        heading: 'Срок действия согласия',
        paragraphs: [
          'Согласие действует бессрочно с момента регистрации до его отзыва субъектом персональных данных или до удаления учётной записи.',
        ],
      },
      {
        heading: 'Порядок отзыва согласия',
        paragraphs: [
          'Согласие может быть отозвано в любой момент путём направления письма на hello@endgrain.app или удалением учётной записи в настройках сервиса. Отзыв согласия влечёт прекращение обработки персональных данных, за исключением случаев, когда обработка необходима по иным законным основаниям.',
        ],
      },
      {
        heading: 'Подтверждение согласия',
        paragraphs: [
          'Отметка чекбокса «Я даю согласие на обработку персональных данных» при регистрации является активным действием, выражающим согласие субъекта персональных данных, зафиксированным вместе с датой, временем и версией документа.',
        ],
      },
    ],
  },
  en: {
    title: 'Personal Data Consent',
    updatedAt: '2026-08-13',
    sections: [
      {
        heading: 'Subject of consent',
        paragraphs: [
          'By checking the consent box during registration on Endgrain App, you give the service operator (see "Personal Data Processing Policy") consent to process your personal data under the terms of this document. This is a standalone document, separate from the privacy policy, the personal data processing policy, and any terms of service.',
        ],
      },
      {
        heading: 'Categories of personal data',
        paragraphs: [
          'Email address, account identifier, date and time consent was given, interface language at the time of registration.',
        ],
      },
      {
        heading: 'Processing operations',
        paragraphs: [
          'Collection, recording, systematization, accumulation, storage, updating, retrieval, use, transfer to the service infrastructure providers to the extent necessary for its operation, blocking, deletion, destruction.',
        ],
      },
      {
        heading: 'Purposes of processing',
        paragraphs: [
          'Creating and maintaining an account, granting access to service features, saving user projects, processing payments for a paid subscription.',
        ],
      },
      {
        heading: 'Duration of consent',
        paragraphs: [
          'Consent is valid indefinitely from the moment of registration until withdrawn by the data subject or until the account is deleted.',
        ],
      },
      {
        heading: 'Withdrawing consent',
        paragraphs: [
          'Consent can be withdrawn at any time by emailing hello@endgrain.app or by deleting the account in the service settings. Withdrawal terminates the processing of personal data, except where processing remains necessary on other lawful grounds.',
        ],
      },
      {
        heading: 'Confirmation of consent',
        paragraphs: [
          'Checking the "I consent to the processing of personal data" box at registration is an active action expressing the data subject\'s consent, recorded together with the date, time, and version of this document.',
        ],
      },
    ],
  },
}
