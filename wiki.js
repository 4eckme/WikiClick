var site_url = 'http://wikiclick.ru';
var session_secret = '****************';

var auth = {
	login: 'Admin',
	password: '****************'
}

var db_settings = {
    host     : 'localhost',
    user     : 'root',
    password : '****************',
    database : 'wikiclick',
    multipleStatements: true
}

var cookie_settings = {
    secure: false,
    maxAge: 1000 * 3600 * 24 * 30,
    expires: new Date(Date.now() + 1000 * 3600 * 24 * 30),
    httpOnly: false,
    path: '/',
    domain: 'wikiclick.ru'
}

var SITE_NAME="WikiClick";
var DESCRIPTION='Открытая wiki-энциклопедия для IT-проектов. Тут можно рассказать о своем сайте, приложении, сервисе, игре или другой разработке.';
var KEYWORDS = 'wiki, каталог, разработка, сайты, сервисы, приложения, игры';

var cats = {
	'dev': 'Разработка',
	'services': 'Сервисы',
	'web': 'Веб-сайты',
	'games:browser': 'Браузерные игры',
	'games': 'Игры',
	'apps': 'Приложения',
	'apps:mobile': 'Мобильные приложения',
	'games:mobile': 'Мобильные игры'
}


function cats_links() {
	var result = '';
	for (var i in cats) {
		result += '<a href="/'+i+'/">'+cats[i]+'</a>';
	}
	return result;
}
function cats_options(val) {
	var result = '';
	for (var i in cats) {
		result += '<option value="'+i+'" '+((i==val)?'selected':'')+'>'+cats[i]+'</option>';
	}
	return result;
}

var pagination = function() { return {
	page: 1,
	limit: 100,
	count: 0,
	pages: 0,
	set_count: function (c) {
		this.count = c;
		this.pages = Math.ceil(this.count/this.limit);
	},	
	sql: function() {
		return 'ORDER BY p.alias ASC LIMIT '+this.limit*(this.page-1)+', '+this.limit
	},
	html: function () {
		chain = Array();
		for(i=1; i<=this.pages; i++) {
			clss = ((i == this.page) ? 'class="selected"' : '');
			chain.push('<a href="страница_'+i+'" '+clss+'>'+i+'</a>');
		}
		return '<h3 class="pages"><span>Страницы:</span><div class="pages">'+chain.join('')+'</div></h3>';
	}	
}}

var http = require('http')
var express = require('express');
var dateFormat = require('dateformat');
var sanitizeHtml = require('sanitize-html');
var fs = require('fs');
var session = require('express-session');
var svgCaptcha = require('svg-captcha');
svgCaptcha.options.width = 84;
svgCaptcha.options.height = 50;

var mysql = require('mysql');
var connection = mysql.createConnection(db_settings);
connection.config.queryFormat = function (query, values) {
    if (!values) return query;
    return query.replace(/\:(\w+)/g, function (txt, key) {
      if (values.hasOwnProperty(key)) {
        return this.escape(values[key]);
      }
        return txt;
    }.bind(this));
};
connection.connect();

var bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({extended: true});

var rand = require('random-int');
var multer = require('multer');

var formData = require("express-form-data");
var app = express();
const options = {
  uploadDir: __dirname + '/public/uploads',
  extended: true
};
app.use(formData.parse(options));

app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
jsonParser = bodyParser.json();
app.use(jsonParser);

app.use(express.static(__dirname + '/public'));

var sessionMiddleware = session({
  secret: session_secret,
  resave: true,
  saveUninitialized: true,
  cookie: cookie_settings,
  ///tore: new MongoStore({
  //  mongooseConnection: mongoose.connection,
  //  ttl: 3600 * 24,
  //  autoRemove: 'native'
  //})
});
app.use(sessionMiddleware);



var im = require('imagemagick');
var gm = require('gm').subClass({imageMagick: true});
var child_process = require('child_process');



var PagesCache = function () {
	connection.query('SELECT max(id) as mid FROM pages GROUP BY alias', {}, function(e, r, f) {
		console.log('get data for pagescache', {error:e});
		if (!e && r.length) {
			chain = new Array();
			for (var i in r) {
				chain.push('('+r[i].mid+')');
			}
			connection.query('delete from pagescache where true; insert into pagescache(id) values '+chain.join(',')+'; ', {}, function(e1, r1, f1) {
				console.log('set data for pagescache', {error:e1});
			})
		}
	});
}
PagesCache();
// setInterval(PagesCache, 1000*3600*24); //Ежедневное обновление актуальных версий страниц для тегов, категорий и поиска (в последней версии функция не нужна так как обновления происходят автоматически при создании и удалении новых версий страниц)

String.prototype.replaceArray = function(obj) {
    var replaceString = this;
    var regex;
    for (var i in obj) {
        regex = new RegExp(i, "gi");
        replaceString = replaceString.replace(regex, obj[i]);
    }
    return replaceString;
}

var links = '<strong><a href="/">Старт</a></strong><a href="http://host.wikiclick.ru">Хостинг</a>'+
'<br>'+
cats_links()+
'<br>'+
'<a href="/теги/">Теги</a>'+
'<a href="/случайная_страница/">Случайная страница</a>'+
'<a href="/статистика@материалы/">Сводка по материалам</a><br>'+
'<input type="text" class="iedit isearch" placeholder="Поиск">';

var allowed = 'allowedTags: [\n'+
'    h1, h2, h3, h4, h5, h6, blockquote, p, a, ul, ol, iframe\n'+
'    nl, li, b, i, strong, em, strike, code, hr, br, div,\n'+
'    table, thead, caption, tbody, tr, th, td, pre, span, img\n'+
']\n'+
'\n'+
'allowedAttributes: {\n'+
'    a: [href, target, style, class],\n'+
'    img: [src, class, width, height, style]\n'+
'    iframe: [width, height, src, frameborder, allow, allowfullscreen]\n'+
'    div: [class, style]\n'+
'    code: [class, style]\n'+
'    *: [style]\n'+
'}'
function Prepare(article) {
    
    article = sanitizeHtml(article, {
        allowedTags: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'iframe',
            'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
            'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img'
        ],
        allowedAttributes: {
            'a': ['href', 'target', 'style', 'class'],
            'img': ['src', 'class', 'width', 'height', 'style'],
			'iframe': ['width', 'height', 'src', 'frameborder', 'allow', 'allowfullscreen'],
			'div': ['class', 'style'],
			'code': ['class', 'style'],
			'*': ['style']
        }

    });
    return article;
}

function StripTags(value) {
	if (typeof value != 'string') value = value.toString();
	value=value.replace('>', '&gt;');
	value=value.replace('<', '&lt;');
	return value;
}

function AddEdit(res, req, table, data, tags_string) {
	
	subquery='';
	if (data.id === 0) { delete data.id; }
	else if (parseInt(data.id) > 0 && table=='pages') {
		console.log('subquery');
		subquery='delete from wikitags where pageid='+parseInt(data.id)+'; ';
	}
	
	if (table==="comments" && !data.name && !data.id) data.name = "Анонимус";

	table = table.replace(/[^a-z]/, '');

	fields = {ip:ip(req)};
	fields0 = {':ip':ip(req)};
	fields_chain = ['ip=:ip'];
	for (var key in data) {
		keystrip = key.replace(/[^a-z]/, '');
		if (keystrip.length && typeof data[keystrip] !== 'undefined') {		
			valstrip = ((keystrip==='article') ? Prepare(data[keystrip]) : StripTags(data[keystrip]));
			fields[keystrip]=valstrip;
			fields0[':'+keystrip]=valstrip;
			fields_chain.push(keystrip+'=:'+keystrip);
		}
	}
	
	connection.query(
		'insert into '+table+' ('+Object.keys(fields).join(', ')+') '+
		'values ('+Object.keys(fields0).join(', ')+') '+
        'on duplicate key update '+fields_chain.join(', '),
		fields, function(e, r, f) {
			console.log('e', e);
			if (!e) {
				if (table=='comments') {
					if (typeof req.session.mycomments == 'undefined' || !req.session.mycomments)
						req.session.mycomments = new Array();
					req.session.mycomments.push(parseInt(r.insertId));
				}
				if (table == 'pages' && req.params.cacheid && r.insertId) {
					connection.query('delete from pagescache where id=:cacheid; insert into pagescache values (:insertid);',
					{cacheid: req.params.cacheid, insertid: r.insertId}, function(e,r,f){});
				}
				if (table == 'pages' && data.description == 'Создание страницы') {
					connection.query('INSERT INTO pagescache VALUES (:id)', {id:r.insertId}, function(e,r,f){})
				}
				if (table == 'pages' && typeof tags_string !== 'undefined' && tags_string.length) {
					tags_string = StripTags(tags_string);
					tags_string = tags_string.replaceArray({',\\s+': ','});
					tags_string = tags_string.replaceArray({'\\s+': '_'});
					tags = tags_string.split(',', 10);
					query_tags = subquery+'insert into wikitags (pageid, tag, ip, date) values ';
					tags_chain = new Array();
					for (var i in tags) {
						tags_chain.push('(:pageid, '+connection.escape(tags[i].toLowerCase())+', :ip, NOW())')
					}
					connection.query(
						query_tags+tags_chain.join(','),
						{pageid:(r.insertId ? r.insertId : data.id), ip:ip(req)},
						function(e1, r2, f2) {
							console.log('e1', e1);
							if(!e1) {
									UploadPreview(req, res, (r.insertId ? r.insertId : data.id));
									res.redirect(site_url+"/"+fields['cat']+"/"+fields['alias']+"/");
							}
						}
					);
				}
				else if (table=="comments") {
					if (data.id) {
						res.end(JSON.stringify({success:true}));
					} else {
						res.end(JSON.stringify({id:r.insertId}));					
					}
					/*
					else if (typeof req.params != 'undefined' && typeof req.params.cat != 'undefined' && typeof req.params.alias != 'undefined')
						res.redirect("http://localhost:30000/"+req.params.cat+"/"+req.params.alias+"/");
					else
						res.redirect("http://localhost:30000/");
					*/
				}
			}
		}
	);
}

function ip(req) {
	return	(req.headers['x-forwarded-for'] || req.connection.remoteAddress);
}


var TAGS = function (req, res) {
	addslash(req, res);
	connection.query('select t.tag as tag, count(ch.id) as cnt from pagescache ch inner join wikitags t on ch.id = t.pageid group by t.tag having cnt>=2 order by cnt desc', {}, function(e, r, f) {
		var tags = new Array()
		for(var i in r) {
			tags[i] ='<a href="/теги/'+r[i].tag+'/" class="tag">#'+r[i].tag+'<span>'+r[i].cnt+'</span></a>';
		}
		fs.readFile(__dirname + '/views/Tags.html', 'utf8', function(err, contents) {
			res.end(contents.replaceArray({
				'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS, '%%links%%':links,
				'%%tags%%':tags.join('')
			}));
		});	
	});
}


var CAT = function (req, res) {

	if (req.params.cat == 'теги') TAGS(req, res); else {

		if (typeof req.params.page !== 'undefined') dropslash(req, res);
		else addslash(req, res);

		pp = pagination();
		if (typeof req.params.page != 'undefined') {
			pp.page = ((parseInt(req.params.page) > 0) ? parseInt(req.params.page) : 1);
		}
		connection.query(
			'select count(ch.id) as cnt from pagescache ch inner join pages p on p.id=ch.id and p.cat=:cat where true '+pp.sql()+'; '+
			'select ch.id, p.cat, p.alias, p.short, p.tagstring from pagescache ch inner join pages p on p.id=ch.id and p.cat=:cat where true '+pp.sql()+'; ',
			{cat:req.params.cat},
			function(e, r, f) {
				if (!e) {
					if(typeof cats[req.params.cat] == 'undefined') {
							res.status(404);
							fs.readFile(__dirname + '/views/404.html', 'utf8', function(err, contents) {
								res.end(contents.replaceArray({
									'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS, '%%links%%':links
								}));
								return false;
				  			});
					}


					pp.set_count(parseInt(r[0][0].cnt));

					if (r[0][0].cnt == 0) { empty = '<p><h3>Здесь пока пусто<h3></p>'; pphtml=""; }
					else {empty=''; pphtml= pp.html(); }

					pblocks = "";
					for(var i in r[1]){
						tags_arr = r[1][i].tagstring.replaceArray({',\\s+': ','}).split(',');
						for (var j in tags_arr) {
							tags_arr[j]='<a href="/теги/'+encodeURIComponent(tags_arr[j])+'/" class="tag">#'+tags_arr[j]+'</a>';
						}
						r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
						space_alias = r[1][i].alias.replaceArray({'_':' '});
						pblocks += '<div class="pblock"><div style="background-image:url('+site_url+'/uploads/'+r[1][i].id+'.preview.gif);" class="alias-preview"></div><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+space_alias+'</h2></a><p class="topmargin">'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
					}
							fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
								res.end(contents.replaceArray({
									'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
									'%%itemscount%%':r[0][0].cnt,
									'%%h1%%':'Категория: <span class="hcat">'+cats[req.params.cat]+'</span>',
									'%%h1text%%':'Категория: '+cats[req.params.cat]+' / Страница '+pp.page,
									'%%pblocks%%':pblocks,
									'%%empty%%':empty,
									'%%pagination%%': pphtml
								}));
				  			});
				}
			}
		);
	}
}

var TAG = function (req, res) {
	
	if (typeof req.params.page !== 'undefined') dropslash(req, res);
	else addslash(req, res);

	pp = pagination();
	if (typeof req.params.page != 'undefined') {
		pp.page = ((parseInt(req.params.page) > 0) ? parseInt(req.params.page) : 1);
	}
	connection.query(
		'select count(ch.id) as cnt from pagescache ch inner join pages p on p.id=ch.id inner join wikitags t on ch.id = t.pageid and t.tag=:tag where true '+pp.sql()+'; '+
		'select ch.id, p.cat, p.alias, p.short, p.tagstring from pagescache ch inner join pages p on p.id=ch.id inner join wikitags t on ch.id = t.pageid and t.tag=:tag where true '+pp.sql()+'; ',
		{tag:req.params.tag},
		function(e, r, f) {
			if (!e) {
				pp.set_count(r[0][0].cnt);
				if (r[0][0].cnt == 0) { empty = '<p><h3>Не найдено упоминаний этого тега<h3></p>'; pphtml='';}
				else { empty=''; pphtml=pp.html(); }
				h1 = 'Тег: <span class="htag">'+req.params.tag+'</span>';
				h1text = 'Тег: '+req.params.tag+' / Страница '+pp.page;
				pblocks = "";
				for(var i in r[1]){
					tags_arr = r[1][i].tagstring.split(',');
					for (var j in tags_arr) {
						tags_arr[j]='<a href="/теги/'+encodeURIComponent(tags_arr[j])+'/" class="tag">#'+tags_arr[j]+'</a>';
					}
					r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
					space_alias = r[1][i].alias.replaceArray({'_':' '});
					pblocks += '<div class="pblock"><div style="background-image:url('+site_url+'/uploads/'+r[1][i].id+'.preview.gif);" class="alias-preview"></div><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+space_alias+'</h2></a><h2 class="hcat"><a href="/'+r[1][i].cat+'/">'+cats[r[1][i].cat]+'</a></h2><p>'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
				}
						fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%itemscount%%':r[0][0].cnt,
								'%%h1%%':h1,
								'%%h1text%%':h1text,
								'%%pblocks%%':pblocks,
								'%%empty%%':empty,
								'%%pagination%%': pphtml
						    }));
			  			});
			}
		}
	);
}

var SEARCH = function (req, res) {

	console.log(req.params.page);

	if (typeof req.params.page !== 'undefined') dropslash(req, res);
	else addslash(req, res);

	pp = pagination();
	requery='+'+StripTags(req.params.query);
	if (typeof req.params.page != 'undefined') {
		pp.page = ((parseInt(req.params.page) > 0) ? parseInt(req.params.page) : 1);
	}
	connection.query(
		'select count(ch.id) as cnt from pagescache ch inner join pages p on p.id=ch.id WHERE MATCH (p.alias, p.short, p.tagstring, p.article) AGAINST (:query in boolean mode) '+pp.sql()+'; '+
		'select ch.id, p.cat, p.alias, p.short, p.tagstring from pagescache ch inner join pages p on p.id=ch.id WHERE MATCH (p.alias, p.short, p.tagstring, p.article) AGAINST (:query in boolean mode) '+pp.sql()+'; ',
		{query: requery},
		function(e, r, f) {
			console.log(e);
			if (!e) {
				pp.set_count(r[0][0].cnt);
				if (r[0][0].cnt == 0) { empty = '<p><h3>По Вашему запросу ничего не найдено<h3></p>'; pphtml='';}
				else { empty=''; pphtml=pp.html(); }
				h1 = 'Поиск: <span class="hquery">'+req.params.query+'</span>';
				h1text = 'Поиск: '+req.params.query+' / Страница '+pp.page;
				pblocks = "";
				for(var i in r[1]){
					tags_arr = r[1][i].tagstring.split(',');
					for (var j in tags_arr) {
						tags_arr[j]='<a href="/теги/'+encodeURIComponent(tags_arr[j])+'/" class="tag">#'+tags_arr[j]+'</a>';
					}
					r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
					space_alias = r[1][i].alias.replaceArray({'_':' '});
					pblocks += '<div class="pblock"><div style="background-image:url('+site_url+'/uploads/'+r[1][i].id+'.preview.gif);" class="alias-preview"></div><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+space_alias+'</h2></a><h2 class="hcat"><a href="/'+r[1][i].cat+'/">'+cats[r[1][i].cat]+'</a></h2><p>'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
				}
						fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%itemscount%%':r[0][0].cnt,
								'%%h1%%':h1,
								'%%h1text%%':h1text,
								'%%pblocks%%':pblocks,
								'%%empty%%':empty,
								'%%pagination%%': pphtml
						    }));
			  			});
			}
		}
	);
}



function special_add_comment (req, res) {
	check_captcha = req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha;
	if (!check_captcha) {res.end('Неправильно введена каптча'); req.session.captcha = ''; return false;}
	else {req.session.captcha = '';}
	if (req.body.parentid == 0) {
		AddEdit(res, req, 'comments', {
			id: 0,
			pagealias: req.params.tpl+'@'+req.params.mod,
			name: req.body.name,
			comment: req.body.comment,
			parentid: 0,
			level:0
		});
	} else {
		connection.query('select (level+1) as level from comments where id=:id limit 1', {id:req.body.parentid},
		function (e, r, f) {
			if(!e && r[0].level) {
				level = r[0].level;
				AddEdit(res, req, 'comments', {
					id: 0,
					pagealias: req.params.tpl+'@'+req.params.mod,
					name: req.body.name,
					comment: req.body.comment,
					parentid: req.body.parentid,
					level:level
				});
			}
		})
	}
}

function special_comments_json (req, res) {
	connection.query(
		'SELECT * FROM comments WHERE pagealias=:pagealias ORDER by parentid ASC, id ASC',
		{pagealias:req.params.tpl+'@'+req.params.mod},
		function(e,r,f) {
			if (!e) {
				if (typeof req.session.mycomments == 'undefined' || !req.session.mycomments)
						req.session.mycomments = new Array();
				console.log('my', req.session.mycomments);
				
				for (var i in r) {
					if (req.session.mycomments.includes(r[i].id)) r[i].my='my'; else r[i].my = '';
					r[i].date = dateFormat(r[i].date, "d mmmm yyyy HH:MM");
				}
				res.end(JSON.stringify({comments:r,  admin:(req.session.admin===true)}))
			}
		}
	);
};



var ob;
app.get('/:tpl@:mod/:action?', function (req, res) {
	addslash(req, res);
	req.params.tpl = req.params.tpl.replaceArray({'\\.': ''});
	req.params.mod = req.params.mod.replaceArray({'\\.': ''});
	
	if(req.params.action == 'comments-json') { special_comments_json(req, res);} else {

		if (!fs.existsSync(__dirname + '/views/special/'+req.params.tpl+'/'+req.params.mod+'.js') || !fs.existsSync(__dirname + '/views/special/'+req.params.tpl+'.html'))	{
			res.status(404);
			fs.readFile(__dirname + '/views/404.html', 'utf8', function(err, contents) {
				res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS, '%%links%%':links
				}));
			});
			return false;
		}
	

		var dn = __dirname;
		eval(fs.readFileSync(dn+'/views/special/'+req.params.tpl+'/'+req.params.mod+'.js'+'').toString());
		for (var i in ob) { if (i !== ('//'+req.params.action+'//') && (i.indexOf('//') == 0)) ob[i] = ''; }
		fs.readFile(dn+'/views/special/'+req.params.tpl+'.html', 'utf8', function(err, contents) {
			setTimeout(function() { contents = contents.replaceArray(ob);
			res.end(contents.replaceArray({
				'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS, '%%links%%':links,
			}))}, 500);
		});
	
	
		if (!(typeof req.params.action === 'undefined' || req.params.action && typeof(ob['//'+req.params.action+'//']) == 'string')) {
			res.status(404);
			fs.readFile(__dirname + '/views/404.html', 'utf8', function(err, contents) {
				res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS, '%%links%%':links
				}));
			});
		}

	}
});

app.post('/:tpl@:mod/:action?', function (req, res) {
	
	req.params.tpl = req.params.tpl.replaceArray({'\\.': ''});
	req.params.mod = req.params.mod.replaceArray({'\\.': ''});
	
	if(req.params.action == 'add-comment') { special_add_comment(req, res); return false } 
})

app.get('/uploads/*+.preview.gif', function(req, res) {
    res.redirect(site_url+'/preview.gif');
});


app.get('/uploads/*+.preview.gif', function(req, res) {
    res.redirect(site_url+'/preview.gif');
});


app.get('/'+encodeURIComponent('поиск')+'/:query/', SEARCH);

app.get('/'+encodeURIComponent('поиск')+'/:query/'+encodeURIComponent('страница_')+':page', SEARCH);

app.get('/admin/', function (req, res) {
	addslash(req, res);
	if(req.session.admin === true) {
		fs.readFile(__dirname + '/views/Admin.html', 'utf8', function(err, contents) {
			res.end(contents.replaceArray({
				'%%sitename%%':SITE_NAME,  '%%links%%':links, '%%login%%':auth.login
			}));
		});
	} else {
		fs.readFile(__dirname + '/views/Login.html', 'utf8', function(err, contents) {
			res.end(contents.replaceArray({
				'%%sitename%%':SITE_NAME,  '%%links%%':links,
				'%%login%%':'', '%%password%%':'',
				'%%danger%%':'', '%%dangercaptcha%%':''
			}));
		});
	}
});
app.post("/admin/", function (req, res) {
	if (req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha) {
		if (req.body.login.toLowerCase() === auth.login.toLowerCase() && req.body.password === auth.password) {
			req.session.captcha = ''
			req.session.admin = true;			
			fs.readFile(__dirname + '/views/Admin.html', 'utf8', function(err, contents) {
				res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%links%%':links, '%%login%%':auth.login
				}));
			});
		} else {
			fs.readFile(__dirname + '/views/Login.html', 'utf8', function(err, contents) {
				res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%links%%':links,
					'%%login%%':req.body.login, '%%password%%':req.body.password,
					'%%danger%%':'danger', '%%dangercaptcha%%':''
				}));
			});
		}
	} else {
		fs.readFile(__dirname + '/views/Login.html', 'utf8', function(err, contents) {
			res.end(contents.replaceArray({
				'%%sitename%%':SITE_NAME,  '%%links%%':links,
				'%%login%%':req.body.login, '%%password%%':req.body.password,
				'%%danger%%':'', '%%dangercaptcha%%':'danger'
			}));
		});	
	}
})

function addslash(req, res) {
	if (req.url.substring(req.url.length-1) !== '/') 
		res.redirect(req.url+'/')
}
function dropslash(req, res) {
	if (req.url.substring(req.url.length-1) === '/')
		res.redirect(req.url.substring(0, req.url.length-1));
}

app.get('/', function (req, res) {
	connection.query(
		'SELECT count(id) as comcnt FROM comments WHERE pagealias=:pagealias; '+
		'SELECT id, name, date, pagealias FROM comments ORDER BY date DESC LIMIT 15; '+
		'SELECT id, cat, alias, description, date FROM pages ORDER BY date DESC LIMIT 15; ',
		{pagealias:'/'},
		function(e, r, f){
			if(!e && r[0].length) {
				fs.readFile(__dirname + '/views/Start.html', 'utf8', function(err, contents) {
					
					journal_comments = "";
					for (var i in r[1]) {						
						if (i==0 || r[1][i].pagealias != r[1][i-1].pagealias) {
							if (r[1][i].pagealias == '/') {pa = ['wikiclick', 'Главная страница']; page_alias = cat_href = '/'; alt=''; space_alias=pa[1]; page_alias=''}
							else if (r[1][i].pagealias.indexOf('@')>0) {['wikiclick', r[1][i].pagealias]; page_alias = '/'+r[1][i].pagealias+''; cat_href = ''; alt=' title="Служебная страница" ';space_alias=r[1][i].pagealias;pa=['cлужебная',r[1][i].pagealias];}
							else {
								
								pa = r[1][i].pagealias.split('/');
								cat_href="/"+pa[0]+'/';
								space_alias = pa[1].replaceArray({'_':" "});
								page_alias = r[1][i].pagealias;
								if (typeof cats[pa[0]] != 'undefined') alt='title="'+cats[pa[0]]+'"';
								else alt = '';
							}
							journal_comments += '<div class="line"><strong><a href="'+page_alias+'/">'+space_alias+'</a><span class="gray"><a href="'+cat_href+'" '+alt+'>['+pa[0]+']</a></span></strong></div>';
						}
						pagealias = ((r[1][i].pagealias == '/') ? '' : r[1][i].pagealias);
						journal_comments += '<a href="'+pagealias+'/#/комментарии/'+r[1][i].id+'"><span class="log-comment">'+r[1][i].name+'</span>';
						journal_comments += '<span class="time">'+dateFormat(r[1][i].date, "d mmmm HH:MM")+'</span></a>';
						journal_comments += '<br>';
					}
					
					journal_pages = "";
					for (var i in r[2]) {
						
						space_alias = r[2][i].alias.replaceArray({"_":" "});
							
						if (typeof cats[r[2][i].cat] != 'undefined') alt='title="'+cats[r[2][i].cat]+'"';
						else alt = '';

						if (i==0 || r[2][i].cat+'/'+r[2][i].alias != r[2][i-1].cat+'/'+r[2][i-1].alias) {
							journal_pages += '<div class="line"><strong><a href="/'+r[2][i].cat+'/'+r[2][i].alias+'/">'+space_alias+'</a><span class="gray"><a href="/'+r[2][i].cat+'/" '+alt+'>['+r[2][i].cat+']</a></span></strong></div>';
						}
						if (!r[2][i].description) desc = 'Какие-то правки'
						else if (r[2][i].description.length >= 32) desc = r[2][i].description.substring(0,32)+'...';
						else desc = r[2][i].description;
						journal_pages += '<a href="/'+r[2][i].cat+'/'+r[2][i].alias+'/индекс_'+r[2][i].id+'" alt="'+r[2][i].description+'"><span class="log-comment">'+desc+'</span>';
						journal_pages += '<span class="time">'+dateFormat(r[2][i].date, "d mmmm HH:MM")+'</span></a>';
						journal_pages += '<br>';
					}
            
		            res.end(contents.replaceArray({
						'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
						'%%comcnt%%':r[0][0].comcnt,
						'%%comments%%':'',
						'%%JC%%':journal_comments,
						'%%JP%%':journal_pages
					}));
    			});
			}
		}
	);
});

app.get('/captcha/', function (req, res) {
    var captcha = svgCaptcha.create();
    req.session.captcha = captcha.text;
    
    res.type('svg');
    res.status(200).send(captcha.data);
});

app.post('/check-captcha/', function (req, res) {
	res.end(JSON.stringify({success:(req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha)}))
});

app.get('/'+encodeURIComponent('случайная_страница')+'/', function (req, res) {
	connection.query('select ch.id, p.cat, p.alias FROM pagescache ch inner join pages p on ch.id=p.id order by rand() limit 1', {}, function(e, r, f) {
		if (!e && r.length) {
			res.redirect(site_url+'/'+r[0].cat+'/'+r[0].alias+'/');
		}
	});
});

app.get('/'+encodeURIComponent('теги')+'/:tag/', TAG);

app.get('/'+encodeURIComponent('теги')+'/:tag/'+encodeURIComponent('страница_')+':page', TAG);

app.get('/comments-json/', function (req, res) {
	connection.query(
		'SELECT * FROM comments WHERE pagealias=:pagealias ORDER by parentid ASC, id ASC',
		{pagealias:'/'},
		function(e,r,f) {
			if (!e) {
				if (typeof req.session.mycomments == 'undefined' || !req.session.mycomments)
						req.session.mycomments = new Array();
				console.log('my', req.session.mycomments);
				
				for (var i in r) {
					if (req.session.mycomments.includes(r[i].id)) r[i].my='my'; else r[i].my = '';
					r[i].date = dateFormat(r[i].date, "d mmmm yyyy HH:MM");
				}
				res.end(JSON.stringify({comments:r,  admin:(req.session.admin===true)}))
			}
		}
	);
});

app.post('/ajax-delete-comment', function (req, res) {
	if(req.session.admin !== true) {
		res.end(JSON.stringify({success:false}));
		return false;	
	} else {
		connection.query('delete from comments where id=:id', {id:req.body.id}, function(e, r, f) {
			if (!e) {
				res.end(JSON.stringify({success:true}));
			}		
		});
	}
})

app.post('/ajax-edit-comment/', function (req, res) {
	if (typeof req.session.mycomments == 'undefined' || !req.session.mycomments)
						req.session.mycomments = new Array();
	if(!req.session.mycomments.includes(parseInt(req.body.id))) {
		res.end(JSON.stringify({success:false}));
		return false;	
	}
	AddEdit(res, req, 'comments', {
			id: req.body.id,
			comment: req.body.comment
	});
})


app.post('/add-comment/', function (req, res) {
	check_captcha = req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha;
	if (!check_captcha) {res.end('Неправильно введена каптча'); req.session.captcha = ''; return false;}
	else {req.session.captcha = '';}
	if (req.body.parentid == 0) {
		AddEdit(res, req, 'comments', {
			id: 0,
			pagealias: '/',
			name: req.body.name,
			comment: req.body.comment,
			parentid: 0,
			level:0
		});
	} else {
		connection.query('select (level+1) as level from comments where id=:id limit 1', {id:req.body.parentid},
		function (e, r, f) {
			if(!e && r[0].level) {
				level = r[0].level;
				AddEdit(res, req, 'comments', {
					id: 0,
					pagealias: '/',
					name: req.body.name,
					comment: req.body.comment,
					parentid: req.body.parentid,
					level:level
				});
			}
		})
	}
});


app.get('/'+encodeURIComponent('создать')+'/', function (req, res) {

	addslash(req, res);

	fs.readFile(__dirname + '/views/New.html', 'utf8', function(err, contents) {
            
                res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
					'%%allowed%%':allowed,
					'%%danger%%':'',
					'%%dangercaptcha%%':'',
                    '%%id%%': 0,
					'%%alias%%':'',
					'%%short%%':'',
					'%%article%%':
						'<h1>Основной заголовок</h1>\n'+
						'Ваш текст\n'+
						'\n'+
						'<h2>Заголовок второго уровня</h2>\n'+
						'Ваш текст\n'+
						'\n'+
						'<h3>Заголовок третьего уровня</h3>\n'+
						'Ваш текст<br>\n'+
						'<a href="/logo.png" target="_blank" class="img"><img src="/logo.png"></a>',
					'%%cat%%':'dev',
					'%%tags%%':'',
					'%%selectoptions%%':cats_options('dev')
                }));
    });
});

app.post('/'+encodeURIComponent('создать')+'/', function (req, res) {
	
	console.log(req.body);
	req.body.alias = req.body.alias.replaceArray({'\\s+': '_'});
	req.body.tags = req.body.tags.replaceArray({',\\s+': ','});
	req.body.tags = req.body.tags.replaceArray({'\\s+': '_'});

	check_captcha = req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha;
	if (!check_captcha) {
		req.session.captcha = '';
		fs.readFile(__dirname + '/views/New.html', 'utf8', function(err, contents) {
		        res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
					'%%allowed%%':allowed,
					'%%danger%%':'',
					'%%dangercaptcha%%':'danger',
		            '%%id%%': 0,
			    	'%%alias%%':req.body.alias,
					'%%short%%':req.body.short,
					'%%article%%':req.body.article,
					'%%cat%%':req.body.cat,
					'%%tags%%':req.body.tags,
					'%%selectoptions%%':cats_options(req.body.cat)
		        }));
    		});
		return false;
	} else {
		req.session.captcha = '';
	}
	
	connection.query('select id from pages where alias=:alias limit 1', {alias:req.body.alias},
	function(e, r, f) {
		
		if(!e && r.length == 0 && req.body.alias.length >= 2) {
			req.session.captcha = '',
			console.log(e);
			//req.body.article = req.body.article.replaceArray({'\n': '<br>'});
			AddEdit(res, req, 'pages', {
				id: 0,
				alias: req.body.alias,
				short:req.body.short,
				article:req.body.article,
				cat:req.body.cat,
				description:'Создание страницы',
				tagstring: req.body.tags
			}, req.body.tags);
		} else if (!e && r.length >= 1) {
			fs.readFile(__dirname + '/views/New.html', 'utf8', function(err, contents) {
		        res.end(contents.replaceArray({
					'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
					'%%allowed%%':allowed,
					'%%danger%%':'danger',
		            '%%id%%': 0,
			    	'%%alias%%':req.body.alias,
					'%%short%%':req.body.short,
					'%%article%%':req.body.article,
					'%%cat%%':req.body.cat,
					'%%tags%%':req.body.tags,
					'%%selectoptions%%':cats_options(req.body.cat)
		        }));
    		});
		}
	});
});

app.get('/:cat/'+encodeURIComponent('страница_')+':page/', CAT);

app.get('/:cat/:alias/', function (req, res) {

	addslash(req, res);

	console.log(req.params);
	connection.query(
		'SELECT * FROM pages WHERE alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 1',
		{alias:req.params.alias, cat:req.params.cat},
		function (e, r, f) {
			console.log(e);
			if(!e && r.length) {
				connection.query(
					'SELECT id, tag FROM wikitags WHERE pageid=:pageid ORDER BY id ASC LIMIT 10; '+
					'SELECT count(id) as comcnt FROM comments WHERE pagealias=:pagealias; '+
					'SELECT id, date, ip FROM pages WHERE alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 10',
					{pageid:r[0].id, pagealias:req.params.cat+'/'+req.params.alias, alias:req.params.alias, cat:req.params.cat},
					function (e1, r1, f1) {
						console.log(this.sql);
						console.log(e1);
						tags = new Array();
						for (var i in r1[0]) {
							tags.push('<a class="tag" href="/теги/'+encodeURIComponent(r1[0][i].tag)+'/">#'+r1[0][i].tag+'</a>')
						}
						versions = new Array();
						for (var i in r1[2]) {
							adminfo=""; if (req.session.admin === true) adminfo = "class='cursor-q' title='IP "+r1[2][i].ip+"'";
							versions.push('<a href="индекс_'+r1[2][i].id+'" '+adminfo+'><h3>'+dateFormat(r1[2][i].date, 'd mmmm yyyy HH:MM')+'</h3></a>')
						}
						fs.readFile(__dirname + '/views/Page.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%title%%':cats[r[0].cat]+': '+r[0].alias.replaceArray({'_':' '}),
						        '%%id%%': r[0].id,
								'%%alias%%': r[0].alias,
								'%%short%%': r[0].short,
								'%%article%%': r[0].article,
								'%%cat%%':r[0].cat,
								'%%tags%%':tags.join(''),
								'%%comcnt%%':r1[1][0].comcnt,
								'%%comments%%':'',
								'%%versions%%':versions.join(''),
								'%%tagstring%%':r[0].tagstring
						    }));
			  			});
					}
				);
			}
		}
	);
});

app.get('/:cat/:alias/'+encodeURIComponent('индекс_')+':id', function (req, res) {

	dropslash(req, res);

	console.log(req.params);
	connection.query(
		'SELECT * FROM pages WHERE id=:id AND alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 1',
		{id:req.params.id, alias:req.params.alias, cat:req.params.cat},
		function (e, r, f) {
			console.log(e);
			if(!e && r.length) {
				connection.query(
					'SELECT id, tag FROM wikitags WHERE pageid=:pageid ORDER BY id ASC LIMIT 10; '+
					'SELECT count(id) as comcnt FROM comments WHERE pagealias=:pagealias; ',
					{pageid:r[0].id, pagealias:req.params.cat+'/'+req.params.alias},
					function (e1, r1, f1) {
						console.log(this.sql);
						console.log(e1);
						tags = new Array();
						for (var i in r1[0]) {
							tags.push('<a class="tag" href="/теги/'+r1[0][i].tag+'/">#'+r1[0][i].tag+'</a>')
						}
						adminfo=""; if (req.session.admin === true) adminfo = "class='cursor-q' title='IP "+r[0].ip+"'";
						fs.readFile(__dirname + '/views/Version.html', 'utf8', function(err, contents) {
							rm_link = '';
							if (req.session.admin) {
								rm_link = '<a class="ochoba rmv" href="/'+req.params.cat+'/'+req.params.alias+'/индекс_'+req.params.id+'/удалить" onclick="return confirm()">Удалить</a>';
							}
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%title%%':cats[r[0].cat]+': '+r[0].alias.replaceArray({'_':' '}),
						        '%%id%%': r[0].id,
								'%%alias%%': r[0].alias,
								'%%short%%': r[0].short,
								'%%article%%': r[0].article,
								'%%cat%%':r[0].cat,
								'%%tags%%':tags.join(''),
								'%%comcnt%%':r1[1][0].comcnt,
								'%%comments%%':'',
								'%%version%%':dateFormat(r[0].date, 'd mmmm yyyy HH:MM'),
								'%%tagstring%%':r[0].tagstring,
								'%%rmlink%%':rm_link,
								'%%adminfo%%':adminfo
						    }));
			  			});
					}
				);
			}
		}
	);
});

app.get('/:cat/:alias/'+encodeURIComponent('индекс_')+':id/'+encodeURIComponent('удалить'), function (req, res) {
	connection.query(
		'SELECT p.id as pid from pages p inner join pagescache ch on p.id = ch.id and p.alias=:alias and p.cat=:cat',
		{alias:req.params.alias, cat:req.params.cat},
		function (e, r, f)	{
			pid = 0; if (r.length) pid = r[0].pid;
			res.redirect(req.url+'/'+pid)
		}
	);
});
app.get('/:cat/:alias/'+encodeURIComponent('индекс_')+':id/'+encodeURIComponent('удалить')+'/:cacheid', function (req, res) {
	
	if(req.session.admin !== true) {res.end(); return false;}	
	
	connection.query(
		'SELECT * FROM pages WHERE alias=:alias AND cat=:cat AND id=:id ORDER BY id DESC LIMIT 1',
		{alias:req.params.alias, cat:req.params.cat, id:req.params.id},
		function (e0, r0, f0) {
			if(!e0 && r0.length) {
				connection.query(
					'DELETE from pages where id=:id; DELETE from wikitags where pageid=:id; ',
					{id:req.params.id, cat:req.params.cat, alias:req.params.alias},
					function(e1, r1, f1) {
						if (!e1) fs.unlink(__dirname+'/public/uploads/'+parseInt(req.params.id)+'.preview.gif', function() { });
						if (parseInt(req.params.cacheid)==parseInt(req.params.id)) {
							connection.query(
								'DELETE from pagescache where id=:cacheid; '+
								'insert into pagescache (select max(id) from pages where alias=:alias and cat=:cat)',
								{cacheid:req.params.cacheid, alias:req.params.alias, cat:req.params.cat},
								function (e,r,f) {console.log(e, this.sql)
									if (typeof r[1] != 'undefined' && parseInt(r[1].insertId))
										res.redirect(site_url+'/'+req.params.cat+'/'+req.params.alias+'/');
									else
										res.redirect(site_url);					
								}
							);
						} else {
							res.redirect(site_url+'/'+req.params.cat+'/'+req.params.alias+'/');
						}
						
					}
				);
			}
		}
	);
});

dateFormat.i18n = {
    dayNames: [
        'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ],
    monthNames: [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ],
    timeNames: [
        'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
    ]
};

app.get('/:cat/:alias/comments-json/', function (req, res) {
	connection.query(
		'SELECT * FROM comments WHERE pagealias=:pagealias ORDER by parentid ASC, id ASC',
		{pagealias:req.params.cat+'/'+req.params.alias},
		function(e,r,f) {
			if (!e) {
				if (typeof req.session.mycomments == 'undefined' || !req.session.mycomments)
						req.session.mycomments = new Array();
				console.log('my', req.session.mycomments);

				for (var i in r) {
					if (req.session.mycomments.includes(r[i].id)) r[i].my='my'; else r[i].my = '';
					r[i].date = dateFormat(r[i].date, "d mmmm yyyy HH:MM")
				}
				res.end(JSON.stringify({comments:r, admin:(req.session.admin===true)}))
			}
		}
	);
});

app.get('/:cat/:alias/'+encodeURIComponent('переместить')+'/', function (req, res) {
	addslash(req, res);
	if (req.session.admin !== true) {res.end(); return false;}
	connection.query(
		'SELECT cat, alias FROM pages WHERE alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 1',
		{alias:req.params.alias, cat:req.params.cat},
		function (e, r, f) {
			console.log(e);
			if(!e && r.length) {
				
						fs.readFile(__dirname + '/views/Move.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%alias%%': r[0].alias,
								'%%cat%%': r[0].cat,
								'%%selectoptions%%': cats_options(r[0].cat),
						    }));
			  			});

			}
		}
	);
});

app.post('/:cat/:alias/'+encodeURIComponent('переместить')+'/', function (req, res) {
	req.body.alias = req.body.alias.replaceArray({'\\s+': '_'});
	newpa = req.body.cat+'/'+req.body.alias;
	oldpa = req.body.oldcat+'/'+req.body.oldalias;
	if (req.session.admin !== true) {res.end(); return false;}
	connection.query(
		'update pages set alias=:alias, cat=:cat, date=date where alias=:oldalias and cat=:oldcat; '+
		'update comments set pagealias=:newpa, date=date where pagealias=:oldpa', 
		{alias:req.body.alias, cat:req.body.cat, oldalias:req.body.oldalias, oldcat:req.body.oldcat, newpa:newpa, oldpa:oldpa},
		function (e, r, f) {
			console.log(e);
			if(!e) {
				res.redirect(site_url+'/'+req.body.cat+'/'+req.body.alias+'/')
			}
		}
	);
});



app.get('/:cat/:alias/'+encodeURIComponent('редактировать')+'/', function (req, res) {
	addslash(req, res);
	connection.query(
		'SELECT * FROM pages WHERE alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 1',
		{alias:req.params.alias, cat:req.params.cat},
		function (e, r, f) {
			console.log(e);
			if(!e && r.length) {
				connection.query(
					'SELECT id, tag FROM wikitags WHERE pageid=:pageid ORDER BY id ASC LIMIT 10',
					{pageid:r[0].id},
					function (e1, r1, f1) {
						console.log(e1);
						tags = new Array();
						for (var i in r1) {
							tags.push(r1[i].tag)
						}
						fs.readFile(__dirname + '/views/Edit.html', 'utf8', function(err, contents) {
							if (req.session.admin === true) move_link = '<a href="../переместить/">Переместить</a>'; else move_link = '';
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%allowed%%':allowed,
								'%%alias%%': r[0].alias,
								'%%short%%': r[0].short,
								'%%article%%': r[0].article,
								'%%tags%%':tags.join(', '),
								'%%dangercaptcha%%':'',
								'%%movelink%%':move_link
						    }));
			  			});
					}
				);
			}
		}
	);
});

app.post('/:cat/:alias/'+encodeURIComponent('редактировать')+'/', function(req, res) {
	connection.query(
		'SELECT p.id as pid from pages p inner join pagescache ch on p.id = ch.id and p.alias=:alias and p.cat=:cat',
		{alias:req.params.alias, cat:req.params.cat},
		function (e, r, f) { req.session.ch = {id:r[0].pid, cat:req.params.cat, alias:req.params.alias}
			if ((req.body.captcha.length >=4) && (req.session.captcha == req.body.captcha))
				res.redirect(307, req.url+r[0].pid)
			else {
				fs.readFile(__dirname + '/views/Edit.html', 'utf8', function(err, contents) {
					if (req.session.admin === true) move_link = '<a href="../переместить/">Переместить</a>'; else move_link = '';
				    res.end(contents.replaceArray({
						'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
						'%%allowed%%':allowed,
						'%%alias%%': req.params.alias,
						'%%short%%': req.body.short,
						'%%article%%': req.body.article,
						'%%tags%%':req.body.tags,
						'%%dangercaptcha%%':'danger',
						'%%movelink%%':move_link
				    }));
			  	});
			}
		}	
	)
});

app.post('/:cat/:alias/'+encodeURIComponent('редактировать')+'/:cacheid', function(req, res) {

	if (!(req.session.ch.id==req.params.cacheid&&req.session.ch.alias==req.params.alias&&req.session.ch.cat==req.params.cat)) {res.end(); return false;}
	delete req.session.ch;
	
	req.body.tags = req.body.tags.replaceArray({',\\s+': ','});
	req.body.tags = req.body.tags.replaceArray({'\\s+': '_'});

	check_captcha = ((req.body.captcha.length >= 4) && (req.body.captcha == req.session.captcha));
	console.log(req.body.captcha, req.session.captcha);
	if (!check_captcha) {
		req.session.captcha='';
		//req.body.article = req.body.article.replaceArray({'\n': '<br>'});
						fs.readFile(__dirname + '/views/Edit.html', 'utf8', function(err, contents) {
							if (req.session.admin === true) move_link = '<a href="../переместить/">Переместить</a>'; else move_link = '';
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%allowed%%':allowed,
								'%%alias%%': req.params.alias,
								'%%short%%': req.body.short,
								'%%article%%': req.body.article,
								'%%tags%%':req.body.tags,
								'%%dangercaptcha%%':'danger',
								'%%movelink%%':move_link
						    }));
			  			});
	} else {
		req.session.captcha='';
	
		connection.query('select id, ip, date, description from pages where alias=:alias and cat=:cat order by id desc limit 1', {alias:req.params.alias, cat:req.params.cat},
		function(e, r, f) {
			if(!e && r.length >= 1) {
				console.log(e);
				console.log(r[0].ip, ip(req), dateFormat(r[0].date,'yyyy-mm-dd'), dateFormat(new Date(),'yyyy-mm-dd'))
				if (r[0].ip == ip(req)	&&	dateFormat(r[0].date,'yyyy-mm-dd') == dateFormat(new Date(),'yyyy-mm-dd') && r[0].description != 'Создание страницы') {
					AddEdit(res, req, 'pages', {
						id: r[0].id,
						alias: req.params.alias,
						short:req.body.short,
						article:req.body.article,
						cat:req.params.cat,
						description:req.body.description,
						tagstring:req.body.tags
					}, req.body.tags);
				} else {
					AddEdit(res, req, 'pages', {
						id: 0,
						alias: req.params.alias,
						short:req.body.short,
						article:req.body.article,
						cat:req.params.cat,
						description:req.body.description,
						tagstring:req.body.tags
					}, req.body.tags);
				}
			}
		});
	}
});

app.post('/:cat/:alias/add-comment/', function (req, res) {
	if (req.body.parentid == 0) {
		AddEdit(res, req, 'comments', {
			id: 0,
			pagealias: req.params.cat+'/'+req.params.alias,
			name: req.body.name ? req.body.name : 'Анонимус',
			comment: req.body.comment,
			parentid: 0,
			level:0
		});
	} else {
		connection.query('select (level+1) as level from comments where id=:id limit 1', {id:req.body.parentid},
		function (e, r, f) {
			if(!e && r[0].level) {
				level = r[0].level;
				AddEdit(res, req, 'comments', {
					id: 0,
					pagealias: req.params.cat+'/'+req.params.alias,
					name: req.body.name ? req.body.name : 'Анонимус',
					comment: req.body.comment,
					parentid: req.body.parentid,
					level:level
				});
			}
		})
	}
});


app.get('/:cat/', CAT);


function UploadPreview(req, res, id) {

	var storage = multer.diskStorage({
      destination: function (req, file, callback) {
        callback(null, __dirname + '/public/uploads/');
      },
      filename: function (req, file, callback) {
        mimetype = '';
        if (file.mimetype == 'image/jpeg') mimetype = '.jpg';
        if (file.mimetype == 'image/png') mimetype = '.png';
        if (file.mimetype == 'image/gif') mimetype = '.gif';     
        fileName = id+'.preview.gif';
        callback(null, fileName);
      }
    });

	var upload = multer({ storage : storage }).single('file', 1);
	if (req.files['preview'].type.substring(0, 6) == 'image/') {
		upload(req,res,function(err) {
			console.log(req.files['preview']);
			//res.end(req.file.filename);
			path = __dirname+'/public/uploads/'+id+'.preview.gif';
			console.log(path)
			gm(req.files['preview'].path).
		        quality(100).
		        geometry(240, 240, '>').
		        gravity('SouthEast').
		        noProfile().
		        write(path, function (err) {
		            child_process.exec('exiftool -comment="wiki engine http://wikiclick.ru" '+path, {shell: true, encoding: 'utf8'}, function (error, stdout, stderr) {
		                if (error) {throw error;}
		                console.log('stdout: ' + stdout);
		                console.log('stderr: ' + stderr);
						setTimeout(function() {
							console.log(req.files.preview.path, path)
							fs.unlink(req.files.preview.path, function() { });
							fs.unlink(path+'_original', function() { });
						}, 1000)
		            });
		        });
		});
	} else if (parseInt(req.params.cacheid) && parseInt(req.params.cacheid) != parseInt(id)) {
		fs.copyFile(__dirname+'/public/uploads/'+req.params.cacheid+'.preview.gif', __dirname+'/public/uploads/'+id+'.preview.gif', fs.constants.COPYFILE_EXCL, function(err) {console.log('copyerr', err)});
	}
}

app.post('/uploadone', multer(
			{ dest: 'uploads/',
			  filename: function (req, file, callback) {
        	  		mimetype = '';
        	  		if (file.mimetype == 'image/jpeg') mimetype = '.jpg';
        	  		if (file.mimetype == 'image/png') mimetype = '.png';
        	  		if (file.mimetype == 'image/gif') mimetype = '.gif';     
        	  		fileName = Date.now().toString(16)+mimetype;
        	  		callback(null, fileName);
      		  }
    		}).single('file'), function (req, res, next) {
	
		console.log(req, req.body);
		res.end(req.files.file.path.replace(__dirname+'/public/uploads/', ''));

});


app.listen(80, 'wikiclick.ru');
