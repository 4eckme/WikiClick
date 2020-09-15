# WikiClick - русскоязычный вики-движок для node.js.

Разработка используется на сайте wikiclick.ru. Сервер движка использует фреймворк express и базу данных MySQL, а на фронтенде - jQuery. Серверная часть написана чуть более чем в 1000 строк и помещена в один файл. Многие функции движка реализованы на стороне клиента, например, навигационное оглавление для статей, закладки, вывод дерева комментариев. На главной странице движка ведется журнал версий публикаций и журнал комментариев со ссылками на последние обновления сайта. В WikiClick нет регистрации, но публикация статей и комментариев защищена каптчей, как и вход в админ-панель. Также, собственные комментарии на страницах можно редактировать (до тех пор пока не истекло время сессии), а IP адреса авторов записываются в БД. Администратору сайта доступны дополнительные возможности, после авторизации - он может удалять старые (и новые) версии публикаций, удалять комментарии и перемещать или переименовывать страницы, просматривать IP авторов правок.

# Структура сайта на WikiClick

Статьи имеют уникальную alias-ссылку, принадлежат к какому либо разделу из списка. Навигация по статьям трех видов: выбор по разделу, отборка статей по хештегу и полнотекстовой поиск - все 3 варианта снабжены кратким описанием с картинкой-превью и разбиваются на страницы при большом количестве результатов. Страницы сайта верстаются как под HTML, где разрешена правка css стилей элементов, есть загрузка картинок. В просмотре страницы кроме основной информации отображаются датированные ссылки на последние правки и доступно комментирование. Можно создавать служебные страницы защищенные от редактирования в структуре движка и по желанию добавлять или не добавлять к ним комментарии (как пример /статистика@материалы/)

# Ссылки:

http://wikiclick.ru - официальный сайт движка а также свободная энциклопедия IT-проектов
