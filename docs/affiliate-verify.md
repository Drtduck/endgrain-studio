# Проверка ASIN партнёрских блоков Amazon

Все 20 позиций (`lib/affiliate/products.json` и `lib/affiliate/books.json`)
проверены и переведены в `"unverified": false`. Ссылки ведут напрямую на
`https://www.amazon.com/dp/<ASIN>?tag=<NEXT_PUBLIC_AMAZON_TAG>`, а не на поиск.

## Как проверялось

Amazon режет HTTP-клиенты без браузера: обычный fetch отдаёт заглушку без
карточки товара. Поэтому разовая сверка перед релизом шла через Playwright MCP:
браузер открывал `https://www.amazon.com/dp/<ASIN>`, и со страницы снимались
HTTP-статус и `#productTitle`. Несуществующий ASIN отдаёт 404 и пустой
заголовок, поэтому подмену видно сразу. Дополнительно названия и цены
сверялись с независимыми источниками (сайты производителей, Walmart, Lowe's,
Rockler, KMS Tools, Penguin Random House, AbeBooks, Goodreads).

Ничего с этих страниц в приложение не переносится: ни цены, ни картинки, ни
рейтинги. В JSON уезжает только ASIN, всё остальное это наш редакционный текст.

Дата проверки: 12 августа 2026.

## Инструменты

| id | ASIN | товар на странице | совпал | что изменилось |
| --- | --- | --- | --- | --- |
| glue-titebond3 | B0002YQ3KA | Titebond III Ultimate Wood Glue, 16-Ounces #1414 | да | ASIN заменён, старый B0000224B4 не существует |
| glue-brush | B0749JLW47 | Rockler Silicone Glue Applicator Kit, 3-Piece | да | ASIN заменён, band поднят до b10_25 (реальные $14,99 на rockler.com) |
| clamps-bar-24 | B0078S1FII | Bessey 2400S-24 24-Inch F-Style Bar Clamp | да | ASIN заменён, из названия убрано «пара»: продаётся одна струбцина |
| clamps-pipe | B0000224C9 | PONY 50 Clamp Fixture for 3/4 Inch Black Pipe | да | ASIN заменён, товар той же линейки Pony |
| caliper-digital | B000GSLKIW | NEIKO 01407A Electronic Digital Caliper 0-6 in | да | исходный ASIN подтвердился без изменений |
| square-combo | B008R6NLFA | Empire E250IM Combination Square 12 in | да | ASIN заменён, старый не существует |
| oil-mineral | B01B5ECU3O | Thirteen Chefs Mineral Oil 12 oz | да | ASIN заменён, объём в названии исправлен на 355 мл: 16 oz этого бренда на Amazon US нет |
| wax-boardcream | B075LP6ZGC | WALRUS OIL Wood Wax, 3 oz Can | да | ASIN заменён, объём уточнён |
| sled-miter-gauge | B0D41FNZXG | VEVOR Precision Miter Gauge, 15 угловых стопоров | да | позиция заменена целиком: Kreg KMS7101 (B0002QZ4R6) реально стоит около $129 и не влезает в b50_100 |
| scraper-card | B0001P0PHW | Snap-on Bahco 474-125-0.80 Cabinet Scraper 5 in | да | ASIN заменён, band поднят до b10_25, из названия убрано «набор»: продаётся одна цикля |
| sandpaper-set | B0CBSV9TH2 | Diablo SandNET Disc Assorted Pack, 5 in, 50 шт | да | ASIN заменён, старый не существует |
| feet-rubber | B07SZ3GVDN | softtouch 1/2" Round Self Stick Cabinet Bumper Pads, 100 шт | да | ASIN заменён, «силиконовые» убрано из названия и текста: подпятники резиновые |

## Книги

ASIN книги равен её ISBN-10, поэтому проверка шла по ISBN-10 конкретного
издания.

| id | ASIN | книга на странице | совпал | что изменилось |
| --- | --- | --- | --- | --- |
| hoadley-understanding-wood | 1561583588 | Understanding Wood: A Craftsman's Guide to Wood Technology | да | исходный ISBN-10 подтвердился |
| flexner-finishing | 1565235665 | Understanding Wood Finishing (Fox Chapel) | да | ISBN-10 заменён: старый 1565239288 ведёт на «Learn to Turn», другую книгу |
| korn-basics | 156158620X | Woodworking Basics: Mastering the Essentials of Craftsmanship | да | ISBN-10 заменён: старый 1561586200 отдаёт 404, у настоящего контрольный символ X |
| schwarz-toolchest | 0578084139 | The Anarchist's Tool Chest | да | ISBN-10 заменён: старый 0982378130 отдаёт 404 |
| hylton-cabinetmaking | 1565233697 | Illustrated Cabinetmaking (Fox Chapel) | да | ISBN-10 подтвердился, издатель исправлен на Fox Chapel Publishing |
| pekovich-why-how | 1631869272 | The Why & How of Woodworking | да | ISBN-10 заменён: старый 1631869310 ведёт на план верстака Fine Woodworking |
| spagnuolo-hybrid | 1440329605 | Hybrid Woodworking (Popular Woodworking) | да | ISBN-10 заменён, издатель исправлен на Popular Woodworking Books |
| jackson-day-manual | 0679766111 | The Complete Manual of Woodworking | да | ISBN-10 подтвердился, издатель исправлен на Knopf |

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
