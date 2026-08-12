# Handoff: дизайн-система Endgrain Studio

## Overview
Дизайн-система для веб-приложения Endgrain Studio, инструмента проектирования торцевых разделочных досок (редактор узора, шаблоны, генератор, фото-в-узор, 3D-превью, расчёт распила и себестоимости). Аудитория: столяры-любители и продавцы досок, не технари. Интерфейс двуязычный, русский и английский.

Направление: тёплый мастерской-минимализм. Интерфейс держится в тёплом бежево-сером диапазоне и намеренно нейтрален к цветам 16 пород дерева, которые всегда лежат рядом на холсте. Единственный акцент, патинированный тиловый #14615A, отсутствует в древесной палитре, поэтому всегда читается как элемент управления, а не как материал.

## About the Design Files
Файлы в этом пакете это **дизайн-референс, сделанный в HTML**. Это прототип, показывающий задуманный вид и поведение, а не продакшн-код для копирования. Задача: воспроизвести эти макеты в целевой кодовой базе (Next.js 16 App Router, Tailwind CSS, shadcn/ui) её собственными паттернами и библиотеками. Токены, конфиг Tailwind и файл шрифтов в этом пакете применимы напрямую, разметка из HTML-превью нет.

Уже готовые к применению файлы:
- `globals.css` — все CSS custom properties, светлая и тёмная тема
- `tailwind.config.ts` — theme.extend с colors, fontFamily, borderRadius, boxShadow, spacing, длительностями
- `fonts.ts` — подключение через next/font/google
- `wood-species.ts` — палитра 16 пород как данные приложения, не как токены интерфейса
- `Endgrain Design System.dc.html` — визуальное превью системы, открывается в браузере

## Fidelity
**High-fidelity.** Цвета, типографика, отступы, радиусы, тени и состояния финальные. Компоненты воспроизводить точно, но собирать на shadcn/ui (Card, Badge, Button, Separator), переопределяя их темой через токены, а не переписывая.

## Design Tokens
Полный список в `globals.css`. Все спеки ниже ссылаются на имена токенов, сырые hex в коде компонентов использовать нельзя.

Ключевое:
- Фоны: `--bg-app` #EFEAE1, `--bg-canvas` #E9E3D8, `--surface` #FBF9F5, `--surface-raised` #FFFFFF, `--surface-panel` #F4F0E9, `--overlay` rgba(36,30,25,0.44)
- Текст: `--text-primary` #241E19, `--text-secondary` #5A5048, `--text-muted` #8A7F73, `--text-inverse` #FBF9F5
- Границы: `--border-subtle` #E2DACD, `--border-default` #D2C8B8, `--border-strong` #B4A692
- Акцент: `--accent` #14615A, hover #0F4E48, active #0A3B36, soft #DCEAE7, border #9DC4BE
- Состояния: success #3E7A3C, warning #B57113, error #A63328, каждый с парой soft/border/text
- Радиусы: 4, 6, 8, 12, 16, 999
- Отступы: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64
- Тени: sm, md, lg, dialog, focus (см. `globals.css`)

## Typography
Шрифты Google Fonts, точные строки: **Bitter**, **Golos Text**, **JetBrains Mono**. Все три с кириллицей, подключение в `fonts.ts`.

| Токен | Шрифт | Размер / интерлиньяж | Вес | Где |
|---|---|---|---|---|
| display | Bitter | 40 / 44, tracking -0.01em | 600 | название продукта |
| h1 | Bitter | 32 / 38, tracking -0.01em | 600 | заголовок экрана |
| h2 | Bitter | 24 / 30 | 600 | секции, галерея |
| h3 | Bitter | 18 / 24 | 600 | заголовки карточек и диалогов |
| body-lg | Golos Text | 16 / 24 | 400 | описания, подсказки |
| body | Golos Text | 14 / 20 | 400 и 600 | интерфейс, кнопки, вкладки |
| small | Golos Text | 13 / 18 | 400 | пояснения диагностик |
| caption | Golos Text | 11 / 16, tracking +0.12em, uppercase | 500 | заголовки панелей |
| metric-lg | JetBrains Mono | 28 / 32, tabular-nums | 600 | итоговая себестоимость |
| metric | JetBrains Mono | 20 / 24, tabular-nums | 500 | цифры метра сложности |
| numeric-field | JetBrains Mono | 14 / 20, tabular-nums | 400 | числовые поля |

Правило: любое число в интерфейсе набирается моноширинным с `font-variant-numeric: tabular-nums`, чтобы верстка не дёргалась при пересчёте.

## Screens / Views

### Шапка приложения
Назначение: навигация между режимами и глобальные переключатели.
Layout: горизонтальная строка, min-height 56px, padding 8px 16px, flex, gap 16px, `flex-wrap: wrap` на узких ширинах. Фон `--surface`, снизу 1px `--border-default`.
- Логотип: квадрат 22px, radius `--radius-xs`, фон `--accent`, буква E шрифтом display 13px `--text-inverse`. Рядом название, Bitter 17 / 600.
  Логотип с фазы 8: марка-бобёр `public/brand/beaver-simple.svg`, 24px, без подложки. Описание квадрата с буквой E оставлено как история.
- Вкладки (Редактор, Шаблоны, Генератор, Фото, 3D): padding 7px 13px, radius `--radius-sm`, body 14. Неактивная: текст `--text-secondary`, вес 500. Hover: фон `--bg-app`, текст `--text-primary`. Активная: фон `--accent-soft`, текст `--accent`, вес 600. Focus: `--focus-ring`.
- Переключатели единиц (мм / in) и языка (RU / EN): сегмент-контрол, фон `--surface-sunken`, radius `--radius-md`, внутренний padding 2px. Активный сегмент: фон `--surface-raised`, тень `--shadow-sm`, radius `--radius-sm`. Единицы набраны mono 12, язык sans 12 / 600.
- Undo / redo: ghost-кнопки 32×32, radius `--radius-sm`, иконка 16px stroke 1.6. Недоступное состояние: цвет `--border-strong`, без hover.
- Разделитель между группами: 1px × 24px `--border-subtle`.

### Холст доски
Назначение: главный экран, узор доски.
Layout: фон `--bg-canvas`, padding 22px, содержимое центрируется, контейнер `overflow: auto` и `min-width: 0`, чтобы доска не ломала колонки.
- Сама доска лежит на подложке `--surface` с padding 6px, radius `--radius-xs`, тень `--shadow-md`.
- Сетка ячеек: CSS grid, ячейка 26×26px, gap 2px. Зазор читается как линия клея, поэтому фон подложки виден насквозь. Ячейка **без радиуса**: доска склеена из прямых брусков.
- Цвет ячейки берётся из `SPECIES[].hex`, не из токенов.
- Номера рядов: колонка слева, ширина 20px, mono 10 `--text-muted`, выравнивание по правому краю, высота строки равна высоте ячейки.
- Выделенная ячейка или ряд: обводка 2px `--selection` поверх ячейки, без смещения layout.
- Под доской строка-подпись: mono 11 `--text-muted`, формат «14 полос × 10 рядов · 320 × 240 мм».

### Палитра пород
Назначение: выбор активной кисти.
Layout: grid 4 колонки, gap 6px, ячейка `aspect-ratio: 1`, radius 5px.
- Обводка каждого свотча: `inset 0 0 0 1px var(--cell-outline)`.
- Активный свотч: `inset 0 0 0 2px var(--surface), 0 0 0 2px var(--selection)` — светлое кольцо отделяет акцент от цвета породы.
- Hover: `transform: scale(1.06)`, `--dur-hover`.
- Под сеткой строка активной кисти: карточка `--surface`, border 1px `--border-subtle`, radius `--radius-md`, padding 8px 10px, квадрат породы 20px, название body 13 / 500, подпись «активная кисть» 11 `--text-muted`.
- Заголовок панели: caption + счётчик пород mono 11 `--text-accent`.

### Инспекторы (панели и ряды)
Назначение: правка геометрии рядов и панелей списком.
Layout: строка grid `88px 1fr 120px 120px 96px`, gap 12px, padding 8px 10px, radius `--radius-md`.
- Обычная строка: фон `--surface`, border 1px `--border-subtle`. Выделенная: фон `--accent-soft`, border 1px `--accent-border`.
- Превью ряда: миниатюры ячеек 16×16, radius 2px, gap 2px.
- Числовые поля высотой 30px (компактный вариант поля, см. ниже).
- Кнопки действий: 28×28 ghost, иконка 15px. Сдвиг вверх / вниз: hover фон `--bg-app`, цвет `--text-primary`. Удалить: hover фон `--error-soft`, цвет `--error`.
- Действия панели над списком: primary «Добавить ряд» и secondary «Разрезать», высота 30px.

### Числовое поле
- Высота 36px, компактный вариант 34px, в инспекторе 30px.
- Фон `--surface-raised`, border 1px `--border-default`, radius `--radius-sm`, padding 0 8px, gap 4px.
- Значение: mono 14, tabular-nums, `--text-primary`. Суффикс единиц: mono 10-11 `--text-muted`, справа.
- Подпись над полем: 11px `--text-muted`.
- Hover: border `--border-strong`. Focus: border 1.5px `--accent` плюс `--focus-ring`. Disabled: фон `--surface-sunken`, border `--border-subtle`, текст `--border-strong`.
- Десятичный разделитель в русской локали запятая, в английской точка.

### Метр сложности
Назначение: живые цифры пересчёта.
Layout: карточка `--surface`, border 1px `--border-subtle`, radius `--radius-lg`, padding 14px. Внутри grid 2 колонки, gap 12px по вертикали и 10px по горизонтали.
- Ячейка: подпись 11 `--text-muted`, значение metric 20 mono, единица mono 11 `--text-muted` на общей базовой линии.
- Значение вне допустимого диапазона окрашивается в `--warning` (в макете так показаны отходы 18%).
- Итог себестоимости отделён линией 1px `--border-subtle`: слева подпись body 13 `--text-secondary`, справа metric-lg 28 / 600.
- Показатели: склейки, резы, объём, отходы, вес, число пород, себестоимость.

### Панель диагностик
Layout: вертикальный список, gap 8px. Строка: flex, gap 9px, padding 11px 12px, radius `--radius-md`, border 1px.
- warning: фон `--warning-soft`, border `--warning-border`, иконка треугольник `--warning`, заголовок `--warning-text`.
- error: фон `--error-soft`, border `--error-border`, иконка круг `--error`, заголовок `--error-text`.
- success: фон `--success-soft`, border `--success-border`, иконка галочка `--success`, заголовок `--success-text`.
- Заголовок: body 13 / 600. Описание: small 13 / 1.45 `--text-secondary`. Иконка 16px, stroke 1.6, `flex: none`, margin-top 1px.

### Галерея шаблонов
Layout: grid карточек, в макете показаны 2 из 16, реальная сетка адаптивная minmax(180px, 1fr), gap 12px.
- Карточка: фон `--surface-raised`, border 1px `--border-subtle`, radius `--radius-lg`, `overflow: hidden`, тень `--shadow-sm`.
- Превью: фон `--surface-panel`, padding 10px, внутри grid ячеек gap 1px, ячейки без радиуса.
- Подвал: padding 10px 12px, сверху 1px `--border-subtle`. Название body 14 / 600. Бейдж числа пород: фон `--surface-sunken`, radius `--radius-full`, padding 2px 7px, mono 10 `--text-secondary`. Метаданные размера mono 10 `--text-muted`.
- Hover: тень `--shadow-md`, border `--accent-border`. Выбранная карточка: border `--accent-border` постоянно.

### Генератор
- Кнопки семейств узоров: пилюли, padding 4px 10px, radius `--radius-full`, body 12. Неактивная: фон `--surface-sunken`, текст `--text-secondary`, вес 500. Активная: фон `--accent-soft`, текст `--accent`, вес 600.
- Сетка превью 3×3: gap 8px, карточка `aspect-ratio: 1`, radius `--radius-md`, border 1px `--border-subtle`, внутри превью узора на `--surface-panel` с padding 4px и gap 1px. Выбранный вариант: border `--accent`.
- Звезда избранного: круг 20px в правом верхнем углу, фон rgba(251,249,245,0.92), иконка 12px. Не в избранном: stroke `--text-muted`, без заливки. В избранном: заливка `#D9B31A` (еллоухарт из палитры пород), stroke `--warning`.
- Кнопки внизу: primary «Сгенерировать 9» на всю ширину и secondary «Эволюция».

### Импорт фото
- Дроп-зона: border 1.5px dashed `--border-strong`, radius `--radius-lg`, фон `--surface-sunken`, padding 26px, содержимое по центру, gap 8px. Иконка 26px `--text-muted`. Заголовок body 14 / 600, подпись 12 `--text-muted`.
- Состояние перетаскивания: border `--accent`, фон `--accent-soft`.
- Ползунки: подпись body 13 `--text-secondary` слева, значение mono 12 tabular справа. Дорожка 4px, radius `--radius-full`, фон `--surface-sunken`, заполнение `--accent`. Ручка 14px, фон `--surface-raised`, border 1.5px `--accent`, тень `--shadow-sm`. Focus: `--focus-ring` вокруг ручки.

### Диалог подтверждения
- Подложка `--overlay`.
- Окно: фон `--surface`, radius `--radius-lg`, тень `--shadow-dialog`, padding 20px, max-width 380px, gap 12px.
- Заголовок h3 Bitter 18 / 600. Текст body 14 / 1.5 `--text-secondary`.
- Кнопки справа внизу, gap 8px: ghost «Отмена» и primary либо destructive.

### Кнопки
Высота 36px (в плотных панелях 30px), padding 0 16px, radius `--radius-md`, body 14 / 600.

| Вариант | default | hover | active | focus | disabled |
|---|---|---|---|---|---|
| primary | фон `--accent`, текст `--accent-fg`, тень sm | фон `--accent-hover`, тень md | фон `--accent-active`, без тени | + ring rgba(20,97,90,0.28) | фон #C7D8D5, текст `--accent-fg` |
| secondary | фон `--surface`, border `--border-default`, тень sm | фон `--bg-app`, border `--border-strong` | фон `--surface-sunken` | border `--accent` + `--focus-ring` | фон `--surface-panel`, текст `--border-strong` |
| ghost | прозрачный, текст `--text-secondary` | фон `--bg-app`, текст `--text-primary` | фон `--surface-sunken` | border `--accent` + `--focus-ring` | текст `--border-strong` |
| destructive | фон `--error`, текст `--text-inverse` | фон #8C2820 | фон #731F19 | + ring rgba(166,51,40,0.24) | фон `--error-border` |

## Interactions & Behavior

| Что | Длительность | Поведение |
|---|---|---|
| Кнопка, вкладка, свотч | 120 мс ease-out | Меняются только фон и граница, никаких сдвигов по вертикали |
| Нажатие | 80 мс ease-out | Затемнение на один шаг и снятие тени, без scale |
| Свотч под курсором | 120 мс ease-out | scale(1.06), чтобы цвет было видно поверх соседей |
| Фокус с клавиатуры | мгновенно | Кольцо `--focus-ring` без анимации |
| Панель, аккордеон | 160 мс ease-out | Высота и прозрачность вместе |
| Диалог | 240 мс ease-out | Подложка fade, окно fade и translateY 8px |
| Пересчёт метра | 160 мс | Число меняется без анимации, фон ячейки подсвечивается на 400 мс |
| Кисть на холсте | 0 мс | Заливка ячейки мгновенная, инструмент не должен ощущаться медленным |

Единая функция сглаживания: `cubic-bezier(0.2, 0.6, 0.2, 1)`.

Респонсив: рабочая область редактора это grid `minmax(0,236px) minmax(0,1fr) minmax(0,268px)`. Средняя колонка обязана иметь `min-width: 0` и `overflow: auto`, иначе доска фиксированной ширины выдавливает боковые панели. Шапка переносится по `flex-wrap` ниже примерно 1000px.

## State Management
Из макетов следуют минимум такие состояния:
- активная порода (кисть), `Species['id']`
- узор доски: массив рядов, каждый с высотой, сдвигом и массивом id пород по ячейкам
- параметры доски: ширина, глубина, толщина, ширина пропила, единицы (мм / дюймы)
- язык интерфейса (ru / en)
- история undo / redo
- производные значения метра сложности (склейки, резы, объём, отходы, вес, число пород, себестоимость), пересчитываются от узора и параметров
- список диагностик, пересчитывается там же
- избранное генератора, набор id вариантов
- состояние загрузки и параметры обработки в импорте фото
- открытый диалог подтверждения

## Assets
Внешних ассетов нет. Все иконки в макете нарисованы инлайновым SVG stroke 1.6 в размере 15-16px; в кодовой базе заменить на иконки принятой библиотеки (например lucide-react) того же размера и толщины. Превью досок генерируются из данных узора, картинок не требуется.

## Files
- `Endgrain Design System.dc.html` — полное визуальное превью системы (токены, палитра пород, типографика, геометрия, собранный фрагмент редактора, кнопки, галерея, генератор, фото, диалог, спеки, микровзаимодействия)
- `globals.css`, `tailwind.config.ts`, `fonts.ts`, `wood-species.ts` — применимые файлы

## Ограничения
Не добавлять функции продукта сверх перечисленных экранов. Экраны логина и тарифов пока не спроектированы, при их появлении собирать из тех же токенов и компонентов.
