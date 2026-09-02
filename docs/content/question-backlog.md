# Бэклог тем блога Endgrain Studio

Единый приоритезированный список тем, собранный из `docs/content/research-beginners.md`
(~73 вопроса новичков) и `docs/content/research-sellers.md` (~68 вопросов продавцов).
Пересекающиеся вопросы из двух ресерчей объединены в одну тему. Три темы уже закрыты
опубликованными статьями (проверено по `lib/blog/registry.ts`) и помечены `done <slug>`.

Формат строки: `- todo|done <slug> | приоритет P1/P2/P3 | вопрос EN как заголовок | тема-кластер | угол подачи и как встроить Endgrain Studio`.

Первые 10 тем ниже - готовый план на первые две недели: чередуются раскрой, узоры,
себестоимость, брак, материал, цена, производство, шлифовка и pillar-гайд, чтобы не
уйти в десять статей подряд про цену. `[ES!]` - продукт и есть ответ, `[ES]` - продукт
встраивается органично.

## План на первые две недели (топ-10)

- done shirina-polos-vtoroy-skleyki | P1 | How wide should the strips be for the second glue-up? | раскрой-и-геометрия | Ширина полосы второй склейки = толщина доски + припуск на выравнивание; калькулятор Endgrain Studio выдаёт число сразу по заданной толщине доски. [ES!]
- done free-end-grain-design-tool | P1 | Is there a free end grain cutting board design tool / calculator? | позиционирование-инструмента | Прямой ответ на вопрос ниши "чем считать" - обзор cbdesigner и калькуляторов board-foot, и почему Endgrain Studio закрывает то, что не умеет ни один из них (узор + распил + себестоимость в одном месте). [ES!]
- done real-cost-end-grain-cutting-board | P1 | What is the real cost to make an end grain cutting board? | себестоимость-и-цена | Разбивка по статьям (материал, клей, шкурка, масло, электричество) на примере доски 300x400 мм, с явным процентом отходов; калькулятор Endgrain Studio считает это по факту введённого узора, а не по прикидке. [ES!]
- done checkerboard-3d-cube-strip-widths | P1 | How do I design a checkerboard / brick / 3D cube pattern and figure out the strip widths? | сложные-узоры | Пошаговая геометрия трёх узоров с точными ширинами полос вместо "на глаз"; конструктор паттернов Endgrain Studio считает ширины и проверяет направление волокна автоматически. [ES!]
- done why-end-grain-board-warped | P1 | Why did my end grain cutting board warp / cup after glue-up? | брак-и-постмортем | Разбор причин (влажность заготовки, ориентация колец, перезажим) с конкретными цифрами по допустимой влажности; печатная инструкция студии фиксирует требования к заготовке перед склейкой. [ES]
- done board-feet-12x16-end-grain-board | P1 | How much wood (board feet) do I need for a 12x16 end grain board? | материал-и-отходы | Формула board feet с запасом на пропилы и строжку на конкретном примере 300x400 мм вместо расплывчатого "около 2.5 bf"; студия считает объём материала из готового узора. [ES!]
- done how-much-to-charge-end-grain-board | P1 | How much should I charge for an end grain cutting board? | себестоимость-и-цена | Цена выводится из реальной себестоимости и часов, а не копируется с чужого Etsy-листинга; калькулятор студии даёт цифру, от которой можно оттолкнуться. [ES!]
- done repeat-order-same-pattern | P1 | How do I reproduce the exact same pattern for a repeat order? | повторяемость-и-производство | Без сохранённой схемы повторить узор один в один почти невозможно; сохранённые проекты Endgrain Studio решают это буквально, конкурентов с этой функцией нет. [ES!]
- done planer-end-grain-cutting-board | P1 | Can I run an end grain cutting board through a thickness planer? | шлифовка-и-выравнивание | Честный разбор физики (нож вырывает волокно вертикально) и вечного спора "никогда" против "тонкими проходами делаю сотнями"; вечнозелёная тема с высоким трафиком по обеим аудиториям. [ES]
- done steps-to-make-end-grain-cutting-board | P1 | What are the steps to make an end grain cutting board, start to finish? | pillar-гайд | Полный пошаговый гайд как основной входной запрос ниши, с воронкой на планирование узора и распила через студию на этапе "спроектируй перед тем, как включить пилу". [ES]

## Остальной бэклог (P1)

- done kerf-and-milling-waste-budget | P1 | How much waste should I budget for kerf and milling? | материал-и-отходы | Процент отхода (25-30% на торцевых) почти никто не называет цифрой; студия показывает отход по конкретному узору и толщине пропила. [ES!]
- done board-cracked-along-glue-line | P1 | My board cracked along the glue line, what did I do wrong? | брак-и-постмортем | Разбор голодного шва, перезажима и разного движения древесины в паре пород на конкретных примерах пар пород. [ES]
- done losing-money-etsy-fees | P1 | Am I losing money selling cutting boards after Etsy fees? | себестоимость-и-цена | Комиссия площадки, офсайт-реклама и бесплатная доставка съедают 25-35% - разбор на примере одной продажи; поле комиссии в расчёте себестоимости студии. [ES!]
- done chevron-end-grain-board-angle | P1 | What angle do I cut for a chevron end grain board? | сложные-узоры | Геометрия шеврона на 45 и 65 градусов с разворотом через полосу; студия считает угол и ширину полос под нужный рисунок. [ES!]
- done over-tighten-clamps-starve-glue-joint | P1 | Can you over-tighten clamps and starve the glue joint? | клей-и-склейка | Частый постмортем "сжал сильнее, шов развалился при втором распиле" с объяснением физики голодного шва и цифрами давления (150-250 psi). [ES]
- done glue-joints-fail-second-glue-up | P1 | Why did my glue joints fail on the second glue-up? | клей-и-склейка | Разбор четырёх причин (перезажим, кривая поверхность, старый клей, грязный торец) с диагностикой по внешнему виду шва. [ES]
- done care-card-cutting-board | P1 | What care card / instructions should I include when I gift or sell the board? | sale-prep-и-уход | Готовый текст памятки по уходу (масло, мойка, аллергены), который никто в нише не даёт целиком; sale-prep карточка студии генерирует его из параметров проекта. [ES!]
- done end-grain-vs-edge-grain | P1 | End grain vs edge grain: which should I make and why? | pillar-гайд | Таблица различий по износу ножа, цене, сложности и отходу материала - вечнозелёный сравнительный запрос с воронкой на первый проект в студии. [ES]
- done seven-glue-up-failures | P1 | 7 ways your end grain glue-up fails, and how to prevent each | постмортем-компиляция | Компиляция самых частых причин брака в формате списка с разбором каждой; самая горячая эмоциональная точка ниши по наблюдениям обоих ресерчей, хороший линкбейт. [ES]
- done crosscut-wide-panel-table-saw-sled | P1 | How do I safely crosscut a wide glued-up panel on a table saw sled? | раскрой-и-геометрия | Панель после первой склейки становится длиннее ширины стандартного sled - разбор безопасного реза с стоп-блоком и размерами sled под конкретную панель. [ES]

## P2

- todo | P2 | Why are end grain cutting boards so expensive to buy? | себестоимость-и-цена | Ответ через число операций (две склейки, шлифовка торца) и процент отхода, а не через "ручная работа"; чистый PAA-запрос с большим объёмом трафика. [ES]
- todo | P2 | Materials + labor x2 = wholesale, x4 = retail: does this formula work for cutting boards? | себестоимость-и-цена | Почему формула занижает цену торцевой доски из-за двух склеек и повышенного отхода, с числовым примером. [ES]
- todo | P2 | Why do my Etsy competitors sell end grain boards for $35? | себестоимость-и-цена | Разбор трёх причин (edge grain под видом торцевой, перепродажа импорта, продавец в минусе) с проверкой по фото. 
- todo | P2 | Is making cutting boards to sell actually profitable? | масштабирование-бизнеса | Честная арифметика часов на доску (6-8 часов реального времени) и точки окупаемости инструмента как хобби-бизнеса. [ES]
- todo | P2 | Can I cut the strips on a miter saw or bandsaw instead of a table saw? | раскрой-и-геометрия | Миттер даёт худшую перпендикулярность, бандсо - грубый рез под шлифовку; когда каждый вариант оправдан.
- todo | P2 | Do complex patterns actually sell for more? | сложные-узоры | 3D и шеврон уводят из ценовой войны с $35-досками - единственный товар без прямого аналога у соседа по ярмарке. [ES]
- todo | P2 | How much extra waste does a chevron or 3D pattern create? | сложные-узоры | Косые резы дают 40%+ отходов, это нужно закладывать в цену заранее; студия считает отход по конкретному углу и узору. [ES!]
- todo | P2 | Should I put a hardwood border/frame around an end grain field? | сложные-узоры | Почему рама из длинного волокна разрывает торцевое поле сезонными движениями, и как сделать рамку правильно.
- todo | P2 | 8/4 or 4/4 stock for end grain: which do I buy? | материал-и-отходы | 8/4 даёт меньше склеек и меньше отходов, но дороже за board foot - расчёт на конкретной толщине заготовки. [ES]
- todo | P2 | Where do I buy hardwood for cutting boards and what does it cost per board foot? | материал-и-отходы | Почему не Home Depot, а лесосклад, и разница в цене в разы на примере клёна. [ES]
- todo | P2 | What glue is food safe for cutting boards, Titebond II or III? | клей-и-склейка | Оба FDA indirect food contact, но III лучше держит воду и даёт больше open time - когда это критично.
- todo | P2 | How many clamps do I need and how much clamping pressure? | клей-и-склейка | Кламп каждые 150 мм, 150-250 psi, риск перетянуть - с оговоркой про кауль и распределение давления.
- todo | P2 | How thick should an end grain cutting board be? | толщина-и-размеры | Диапазон 32-50 мм (1.25-2 дюйма) и почему тонкая доска ведёт и трескается; студия связывает толщину с шириной полос второй склейки. [ES]
- todo | P2 | Should I make face grain or end grain with the stock I have? | толщина-и-размеры | Типичный пост новичка с фото пиломатериала - прямой ответ "с 19 мм делай продольную склейку, торцевая требует толще".
- todo | P2 | How do I flatten an end grain board without a planer or drum sander? | шлифовка-и-выравнивание | Router sled, ленточная шлифмашина, ROS, ручной рубанок с низким углом - сравнение по времени и цене входа.
- todo | P2 | What grit sequence for an end grain cutting board? | шлифовка-и-выравнивание | 80/120 до 220, дальше смысла нет - торец всё равно поднимет ворс; с оговоркой про подъём ворса водой.
- todo | P2 | What finish is food safe for a cutting board? | финиш-и-уход | Минеральное масло, воск, tung - что реально безопасно и почему bling-финишей на кухонной доске быть не должно.
- todo | P2 | Mineral oil vs beeswax mix vs board butter: what actually works? | финиш-и-уход | Рецепт масло-воск 5-6:1 и объяснение, что воск - барьер, а не защита сама по себе.
- todo | P2 | Can I put a wooden cutting board in the dishwasher, and how do I wash it? | финиш-и-уход | Категорическое "нет" плюс инструкция по мойке и сушке на ребре, включая как это объяснить покупателю.
- todo | P2 | How do I fix a warped or cracked board (or is it trash)? | брак-и-постмортем | Честный разбор, когда доску можно перестрогать через sled, а когда переклеивать заново - критерии починки против выброса.
- todo | P2 | Can I mix face grain strips into an end grain board? | брак-и-постмортем | Технически можно, но это классический источник трещин из-за разного движения древесины - с валидацией конструкции.
- todo | P2 | Where is the best place to sell handmade cutting boards? | продажа-и-каналы | Локально: ярмарки, фермерские рынки, бутики, сарафан - Etsy как витрина, а не как основной мотор продаж.
- todo | P2 | Is Etsy worth it for woodworkers in 2026? | продажа-и-каналы | Только с сильным SEO и нишевым продуктом в категории с 150 тысячами листингов - честная оценка входа.
- todo | P2 | How do I photograph a cutting board so it sells? | фото-и-листинги | Окно как источник света, белый отражатель, lifestyle-кадр на кухне - 6-8 фото, из которых студия закрывает превью-рендер узора. [ES]
- todo | P2 | How long does it take to make one end grain cutting board? | повторяемость-и-производство | Реальная оценка 3-8 часов работы плюс двое суток на клей, с разбивкой по операциям и где студия экономит время на планировании.
- todo | P2 | Is a drum sander worth it for cutting board production? | повторяемость-и-производство | Да при регулярной партии - 30 минут вручную на доску против машины, разбор окупаемости.
- todo | P2 | How much does it cost to ship a cutting board? | доставка-и-упаковка | $15-35 по США за среднюю доску, до $100 за крупную - вес считается из объёма и породы, что можно закладывать в расчёт заранее. [ES]
- todo | P2 | Is an end grain cutting board too hard for a first woodworking project? | pillar-гайд | Честное "сложнее, чем кажется, вот что пойдёт не так" с воронкой в планирование первого проекта. [ES]

## P3

- todo | P3 | Do I need kiln dried lumber, and what moisture content? | материал-и-отходы | Цифра 6-8% влажности и совет акклиматизировать заготовку неделю в мастерской перед склейкой. [ES]
- todo | P3 | Can I use scraps / pallet wood / whiskey barrel staves for an end grain board? | материал-и-отходы | Можно, если порода пищевая и влажность в норме - плюс как считать раскрой из разнокалиберных обрезков. [ES]
- todo | P3 | What blade should I use, rip or crosscut? | раскрой-и-геометрия | По факту это рип-рез вдоль волокна блока - glue line rip блад и почему обычный crosscut диск хуже.
- todo | P3 | Why are my cuts burning / scorching? | раскрой-и-геометрия | Тупой диск, неровный ход, слишком медленная подача - и почему прижоги на торце особенно трудно исправить шлифовкой.
- todo | P3 | Can I turn a customer's photo or quilt pattern into a board layout? | сложные-узоры | Многие геометрические узоры взяты из лоскутного шитья - как перевести фото или квилт в раскладку полос через студию. [ES!]
- todo | P3 | What is the minimum tool set to make an end grain cutting board? | инструменты-и-станки | Список: пила для точных резов, что-то для выравнивания, зажимы, шлифмашина - без лишнего.
- todo | P3 | Should I use a CNC for flattening and engraving? | инструменты-и-станки | Медленнее барабанника, но освобождает руки и даёт гравировку - спорная окупаемость, экспорт схемы под станок. [ES]
- todo | P3 | Is it safe to cut small end grain blocks on a table saw? | безопасность | Правила: sled, не короче безопасного минимума, никакого freehand, толкатели.
- todo | P3 | Should I sell wholesale to local shops instead of retail? | продажа-и-каналы | Да ради объёма, но нужна цена вдвое ниже розницы, что требует точной себестоимости. [ES]
- todo | P3 | How do I get repeat and word-of-mouth orders instead of one-offs? | продажа-и-каналы | Именные и корпоративные заказы, свадебные подарки - и как сохранённый проект превращается в повторный заказ в один клик. [ES]
- todo | P3 | Should I build my own website or stay on marketplaces? | продажа-и-каналы | Свой сайт для повторных клиентов, маркетплейсы для первого касания - и публичная ссылка на проект как мини-витрина.
- todo | P3 | What should I write in a cutting board listing description? | фото-и-листинги | Порода, точные размеры, торец против кромки, уход, срок изготовления - готовый шаблон описания. [ES!]
- todo | P3 | Should I show the making process in my listing photos? | фото-и-листинги | Да, схема склейки и процесс повышают доверие и оправдывают цену - печатная схема как дополнительный кадр листинга. [ES]
- todo | P3 | How do I plan a batch so all boards come out the same size? | повторяемость-и-производство | Единая панель первой склейки на несколько досок с общим списком деталей. [ES]
- todo | P3 | Can I size my boards to fit USPS flat rate boxes? | доставка-и-упаковка | Самый дешёвый лайфхак - проектировать под коробку, а не наоборот; задать целевой габарит в студии и получить узор под него. [ES!]
- todo | P3 | Can I compete with mass production and imported boards? | масштабирование-бизнеса | Нет по цене, только по узору, кастомизации и локальности - сложные схемы как основной дифференциатор. [ES]
- todo | P3 | When does it make sense to hire help or outsource glue-up? | масштабирование-бизнеса | После стабильных 20+ досок в месяц, первым делом отдают шлифовку - печатная инструкция как техкарта для помощника. [ES]
- todo | P3 | Do I need NSF or FDA certification for wooden boards? | юридика-и-food-safe | Для домашней кухни не нужна, для общепита нужен NSF, что для дерева практически недостижимо.
- todo | P3 | Should I warn buyers about walnut oil and nut allergies? | юридика-и-food-safe | Да, в описании и на карточке ухода - конкретная формулировка для листинга. [ES]
- todo | P3 | Do I need an LLC to sell cutting boards? | юридика-и-food-safe | Не обязательно, но защищает личные активы и нужна для оптовых клиентов.

## Закрытые темы

- done kerf-i-pripuski | P1 | How do I calculate the length of the first glue-up so I get enough strips? | раскрой-и-геометрия | Объединяет вопросы про длину первой склейки и потерю длины на пропил из обоих ресерчей (расчёт ширины заготовки: сумма толщин полос + припуск + kerf на число резов).
- done vybor-porod | P1 | What is the best wood for an end grain cutting board? | выбор-древесины | Объединяет вопросы про лучшую породу, запрещённые породы, дуб, орех, смешение пород и профпригодность пород для продажи.
- done shema-perekleyki | P2 | How do I stop losing track of which strip goes where during glue-up? | повторяемость-и-производство | Схема переклейки как ответ на нумерацию полос и раскладку перед склейкой (flip/mirror по рядам).

## Итого

23 закрытые темы + 48 тем в статусе todo (28 P2 + 20 P3) = 71 тема.
