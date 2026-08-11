# Endgrain Studio

Генератор узоров торцевых разделочных досок. Конкурсный проект (Вайбатон №1, дедлайн: 17 августа 2026, старт 10 августа 2026). Полные условия конкурса - в README.md.

## Цель

Не рисовалка, а производственный инструмент столяра: узор -> превью готовой доски -> схема распила и переклеек -> размеры деталей -> расчёт материала, отходов и себестоимости -> сохранение проекта -> печатная инструкция. Работающий прод важнее количества функций.

## Деплой

Прод - Vercel. Проект должен открываться по публичной ссылке и работать у человека, который не видел код.

## Оркестрация моделей (обязательное правило)

- Главная сессия - только оркестратор. Наследование модели субагентами запрещено: у каждого вызова Agent/Workflow модель указывается явно.
- Архитектура, дизайн-решения, reasoning, ревью - `opus` (Opus 5).
- Кодогенерация, сборка, тесты, механические задачи - `sonnet` (Sonnet 5).

## Правила кода и текста

- Все тексты пользователю и коммиты - по-русски, техтермины на английском.
- Запрещено длинное тире «—» (U+2014) везде: код, комментарии, коммиты, UI-тексты. Только дефис, двоеточие или скобки.
- Домен: доска состоит из полос (strips) первой склейки, поперечных резов (crosscuts) и финальной переклейки. Учитывать толщину пропила (kerf) и припуски. Размеры хранить в миллиметрах, дюймы - только представление.

## Определение готовности

Задача закрыта, когда все пункты MVP из README работают на проде Vercel и проверены руками (Playwright или вручную), а HTML-чеклист сдачи подтверждён Станиславом.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
