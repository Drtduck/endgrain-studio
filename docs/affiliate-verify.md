# Проверка ASIN партнёрских блоков Amazon

Все 20 позиций (`lib/affiliate/products.json` и `lib/affiliate/books.json`)
проверены и переведены в `"unverified": false`. Ссылки ведут напрямую на
`https://www.amazon.com/dp/<ASIN>?tag=<NEXT_PUBLIC_AMAZON_TAG>`, а не на поиск.

## Как проверялось

Amazon режет HTTP-клиенты без браузера: обычный fetch отдаёт заглушку без
карточки товара. Поэтому проверка шла через Playwright MCP - реальный браузер
открывал `https://www.amazon.com/dp/<ASIN>` и со страницы снимались три вещи:
HTTP-статус, `#productTitle` и рейтинг из `#acrPopover`. Несуществующий ASIN
отдаёт 404 и пустой заголовок, поэтому подмену видно сразу. Дополнительно
названия и цены сверялись с независимыми источниками (сайты производителей,
Walmart, Lowe's, Rockler, KMS Tools, Penguin Random House, AbeBooks, Goodreads).

Дата проверки: 12 августа 2026.

## Инструменты

| id | ASIN | товар на странице | рейтинг | что изменилось |
| --- | --- | --- | --- | --- |
| glue-titebond3 | B0002YQ3KA | Titebond III Ultimate Wood Glue, 16-Ounces #1414 | 4,8 | ASIN заменён, старый B0000224B4 не существует |
| glue-brush | B0749JLW47 | Rockler Silicone Glue Applicator Kit, 3-Piece | 4,7 | ASIN заменён, band поднят до b10_25 (реальные $14,99 на rockler.com) |
| clamps-bar-24 | B0078S1FII | Bessey 2400S-24 24-Inch F-Style Bar Clamp | нет оценок | ASIN заменён, из названия убрано «пара»: продаётся одна струбцина |
| clamps-pipe | B0000224C9 | PONY 50 Clamp Fixture for 3/4 Inch Black Pipe | 4,7 | ASIN заменён, товар той же линейки Pony |
| caliper-digital | B000GSLKIW | NEIKO 01407A Electronic Digital Caliper 0-6 in | 4,4 | исходный ASIN подтвердился без изменений |
| square-combo | B008R6NLFA | Empire E250IM Combination Square 12 in | 4,1 | ASIN заменён, старый не существует |
| oil-mineral | B01B5ECU3O | Thirteen Chefs Mineral Oil 12 oz | 4,8 | ASIN заменён, объём в названии исправлен на 355 мл: 16 oz этого бренда на Amazon US нет |
| wax-boardcream | B075LP6ZGC | WALRUS OIL Wood Wax, 3 oz Can | 4,8 | ASIN заменён, объём уточнён |
| sled-miter-gauge | B0D41FNZXG | VEVOR Precision Miter Gauge, 15 угловых стопоров | 4,4 | позиция заменена целиком: Kreg KMS7101 (B0002QZ4R6) реально стоит около $129 и не влезает в b50_100 |
| scraper-card | B0001P0PHW | Snap-on Bahco 474-125-0.80 Cabinet Scraper 5 in | 4,4 | ASIN заменён, band поднят до b10_25, из названия убрано «набор»: продаётся одна цикля |
| sandpaper-set | B0CBSV9TH2 | Diablo SandNET Disc Assorted Pack, 5 in, 50 шт | 4,6 | ASIN заменён, старый не существует |
| feet-rubber | B07SZ3GVDN | softtouch 1/2" Round Self Stick Cabinet Bumper Pads, 100 шт | 4,4 | ASIN заменён, «силиконовые» убрано из названия и текста: подпятники резиновые |

## Книги

ASIN книги равен её ISBN-10, поэтому проверка шла по ISBN-10 конкретного
издания. Рейтинги ниже сняты с самих карточек Amazon, все проходят порог 4,5
(Goodreads по этим же книгам даёт 4,1-4,5, но требование сформулировано по
Amazon).

| id | ASIN | книга на странице | рейтинг | что изменилось |
| --- | --- | --- | --- | --- |
| hoadley-understanding-wood | 1561583588 | Understanding Wood: A Craftsman's Guide to Wood Technology | 4,8 | исходный ISBN-10 подтвердился |
| flexner-finishing | 1565235665 | Understanding Wood Finishing (Fox Chapel) | 4,8 | ISBN-10 заменён: старый 1565239288 ведёт на «Learn to Turn», другую книгу |
| korn-basics | 156158620X | Woodworking Basics: Mastering the Essentials of Craftsmanship | 4,6 | ISBN-10 заменён: старый 1561586200 отдаёт 404, у настоящего контрольный символ X |
| schwarz-toolchest | 0578084139 | The Anarchist's Tool Chest | 4,9 | ISBN-10 заменён: старый 0982378130 отдаёт 404 |
| hylton-cabinetmaking | 1565233697 | Illustrated Cabinetmaking (Fox Chapel) | 4,5 | ISBN-10 подтвердился, издатель исправлен на Fox Chapel Publishing |
| pekovich-why-how | 1631869272 | The Why & How of Woodworking | 4,8 | ISBN-10 заменён: старый 1631869310 ведёт на план верстака Fine Woodworking |
| spagnuolo-hybrid | 1440329605 | Hybrid Woodworking (Popular Woodworking) | 4,6 | ISBN-10 заменён, издатель исправлен на Popular Woodworking Books |
| jackson-day-manual | 0679766111 | The Complete Manual of Woodworking | 4,7 | ISBN-10 подтвердился, издатель исправлен на Knopf |

## Если позиция протухнет

Amazon снимает товары с продажи без предупреждения, поэтому раз в несколько
месяцев стоит прогнать список заново по той же схеме:

1. Открыть `https://www.amazon.com/dp/<ASIN>` в браузере (не curl: без браузера
   Amazon отдаёт заглушку).
2. Страница открылась, товар тот же, цена в границах `band` - ничего не делаем.
3. 404 или другой товар - найти правильный ASIN в адресной строке нужной
   карточки и заменить значение `asin` в JSON.
4. Товара нет совсем и замены нет - вернуть позиции `"unverified": true`, тогда
   ссылка автоматически уйдёт на поиск Amazon (`amazonSearchUrl` в
   `lib/affiliate/index.ts`) и битого `/dp/` в проде не будет.
