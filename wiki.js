var db_settings = {
    host     : 'localhost',
    user     : 'root',
    password : '****************',
    database : 'wikiclick',
    multipleStatements: true
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
		return 'LIMIT '+this.limit*(this.page-1)+', '+this.limit
	},
	html: function () {
		chain = Array();
		for(i=1; i<=this.pages; i++) {
			clss = ((i == this.page) ? 'class="selected"' : '');
			chain.push('<a href="p.'+i+'" '+clss+'>'+i+'</a>');
		}
		return '<h3 class="pages"><span>Страницы:</span><div class="pages">'+chain.join('')+'</div></h3>';
	}	
}}

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
var urlencodedParser = bodyParser.urlencoded({extended: false});

var rand = require('random-int');
var multer = require('multer');

var app = express();

app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
jsonParser = bodyParser.json();
app.use(jsonParser);

app.use(express.static(__dirname + '/public'));

var cookie_settings = {
    secure: false,
    maxAge: 1000 * 3600 * 24 * 30,
    expires: new Date(Date.now() + 1000 * 3600 * 24 * 30),
    httpOnly: false,
    path: '/',
    domain: 'wikiclick.ru'
}

var sessionMiddleware = session({
  secret: '****************',
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
setInterval(PagesCache, 1000*3600*24);

String.prototype.replaceArray = function(obj) {
    var replaceString = this;
    var regex;
    for (var i in obj) {
        regex = new RegExp(i, "gi");
        replaceString = replaceString.replace(regex, obj[i]);
    }
    return replaceString;
}

var links = '<a href="/">Старт</a>'+
'<br>'+
cats_links()+
'<br><br>'+
'<a href="/random/">Случайная страница</a>'+
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
				if (typeof tags_string !== 'undefined' && tags_string.length) {
					tags_string = StripTags(tags_string);
					tags_string = tags_string.replaceArray({',\\s+': ','});
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
									res.redirect("http://wikiclick.ru/"+fields['cat']+"/"+fields['alias']+"/");
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


var CAT = function (req, res) {
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
						tags_arr[j]='<a href="/tag/'+encodeURIComponent(tags_arr[j])+'/" class="tag">'+tags_arr[j]+'</a>';
					}
					r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
					pblocks += '<div class="pblock"><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+r[1][i].alias+'</h2></a><p>'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
				}
						fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
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

var TAG = function (req, res) {
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
						tags_arr[j]='<a href="/tag/'+encodeURIComponent(tags_arr[j])+'/" class="tag">'+tags_arr[j]+'</a>';
					}
					r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
					pblocks += '<div class="pblock"><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+r[1][i].alias+'</h2></a><h2 class="hcat">'+cats[r[1][i].cat]+'</h2><p>'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
				}
						fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
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


app.get('/search/:query', function (req, res) {
	pp = pagination();
	requery='+'+StripTags(req.params.query);
	if (typeof req.params.page != 'undefined') {
		pp.page = ((parseInt(req.params.page) > 0) ? parseInt(req.params.page) : 1);
	}
	connection.query(
		'select count(ch.id) as cnt from pagescache ch inner join pages p on p.id=ch.id WHERE MATCH (p.short, p.tagstring, p.article) AGAINST (:query in boolean mode) '+pp.sql()+'; '+
		'select ch.id, p.cat, p.alias, p.short, p.tagstring from pagescache ch inner join pages p on p.id=ch.id WHERE MATCH (p.short, p.tagstring, p.article) AGAINST (:query in boolean mode) '+pp.sql()+'; ',
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
						tags_arr[j]='<a href="/tag/'+encodeURIComponent(tags_arr[j])+'/" class="tag">'+tags_arr[j]+'</a>';
					}
					r[1][i].tagstring='<div class="tags">'+tags_arr.join('')+'</div>';
					pblocks += '<div class="pblock"><a class="maina" href="/'+r[1][i].cat+'/'+r[1][i].alias+'/"><h2>'+r[1][i].alias+'</h2></a><h2 class="hcat">'+cats[r[1][i].cat]+'</h2><p>'+r[1][i].short+'</p>'+r[1][i].tagstring+'</div>';
				}
						fs.readFile(__dirname + '/views/Cat.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
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
});


app.get('/', function (req, res) {
	connection.query(
		'SELECT count(id) as comcnt FROM comments WHERE pagealias=:pagealias; '+
		'SELECT name, date, pagealias FROM comments ORDER BY date DESC LIMIT 15; '+
		'SELECT id, cat, alias, description, date FROM pages ORDER BY date DESC LIMIT 15; ',
		{pagealias:'/'},
		function(e, r, f){
			if(!e && r[0].length) {
				fs.readFile(__dirname + '/views/Start.html', 'utf8', function(err, contents) {
					
					journal_comments = "";
					for (var i in r[1]) {
						if (i==0 || r[1][i].pagealias != r[1][i-1].pagealias) {
							if (r[1][i].pagealias == '/') {pa = ['wikiclick', 'Главная страница']; cat_href = '/';}
							else {pa = r[1][i].pagealias.split('/'); cat_href="/"+pa[0]+'/';}
							journal_comments += '<div class="line"><strong><a href="'+r[1][i].pagealias+'">'+pa[1]+'</a><span class="gray"><a href="'+cat_href+'">['+pa[0]+']</a></span></strong></div>';
						}
						journal_comments += '<span class="a"><span class="log-comment">'+r[1][i].name+'</span>';
						journal_comments += '<span class="time">'+dateFormat(r[1][i].date, "d mmmm HH:MM")+'</span></span>';
						journal_comments += '<br>';
					}
					
					journal_pages = "";
					for (var i in r[2]) {
						if (i==0 || r[2][i].cat+'/'+r[2][i].alias != r[2][i-1].cat+'/'+r[2][i-1].alias) {
							journal_pages += '<div class="line"><strong><a href="/'+r[2][i].cat+'/'+r[2][i].alias+'/">'+r[2][i].alias+'</a><span class="gray"><a href="/'+r[2][i].cat+'/">['+r[2][i].cat+']</a></span></strong></div>';
						}
						if (!r[2][i].description) desc = 'Какие-то правки'
						else if (r[2][i].description.length >= 32) desc = r[2][i].description.substring(0,32)+'...';
						else desc = r[2][i].description;
						journal_pages += '<a href="/'+r[2][i].cat+'/'+r[2][i].alias+'/version'+r[2][i].id+'" alt="'+r[2][i].description+'"><span class="log-comment">'+desc+'</span>';
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

app.get('/random/', function (req, res) {
	connection.query('select ch.id, p.cat, p.alias FROM pagescache ch inner join pages p on ch.id=p.id order by rand() limit 1', {}, function(e, r, f) {
		if (!e && r.length) {
			res.redirect('http://localhost:30000/'+r[0].cat+'/'+r[0].alias+'/');
		}
	});
});

app.get('/tag/:tag/', TAG);

app.get('/tag/:tag/p.:page', TAG);

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
				res.end(JSON.stringify(r))
			}
		}
	);
});


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


app.get('/new/', function (req, res) {

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

app.post('/new/', function (req, res) {
	
	req.body.alias = req.body.alias.replaceArray('\\s+', '_');
	req.body.tags = req.body.tags.replaceArray({',\\s+': ','});

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

app.get('/:cat/p.:page/', CAT);

app.get('/:cat/:alias/', function (req, res) {
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
					'SELECT id, date FROM pages WHERE alias=:alias AND cat=:cat ORDER BY id DESC LIMIT 10',
					{pageid:r[0].id, pagealias:req.params.cat+'/'+req.params.alias, alias:req.params.alias, cat:req.params.cat},
					function (e1, r1, f1) {
						console.log(this.sql);
						console.log(e1);
						tags = new Array();
						for (var i in r1[0]) {
							tags.push('<a class="tag" href="/tag/'+encodeURIComponent(r1[0][i].tag)+'">'+r1[0][i].tag+'</a>')
						}
						versions = new Array();
						for (var i in r1[2]) {
							versions.push('<a href="version'+r1[2][i].id+'"><h3>'+dateFormat(r1[2][i].date, 'd mmmm yyyy HH:MM')+'</h3></a>')
						}
						fs.readFile(__dirname + '/views/Page.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
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


app.get('/:cat/:alias/version:id', function (req, res) {
	console.log(req.params);
	connection.query(
		'SELECT * FROM pages WHERE alias=:alias AND cat=:cat AND id=:id ORDER BY id DESC LIMIT 1',
		{alias:req.params.alias, cat:req.params.cat, id:req.params.id},
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
							tags.push('<a class="tag" href="/tag/'+r1[0][i].tag+'">'+r1[0][i].tag+'</a>')
						}
						fs.readFile(__dirname + '/views/Version.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
						        '%%id%%': r[0].id,
								'%%alias%%': r[0].alias,
								'%%short%%': r[0].short,
								'%%article%%': r[0].article,
								'%%cat%%':r[0].cat,
								'%%tags%%':tags.join(''),
								'%%comcnt%%':r1[1][0].comcnt,
								'%%comments%%':'',
								'%%version%%':dateFormat(r[0].date, 'd mmmm yyyy HH:MM'),
								'%%tagstring%%':r[0].tagstring
						    }));
			  			});
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
				res.end(JSON.stringify(r))
			}
		}
	);
});

app.get('/:cat/:alias/edit/', function (req, res) {
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
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%allowed%%':allowed,
								'%%alias%%': r[0].alias,
								'%%short%%': r[0].short,
								'%%article%%': r[0].article,
								'%%tags%%':tags.join(', '),
								'%%dangercaptcha%%':''
						    }));
			  			});
					}
				);
			}
		}
	);
});

app.post('/:cat/:alias/edit', function(req, res) {

	req.body.tags = req.body.tags.replaceArray({',\\s+': ','});

	check_captcha = req.body.captcha.length >= 4 && req.body.captcha == req.session.captcha;
	if (!check_captcha) {
		req.session.captcha='';
		//req.body.article = req.body.article.replaceArray({'\n': '<br>'});
						fs.readFile(__dirname + '/views/Edit.html', 'utf8', function(err, contents) {
						    res.end(contents.replaceArray({
								'%%sitename%%':SITE_NAME,  '%%metadescription%%':DESCRIPTION, 'metakeywords':KEYWORDS,  '%%links%%':links,
								'%%allowed%%':allowed,
								'%%alias%%': req.params.alias,
								'%%short%%': req.body.short,
								'%%article%%': req.body.article,
								'%%tags%%':req.body.tags,
								'%%dangercaptcha%%':'danger'
						    }));
			  			});
		return false;
	} else {
		req.session.captcha='';
	}
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


app.post('/uploadone', function (req, res) {
	
	global.globalreq = req;
	
	var storage = multer.diskStorage({
      destination: function (req, file, callback) {
        callback(null, __dirname + '/public/uploads/');
      },
      filename: function (req, file, callback) {
        mimetype = '';
        if (file.mimetype == 'image/jpeg') mimetype = '.jpg';
        if (file.mimetype == 'image/png') mimetype = '.png';
        if (file.mimetype == 'image/gif') mimetype = '.gif';     
        fileName = Date.now().toString(16)+mimetype;
        callback(null, fileName);
      }
    });
	
	var upload = multer({ storage : storage }).single('file', 1);
    upload(req,res,function(err) {
		console.log(req.file);
		res.end(req.file.filename);
	});
});

app.listen(80, '185.244.43.111');
