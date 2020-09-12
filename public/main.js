String.prototype.replaceArray = function(obj) {
    var replaceString = this;
    var regex;
    for (var i in obj) {
        regex = new RegExp(i, "gi");
        replaceString = replaceString.replace(regex, obj[i]);
    }
    return replaceString;
}

window.comment = function (c) {
	var replacements = {
        '\n': ' <br> ',
        '((https?):\/\/(\\S+((\\.jpg)|(\\.png)|(\\.gif))(\\[?][^\s]+)*))': '&img#$2#$3;',
        '(http:\/\/\\S+)': '<a href="$1" target="__blank">$1</a>',
        '(https:\/\/\\S+)': '<a href="$1" target="__blank">$1</a>',
        '&img#(https?)#([^#\\s]+);': '<span class="bind"><a href="$1://$2" target="_blank" class="img"><img class="img" style="height:100px;" src="$1://$2"></a></span>'
	}
	return c.replaceArray(replacements);
}
function escapec(c) {
	var replacements = {'"':'&#34;', "'":'&#39;'}
	return c.replaceArray(replacements);
}

function insertAtCursor(myField, myValue) {
    //IE support
    if (document.selection) {
        myField.focus();
        sel = document.selection.createRange();
        sel.text = myValue;
    }
    //MOZILLA and others
    else if (myField.selectionStart || myField.selectionStart == '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        myField.value = myField.value.substring(0, startPos)
            + myValue
            + myField.value.substring(endPos, myField.value.length);
    } else {
        myField.value += myValue;
    }
}

function ajax_edit_comment(id) {
	$.ajax({
		url:'/ajax-edit-comment/',
		type:'POST',
		dataType:'json',
		data:{id:id, comment:$('textarea:visible').val()},
		success:function(data) {
			if (data.success) {
				$('.rcomment:hidden').html(window.comment($('textarea:visible').val()));
				$('.rcomment:hidden').attr('data-comment', escapec($('textarea:visible').val()));
				answercancel();
			}
		}
	})
}

function check_captcha() {
	$.ajax({
		url: '/check-captcha/',
		type: 'post',
		data: {captcha:$('#icaptcha').val()},
		dataType: 'json',
		success: function (data) {
			if (data.success) {
				$.ajax({
				   type: "POST",
				   url: 'add-comment',
				   data: $('form:visible').serialize(),
				   dataType:'json',
				   success: function(data)
				   {
				       console.log(data);
					   console.log(data['id']);
					   rname = $('.iedit[name="name"]:visible').val().length ? $('.iedit[name="name"]:visible').val() : 'Анонимус';
				       parent_id = parseInt($('form:visible').parent().attr('data-parent'));
comm = '<div class="reply r'+data.id+'" style="margin-left:'+(parent_id ? 30 : 0)+'px" data-id="'+data.id+'"><div class="rname">'+rname+'</div><div class="rdate">только что</div><div class="rcomment" data-comment="'+escapec($('.edit:visible').val())+'">'+window.comment($('.edit:visible').val())+'</div><div id="answer'+data.id+'" data-parent="'+data.id+'"><a class="answerlink hidden delink my" onclick="delete_comment('+data.id+')">Удалить</a><a class="answerlink hidden" onclick="edit_comment('+data.id+')" style="display: block;">Редактировать</a><a class="answerlink" onclick="answer('+data.id+')" style="display: block;">Ответить</a></div><div class="replies"></div></div>';
if (parent_id == 0) {$('#answer0').before(comm)}
else {$('.r'+parent_id+' .replies:first').append(comm)}
answercancel();

				   }
			    });
			}
			else $('#icaptcha').addClass('danger')
		}
	})
	
}
function answercancel() {
	if ($('.block-comments form').length) {
		$('.block-comments form').parent().find('a').show();
		$('.block-comments form').remove();
		$('.reply .answerlink').hide()
		$('.rcomment').show();
	}
}
function answer(parentid) {

	answercancel();

	$('.reply .answerlink').show()
	
	$('#answer'+parentid).prepend('<form action="add-comment", method="post"><input type="hidden" name="parentid" value="'+parentid+'"><input type="text" class="iedit" name="name" placeholder="Ваше имя" autocomplete=off><input type="text" id="icaptcha" name="captcha" class="iedit" style="margin-left:12px;margin-right:10px;width:120px;display:inline-block;" autocomplete=off><iframe style="border:none;position:relative;top:16px;" width="84" height="50" src="/captcha/"></iframe><textarea name="comment" placeholder="Комментарий" class="edit"></textarea><input type="submit" class="button" value="Добавить комментарий" onclick="check_captcha(); return false;"><input type="button" class="button cancel" value="Отмена" onclick="answercancel()"></form>');
	$('#answer'+parentid+' a').hide();
	if(parentid == 0) {$(document).scrollTop($('#answer'+parentid).offset().top-320);}
}
function edit_comment(id) {
	answercancel();
	$('.reply .answerlink').show();
	$('.r'+id+' .rcomment:first').hide();
	$('.r'+id+' .rcomment:first').after('<form style="position:relative;left:-30px;"><textarea class="edit">'+$('.r'+id+' .rcomment:first').attr('data-comment')+'</textarea><input type="button" class="button" value="Сохранить комментарий" onclick="ajax_edit_comment('+id+'); return false;"><input type="button" class="button cancel" value="Отмена" onclick="answercancel()"></form>');
	$('#answer'+id+' a').hide();
} function delete_comment(id) {
	for (var i = $('.r'+id+', .r'+id+' .reply').length-1; i>=0; i--) {
		$.ajax({
			url:'/ajax-delete-comment/',
			type: 'post',
			dataType: 'json',
			data: {id:$('.r'+id+', .r'+id+' .reply').eq(i).attr('data-id')},
			success: function (data) {
				if (data.success) $('.r'+id+', .r'+id+' .reply').eq(i).remove();
			}
		});
	}
}
function comments_json(id) {
	$.ajax({
		url:'comments-json',
		type:'get',
		dataType:'json',
		success: function (d) {
			console.log(d);
			data=d.comments;
			window.admin = d.admin;
			for (var i in data) {
				if (data[i].parentid == 0) {$container = $('.comments')}
				else {$container = $('.r'+data[i].parentid+'').children('.replies')}
				if (data[i].my) editcomment='<a class="answerlink hidden" onclick="edit_comment('+data[i].id+')">Редактировать</a>'; else editcomment = '';
				if (window.admin) {
					delcomment='<a class="answerlink hidden delink '+data[i].my+'" onclick="delete_comment('+data[i].id+')">Удалить</a>';
				} else delcomment = '';
				answerlink = '<div id="answer'+data[i].id+'" data-parent="'+data[i].id+'">'+delcomment+editcomment+'<a class="answerlink" onclick="answer('+data[i].id+')">Ответить</a></div>'
				$container.append('<div class="reply r'+data[i].id+'" style="margin-left:'+(data[i].level ? 30 : 0)+'px" data-id='+data[i].id+'><div class="rname">'+data[i].name+'</div><div class="rdate">'+data[i].date+'</div><div class="rcomment" data-comment="'+escapec(data[i].comment)+'">'+window.comment(data[i].comment)+'</div>'+answerlink+'<div class="replies"></div></div>');
				if(id == data[i].id) {
					$(document).scrollTop($('.reply.r'+id).offset().top-320);
					$('.reply.r'+id).addClass('rlink')
				}
			}
			$('.comments').append('<div id="answer0" data-parent="0"><a class="answerlink" onclick="answer(0);">Ответить</a></div>');
			$('.btn-show-comments').remove();
		}
	});
}
function upload_img() {
	console.log('upload');
    $('.upimg').addClass('spin');
    if ($('.upimg').hasClass('spin')) {
        $('#uploadone').ajaxSubmit({
            success: function(data) {
                insertAtCursor($('.page textarea')[0], ' <a class="img" target="_blank" href="/uploads/'+data+'"><img src="/uploads/'+data+'"></a>')
                $('.upimg').removeClass('spin');
            }
        });
    }
}

function check_bookmark(pagealias) {
	if (window.localStorage['#'+pagealias] === "1") {
		$('.bookmark').addClass('active');
		$('.bookmark').attr('title', 'Убрать из закладок');
	}
}


function bookmark(pagealias) {
	if (window.localStorage['#'+pagealias] === "1") {
		window.localStorage['#'+pagealias] = "";
		$('.bookmark').removeClass('active');
		$('.bookmark').attr('title', 'Добавить в закладки');
		$.each($('#bookmarks a'), function (k, v) {
			if(pagealias.substring(pagealias.indexOf('/')+1) == $(this).html()) {
				$(this).remove(); return false;			
			}
		}); 
	} else {
		window.localStorage['#'+pagealias] = "1";
		$('.bookmark').addClass('active');
		$('.bookmark').attr('title', 'Убрать из закладок');
		$('#bookmarks').prepend('<a href="'+pagealias.replace('#', '/')+'">'+pagealias.substring(pagealias.indexOf('/')+1)+'</a>')
	}
}

function bookmarks() {
	$('.links').append('<div style="margin-top:40px;"><a onclick="$(this).next(\':visible\').slideUp();$(this).next(\':hidden\').slideDown();"><span class="star">▾</span>Закладки</a><div id="bookmarks"></div></div>');
	var c = 0;
	for (var i in window.localStorage) {
		if (i.indexOf('#') == 0 && window.localStorage[i] === '1') {
			$('#bookmarks').append('<a href="'+i.replace('#', '/')+'/">'+i.substring(i.indexOf('/')+1)+'</a>'); c++;
		}
	}
	if (c == 0) {
		$('#bookmarks').append('<span style="color:#444">У Вас пока нет закладок</a>')
	}
}

function locations() {
	comments_link = '%D0%BA%D0%BE%D0%BC%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D1%80%D0%B8%D0%B8';
	$('.reply').removeClass('rlink');
	if (window.location.hash.toString().indexOf("#/"+comments_link+"/") == 0 || window.location.hash == '#/'+comments_link) {
		cid = parseInt(window.location.hash.toString().replace("#/"+comments_link+"/", ''))
		if ($('.comments').html().length) {
			$(document).scrollTop($('.reply.r'+cid).offset().top-320);
			$('.reply.r'+cid).addClass('rlink')
		}
		else {
			comments_json(cid);
		}
	}
}

function cords(p) {
	if ($('.cords').length) {
		$h = 'h1, h2, h3, h4, h5, h6';
		$ah = $('article').find($h)
		if ($ah.length >=3) {
			$('.cords').html('<div>Справка</div><ul class="level0" data-level="0"><ul>')
			$ol = $('.level0');
			$str = ''
			$.each($ah, function(i, elm) {
				if($(this).find('a.q').length) {
					$(this).click(function() {
						$(this).next(':visible').slideUp();
						$(this).next(':hidden').slideDown();
					});
				}
				if (i < $ah.length-1) {			
					a = $ah.eq(i).prop('tagName'); b = $ah.eq(i+1).prop('tagName');
				}
				$(this).html('<selection id="H'+i+'">'+$(this).html()+'</selection>')
				$str += '<li><a href="#H'+i+'">'+$(this).text()+'</li>'
				if (i < $ah.length-1 && a>b) {
					for (i = parseInt(a.substring(1)); i>parseInt(b.substring(1)); i--) {
						$str += '</ul>'
					}
				}
				if (a<b && !(a=='H1' && b=='H2')) $str += '<ul>';
				if (i == $ah.length-1) {
					for (i = parseInt($(this).prop('tagName').substring(1)); i>=3; i--) {
						$str += '</ul>'
					}
					console.log($str);
					$ol.html($str)
					if ($(window).width() >= 1024) $('.cords').show();
					$('.cords a').click(function() {
						$($(this).attr('href')).parent().next().slideDown();
					})
					if (p === 'preview') {
						document.querySelectorAll('pre code').forEach((block) => {
    						hljs.highlightBlock(block);
 						});
					}
				}
			})
		}
	}
}

$(document).ready(function() {
	$('body').append(
		'<!-- Yandex.Metrika counter -->'+
		'<script type="text/javascript" >'+
		   '(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};'+
		   'm[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})'+
		   '(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");'+

		   'ym(66669454, "init", {'+
				'clickmap:true,'+
				'trackLinks:true,'+
				'accurateTrackBounce:true'+
		   '});'+
		'</script>'+
		'<noscript><div><img src="https://mc.yandex.ru/watch/66669454" style="position:absolute; left:-9999px;" alt="" /></div></noscript>'+
		'<!-- /Yandex.Metrika counter -->'
	);	
	
	$(window).resize(function() {
		if ($(window).width() >= 1024) $('.cords').show();
		else $('.cords').hide();
	});
	locations();
	$( window ).on( 'hashchange', function( e ) {
		locations();
	} );
	if($('.bookmark').length) {
		check_bookmark($('.bookmark').attr('data-pagealias'));
	}
	bookmarks();
	$('.isearch').on('keypress',function(e) {
		if(e.which == 13) {
		    window.location = '/поиск/'+$('.isearch').val()+'/';
		}
	});
	$('article a.q').click(function() {
		$(this).next(':visible').slideUp();
		$(this).next(':hidden').slideDown();
	});
	$('.allowed1').click(function(){
		$('.allowed1').toggleClass('hidden')
	});
	$('.allowed2').click(function(){
		$('.allowed2').toggleClass('hidden')
	});
	$('.allowed3').click(function(){
		$('.allowed3').toggleClass('hidden')
	});
	cords();
	if (typeof window.orientation !== 'undefined') {
		$('body').append('<div class="bottombar"></div>');
		$('.leftbar .links').clone().appendTo('.bottombar');
		$('.bottombar').append('<img src="/logo.png">');
	}
	$('.upimg').mousedown(function() { 
        	$('#uploadone input').click();
    	});
	if ($('.upimg').length == 1) buttons();
	$('#uploadone input').change(function() {
		upload_img();
	});
	$('#preview-btn').click(function() {
		$('article').html($('textarea:visible').val());
		cords('preview');
		$(document).scrollTop(0);
	});
})



function buttons() {
	$('.upimg').attr('title', 'Добавить картинку');
	$('.upimg').after('<button class="upimg up-h" style="'+
'    background: #0cca6c;'+
'    margin-top: 60px;'+
'" title="Выделение в заголовок">H</button>'+
'<button class="upimg up-a" style="'+
'    margin-top: 105px;'+
'    background: #0e71ca;'+
'" title="Добавить ссылку">a</button>'+
'<button class="upimg up-b" style="'+
'    margin-top: 150px;'+
'    background: #ff8400;'+
'" title="Выделение в жирный текст">b</button>'+
'<button class="upimg up-p" style="'+
'    margin-top: 195px;'+
'    background: #d524d6;'+
'" title="Выделение в абзац">p</button>'+
'<button class="upimg up-code" style="'+
'    margin-top: 240px;'+
'    font-size: 10px;'+
'    background: #636363;'+
'" title="Преобразовать в код">сode</button>'+
'<button class="upimg up-css" style="'+
'    margin-top: 285px;'+
'    background: #ca0e0e;'+
'" title="Добавить стили к выделенному тексту">css</button>'+
'<button class="upimg up-br" style="'+
'    margin-top: 330px;'+
'    background: #7d6401;'+
'" title="Новая строка">br</button>');
	window.usertext = document.getElementById("article");
    $('.up-h').click(function() {
		htag = 'h'+prompt('Укажите уровень заголовка от 1 до 6')
		replaceSelectedText(window.usertext, '<'+htag+'>'+window.getSelection().toString()+'</'+htag+'>');
	});
	$('.up-a').click(function() {
		ahref = prompt('Адрес ссылки (включая http:// или https://)');
		atext = prompt('Текст ссылки')
		if (ahref.indexOf(window.location.host) == -1) atarget='target="_blank"'; else atarget="";
		insertAtCursor($('.page textarea')[0], ' <a href="'+ahref+'" '+atarget+'>'+atext+'</a>')
	});
	$('.up-b').click(function() {
		replaceSelectedText(window.usertext, '<b>'+window.getSelection().toString()+'</b>');
	});
	$('.up-p').click(function() {
		replaceSelectedText(window.usertext, '<p>'+window.getSelection().toString()+'</p>');
	});
	$('.up-code').click(function() {
		codelang = prompt('Укажите язык для выделенного, например, javascript');
		codetext = window.getSelection().toString().replaceArray({'<':'&amp;lt;', '>': '&amp;gt;'});
		replaceSelectedText(window.usertext, '<pre><code class="lang-'+codelang+'">'+codetext+'</code></pre>');
	});
	$('.up-css').click(function() {
		cssstyle = prompt('Напишите css-стили для аттрибута style');
		replaceSelectedText(window.usertext, '<span style="'+cssstyle+'">'+window.getSelection().toString()+'</span>');
	});
	$('.up-br').click(function() {
		insertAtCursor($('.page textarea')[0], '<br>')
	});
}

function getInputSelection(el) {
    var start = 0, end = 0, normalizedValue, range,
        textInputRange, len, endRange;

    if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
        start = el.selectionStart;
        end = el.selectionEnd;
    } else {
        range = document.selection.createRange();

        if (range && range.parentElement() == el) {
            len = el.value.length;
            normalizedValue = el.value.replace(/\r\n/g, "\n");

            // Create a working TextRange that lives only in the input
            textInputRange = el.createTextRange();
            textInputRange.moveToBookmark(range.getBookmark());

            // Check if the start and end of the selection are at the very end
            // of the input, since moveStart/moveEnd doesn't return what we want
            // in those cases
            endRange = el.createTextRange();
            endRange.collapse(false);

            if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
                start = end = len;
            } else {
                start = -textInputRange.moveStart("character", -len);
                start += normalizedValue.slice(0, start).split("\n").length - 1;

                if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
                    end = len;
                } else {
                    end = -textInputRange.moveEnd("character", -len);
                    end += normalizedValue.slice(0, end).split("\n").length - 1;
                }
            }
        }
    }

    return {
        start: start,
        end: end
    };
}

function replaceSelectedText(el, text) {
    var sel = getInputSelection(el), val = el.value;
    el.value = val.slice(0, sel.start) + text + val.slice(sel.end);
}
