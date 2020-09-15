var obj = function(req, res) {
	connection.query('select count(id) as c from pagescache; select count(id) as c from pages; select count(id) as c from comments;	select count(id) as c from comments where pagealias=:pa', {pa:(req.params.tpl+'@'+req.params.mod)}, function(e, r, f) {
		o = {"%%totalpages%%": r[0][0].c, "%%totalindexes%%": r[1][0].c, "%%totalcomments%%": r[2][0].c, '%%commentscount%%':r[3][0].c}
		child_process.exec('mysqldiskusage --server='+(db_settings.user)+':'+(db_settings.password)+'@'+(db_settings.host)+' '+(db_settings.database)+' total | tail -n 3 | head -n 1',
		function (error, stdout, stderr) {
			o['%%totalsize%%']=stdout;
		})
		child_process.exec('ls '+dn+'/public/uploads | wc -l', function (error, stdout, stderr) {
			o['%%totaluploads%%']=stdout;
		})
		child_process.exec('du -hs '+dn+'/public/uploads -c | tail -n 1', function (error, stdout, stderr) {
			o['%%uploadssize%%']=stdout.replaceArray({'total':''});
		})
		console.log(dn);

		ob = o;
	});
}

obj(req, res);
