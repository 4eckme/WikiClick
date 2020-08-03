

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
				$('.rcomment:hidden').html($('textarea:visible').val());
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
					   console.log(data['id'])
				       parent_id = parseInt($('form:visible').parent().attr('data-parent'));
comment = '<div class="reply r'+data.id+'" style="margin-left:'+(parent_id ? 30 : 0)+'px"><div class="rname">'+$('.iedit:visible').val()+'</div><div class="rdate">только что</div><div class="rcomment">'+$('.edit:visible').val()+'</div><div id="answer'+data.id+'" data-parent="'+data.id+'"><a class="answerlink hidden" onclick="edit_comment('+data.id+')" style="display: block;">Редактировать</a><a class="answerlink" onclick="answer('+data.id+')" style="display: block;">Ответить</a></div><div class="replies"></div></div>';
if (parent_id == 0) {$('#answer0').before(comment)}
else {$('.r'+parent_id+' .replies:first').append(comment)}
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
	if(parentid == 0) {$(document).scrollTop(999999);}
}
function edit_comment(id) {
	answercancel();
	$('.reply .answerlink').show();
	$('.r'+id+' .rcomment:first').hide();
	$('.r'+id+' .rcomment:first').after('<form style="position:relative;left:-30px;"><textarea class="edit">'+$('.r'+id+' .rcomment:first').html()+'</textarea><input type="button" class="button" value="Сохранить комментарий" onclick="ajax_edit_comment('+id+'); return false;"><input type="button" class="button cancel" value="Отмена" onclick="answercancel()"></form>');
	$('#answer'+id+' a').hide();
}
function comments_json() {
	$.ajax({
		url:'comments-json',
		type:'get',
		dataType:'json',
		success: function (data) {
			for (var i in data) {
				if (data[i].parentid == 0) {$container = $('.comments')}
				else {$container = $('.r'+data[i].parentid+'').children('.replies')}
				if (data[i].my) editcomment='<a class="answerlink hidden" onclick="edit_comment('+data[i].id+')">Редактировать</a>'; else editcomment = '';
				answerlink = '<div id="answer'+data[i].id+'" data-parent="'+data[i].id+'">'+editcomment+'<a class="answerlink" onclick="answer('+data[i].id+')">Ответить</a></div>'
				$container.append('<div class="reply r'+data[i].id+'" style="margin-left:'+(data[i].level ? 30 : 0)+'px"><div class="rname">'+data[i].name+'</div><div class="rdate">'+data[i].date+'</div><div class="rcomment">'+data[i].comment+'</div>'+answerlink+'<div class="replies"></div></div>');
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

$(document).ready(function() {
	$('.isearch').on('keypress',function(e) {
    if(e.which == 13) {
        window.location = '/search/'+$('.isearch').val();
    }
});
	if ($('.cords').length) {
		$h = 'h1, h2, h3, h4, h5, h6';
		$ah = $('article').find($h)
		if ($ah.length >=3) {
			$('.cords').html('<div>Справка</div><ul class="level0" data-level="0"><ul>')
			$ol = $('.level0');
			$str = ''
			$.each($ah, function(i, elm) {
				if (i < $ah.length-1) {			
					a = $ah.eq(i).prop('tagName'); b = $ah.eq(i+1).prop('tagName');
				}
				$(this).html('<selection id="H'+i+'">'+$(this).html()+'</selection>')
				$str += '<li><a href="#H'+i+'">'+$(this).text()+'</li>'
				if (i < $ah.length-1 && a>b) $str+='</ul>'
				if (a<b && !(a=='H1' && b=='H2')) $str += '<ul>';
				if (i == $ah.length-1) {
					for (i = parseInt($(this).prop('tagName').substring(1)); i>=3; i--) {
						$str += '</ul>'
					}
					console.log($str);
					$ol.html($str)
				}
			})
		}
	}
	if (typeof window.orientation !== 'undefined') {
		$('body').append('<div class="bottombar"></div>');
		$('.leftbar .links').clone().appendTo('.bottombar');
		$('.bottombar').append('<img src="/logo.png">');
	}
	$('.upimg').mousedown(function() { 
        $('#uploadone input').click();
    });
	$('#uploadone input').change(function() {
		upload_img();
	});
	$('#preview-btn').click(function() {
		$('article').html($('textarea:visible').val());
		$(document).scrollTop(0);
	});
})
