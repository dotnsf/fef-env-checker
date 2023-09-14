//. app.js
var express = require( 'express' ),
    crypto = require( 'crypto' ),
    ejs = require( 'ejs' ),
    app = express();

var client = require( 'cheerio-httpcli' );
client.set( 'browser', 'chrome' );
client.set( 'referer', false );

require( 'dotenv' ).config();
process.env.PGSSLMODE = 'disable';

var PG = require( 'pg' );
PG.defaults.ssl = true;
var database_url = 'DATABASE_URL' in process.env ? process.env.DATABASE_URL : settings.database_url; 
var pg = null;
if( database_url ){
  console.log( 'database_url = ' + database_url );
  pg = new PG.Pool({
    connectionString: database_url,
    idleTimeoutMillis: ( 3 * 86400 * 1000 )
  });
  pg.on( 'error', function( err ){
    console.log( 'error on working', err );
    if( err.code && err.code.startsWith( '5' ) ){
      try_reconnect( 1000 );
    }
  });
}

function try_reconnect( ts ){
  setTimeout( function(){
    console.log( 'reconnecting...' );
    pg = new PG.Pool({
      connectionString: database_url,
      idleTimeoutMillis: ( 3 * 86400 * 1000 )
    });
    pg.on( 'error', function( err ){
      console.log( 'error on retry(' + ts + ')', err );
      if( err.code && err.code.startsWith( '5' ) ){
        ts = ( ts < 10000 ? ( ts + 1000 ) : ts );
        try_reconnect( ts );
      }
    });
  }, ts );
}

app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

app.use( function( req, res, next ){
  if( req && req.query && req.query.error ){
    console.log( req.query.error );
  }
  if( req && req.query && req.query.error_description ){
    console.log( req.query.error_description );
  }
  next();
});

app.get( '/', async function( req, res ){
  var urls = await app.readUrls();
  res.render( 'index', { urls: urls } );
});

app.get( '/api/urls', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var urls = await app.readUrls();
  res.write( JSON.stringify( { status: true, urls: urls }, null, 2 ) );
  res.end();
});

app.get( '/api/sources/:url_id', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var url_id = req.params.url_id;
  var sources = await app.readSourcesByUrlId( url_id );
  res.write( JSON.stringify( { status: true, url_id: url_id, sources: sources }, null, 2 ) );
  res.end();
});

app.get( '/api/source/:source_id', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var source_id = req.params.source_id;
  var body = await app.readSourceBodyById( source_id );
  res.write( JSON.stringify( { status: true, source_id: source_id, body: body }, null, 2 ) );
  res.end();
});

app.get( '/api/strings/:source_id', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var _checked = ( 'checked' in req.query ? req.query.checked : null );
  var checked = ( _checked ? parseInt( _checked ) : -1 );
  var source_id = req.params.source_id;
  var strings = await app.readStringsBySourceId( source_id, checked );
  res.write( JSON.stringify( { status: true, source_id: source_id, strings: strings }, null, 2 ) );
  res.end();
});

app.post( '/api/string/:string_id/:checked', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var string_id = req.params.string_id;
  var checked = parseInt( req.params.checked );
  var b = await app.setStringChecked( string_id, checked );
  res.write( JSON.stringify( { status: true, string_id: string_id, checked: checked, b: b }, null, 2 ) );
  res.end();
});

app.delete( '/api/url/:url_id', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var url_id = req.params.url_id;
  var r = await app.removeDataByUrlId( url_id, true );
  res.write( JSON.stringify( { status: true, result: r }, null, 2 ) );
  res.end();
});

app.post( '/api/crawl', async function( req, res ){
  res.contentType( 'application/json; charaset=utf-8' );

  var url = req.query.url;
  var b = await app.crawlUrl( url );
  res.write( JSON.stringify( { status: true, url: url, b: b }, null, 2 ) );
  res.end();
});


app.existUrl = async function( url ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    var id = false;
    try{
      conn = await pg.connect();
      if( conn ){
        var sql = "select id from urls where url = $1";
        var query = { text: sql, values: [ url ] };
        conn.query( query, function( err, result ){
          if( err ){
            console.log( err );
          }else{
            if( result.rows.length > 0 && result.rows[0].id ){
              id = result.rows[0].id;
            }
          }
          resolve( id );
        });
      }else{
        resolve( id );
      }
    }catch( e ){
      console.log( e );
      resolve( id );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}


app.readUrls = async function(){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    var urls = [];
    try{
      conn = await pg.connect();
      if( conn ){
        var sql = "select id, url, created from urls order by created";
        var query = { text: sql, values: [] };
        conn.query( query, function( err, result ){
          if( err ){
            console.log( err );
          }else{
            if( result.rows.length > 0 && result.rows[0].id ){
              try{
                for( var i = 0; i < result.rows.length; i ++ ){
                  urls.push( result.rows[i] );
                }
              }catch( e ){
                console.log( e );
              }
            }
          }
          resolve( urls );
        });
      }else{
        resolve( urls );
      }
    }catch( e ){
      console.log( e );
      resolve( urls );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.readSourcesByUrlId = async function( url_id ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    var sources = [];
    try{
      conn = await pg.connect();
      if( conn ){
        var sql = "select id, url_id, source, created from sources where url_id = $1 order by created";
        var query = { text: sql, values: [ url_id ] };
        conn.query( query, function( err, result ){
          if( err ){
            console.log( err );
          }else{
            if( result.rows.length > 0 && result.rows[0].id ){
              try{
                for( var i = 0; i < result.rows.length; i ++ ){
                  sources.push( result.rows[i] );
                }
              }catch( e ){
                console.log( e );
              }
            }
          }
          resolve( sources );
        });
      }else{
        resolve( sources );
      }
    }catch( e ){
      console.log( e );
      resolve( sources );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.readStringsBySourceId = async function( source_id, checked ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    var strings = [];
    try{
      conn = await pg.connect();
      if( conn ){
        var sql = "select id, string, checked, created from strings where source_id = $1 order by created";
        var query = { text: sql, values: [ source_id ] };
        if( checked == 1 || checked == 0 ){
          query.text += ' and checked = $2';
          query.values.push( checked );
        }
        conn.query( query, function( err, result ){
          if( err ){
            console.log( err );
          }else{
            if( result.rows.length > 0 && result.rows[0].id ){
              try{
                for( var i = 0; i < result.rows.length; i ++ ){
                  strings.push( result.rows[i] );
                }
              }catch( e ){
                console.log( e );
              }
            }
          }
          resolve( strings );
        });
      }else{
        resolve( strings );
      }
    }catch( e ){
      console.log( e );
      resolve( strings );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.setStringChecked = async function( string_id, checked ){
  return new Promise( async function( resolve, reject ){
    var b = false;
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var sql = "update strings set checked = $1 where id = $2";
        var query = { text: sql, values: [ checked, string_id ] };
        conn.query( query, function( err, result ){
          if( err ){
            console.log( err );
          }else{
            //console.log( {result} );
            b = true;
          }
          resolve( b );
        });
      }else{
        resolve( b );
      }
    }catch( e ){
      console.log( e );
      resolve( b );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}


app.storeUrl = async function( url ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var id = crypto.randomUUID();
        var ts = ( new Date() ).getTime();
        var sql = "insert into urls( id, url, created ) values( $1, $2, $3 )";
        var query = { text: sql, values: [ id, url, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            //console.log( err );
          }
          resolve( { status: true, id: id } );
        });
      }else{
        resolve( { status: false, error: 'no conn' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, error: e } );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.updateUrl = async function( url_id ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var ts = ( new Date() ).getTime();
        var sql = "update urls set created = $1 where id = $2";
        var query = { text: sql, values: [ ts, url_id ] };
        conn.query( query, function( err, result ){
          if( err ){
            //console.log( err );
          }
          resolve( { status: true, id: url_id } );
        });
      }else{
        resolve( { status: false, error: 'no conn' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, error: e } );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.storeSource = async function( url_id, source ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var id = crypto.randomUUID();
        var ts = ( new Date() ).getTime();
        var sql = "insert into sources( id, url_id, source, created ) values( $1, $2, $3, $4 )";
        var query = { text: sql, values: [ id, url_id, source, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            //console.log( err );
          }
          console.log( err, result );
          resolve( { status: true, id: id } );
        });
      }else{
        resolve( { status: false, error: 'no conn' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, error: e } );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.storeString = async function( source_id, string ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var id = crypto.randomUUID();
        var ts = ( new Date() ).getTime();
        var sql = "insert into strings( id, source_id, string, created ) values( $1, $2, $3, $4 )";
        var query = { text: sql, values: [ id, source_id, string, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            //console.log( err );
          }
          resolve( { status: true, id: id } );
        });
      }else{
        resolve( { status: false, error: 'no conn' } );
      }
    }catch( e ){
      console.log( e );
      resolve( { status: false, error: e } );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

// テキストから JSON 表現を全て抜き出して配列で返す
app.detectTargets = function( text ){
  var targets = [];

  //var regex = /[A-Za-z0-9.#@!%&|_-]{12,}/g;
  var regex = /[A-Za-z0-9.#@!%_-]{12,}/g;
  var results = text.match( regex );
  //console.log( results );
  for( var i = 0; i < results.length; i ++ ){
    var regexnum = /[0-9]/;
    var regexalphabet = /[A-Za-z]/;
    var r1 = results[i].match( regexnum );
    var r2 = results[i].match( regexalphabet );
    if( r1 && r1.length && r2 && r2.length ){
      targets.push( results[i] );
    }
  }

  return targets;
}

// テキストから JSON 表現を全て抜き出して配列で返す
app.JSONdetect = function( texts ){
  var jsons = [];
  var tmparray = [];
  var level = 0;
  var sq_level = 0;
  var dq_level = 0;
  var pr_c = null;
  for( var i = 0; i < texts.length; i ++ ){
    var c = texts.charAt( i );

    //. 前処理
    if( c == "'" ){
      if( pr_c != "\\" && sq_level == 0 && dq_level == 0 ){
        sq_level = 1;
      }else if( pr_c != "\\" && sq_level == 1 && dq_level == 0 ){
        sq_level = 0;
      }
    }
    if( c == '"' ){
      if( pr_c != "\\" && sq_level == 0 && dq_level == 0 ){
        dq_level = 1;
      }else if( pr_c != "\\" && sq_level == 0 && dq_level == 1 ){
        dq_level = 0;
      }
    }

    //. メイン処理
    if( c == '{' && sq_level == 0 && dq_level == 0 ){
      level ++;
      tmparray.push( { c: c, level: level, index: i } );
    }else if( c == '}' && sq_level == 0 && dq_level == 0 ){
      tmparray.push( { c: c, level: level, index: i } );
      level --
    }

    pr_c = c;
  }

  for( var i = tmparray.length - 1; i >= 0; i -- ){
    var obj = tmparray[i];
    if( obj.c == '{' ){
      var obj_level = obj.level;
      var k = -1;
      for( var j = i + 1; j < tmparray.length && k == -1; j ++ ){
        if( tmparray[j].c == '}' && tmparray[j].level == obj_level ){
          k = j;
        }
      }

      if( k > -1 ){
        var text = texts.substring( tmparray[i].index, tmparray[k].index + 1 );
        if( text != '{}' ){
          //console.log( {text} );
          var b = false;
          try{
            //var pattern = /\{[\s\S]*?\}/g;
            var pattern = /((\[[^\}]{3,})?\{s*[^\}\{]{3,}?:.*\}([^\{]+\])?)/g;
            var results = text.match( pattern );
            if( results && results.length > 0 ){
              var n1 = text.indexOf( '{' );
              var n2 = text.indexOf( ' ', n1 + 1 );
              var n3 = text.indexOf( ':', n1 + 1 );
              var n4 = text.indexOf( ',', n1 + 1 );
              var n5 = text.indexOf( '"', n1 + 1 );
              var n6 = text.indexOf( '}', n1 + 1 );
              if( n1 > -1 && n3 > -1 && n6 > -1 && ( n2 == -1 || n2 > n3 ) && ( n4 == -1 || ( n4 > n3 && n6 > n4 ) ) && ( n5 == -1 || n5 == 1 || n3 < n5 ) ){
                jsons.push( { start_index: tmparray[i].index, end_index: tmparray[k].index, text: text } );
              }
            }
          }catch( e ){
            //console.log( {e} );
          }
        }
      }
    }
  }

  return jsons;
}

app.deleteStringsBySourceId = async function( source_id ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();

      var sql = "delete from strings where source_id = $1";
      var query = { text: sql, values: [ source_id ] };
      conn.query( query, function( err, result ){
        if( err ){
          //console.log( err );
        }
        resolve( { status: true, result: result } );
      });
    }catch( e ){
      console.log( e );
      resolve( { status: false, error: e } );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}


app.crawlUrl = async function( url ){
  return new Promise( async function( resolve, reject ){
    try{
      client.fetch( url, {}, 'utf-8', function( err0, $, res0, body0 ){
        if( err0 ){
          //. 403 エラーなどの場合、エラーでも body0 が返ってきている
          //console.log( {err0} );
        }
        if( body0 ){
          app.existUrl( url ).then( function( url_id ){
            if( url_id ){
              app.updateUrl( url_id ).then( function( r0 ){
                if( r0 && r0.status ){
                  //console.log( { url }, { r0 } );
                  $('script').each( async function(){
                    var src = $(this).attr( 'src' );
                    if( src && src.toLowerCase().endsWith( '.js' ) ){
                      var src1 = src;
                      if( !src.startsWith( 'http' ) ){
                        //. "<script src='http(s)://.....'> という指定になってなかった場合
                        if( src.startsWith( '//' ) ){
                          //. "<script src='//.....'> という指定だった場合（ホスト名あり）
                          if( url.startsWith( 'https' ) ){
                            src1 = 'https:' + src;
                          }else{
                            src1 = 'http:' + src;
                          }
                        }else if( src.startsWith( '/' ) ){
                          //. "<script src='/.....'> という指定だった場合（ホスト名なしのフルパス指定）
                          var tmp = url.split( '/' );  //. [ 'https:' , '', 'www.example.com', 'path1', 'hello.html' ]
                          while( tmp.length > 3 ){
                            //. 元の URL から "https://www.example.com" 部分を取り出して補完する
                            tmp.pop();
                          }
                          src1 = tmp.join( '/' ) + src;
                        }else{
                          //. "<script src='.....'> という指定だった場合（ホスト名なしの相対パス指定）
                          if( url.endsWith( '/' ) ){
                            src1 = url + src;
                          }else{
                            src1 = url + '/' + src;
                          }
                        }
                      }
  
                      console.log( src1 + ' : ' );  //. "http(s)://....." という形に補完された JavaScript URL
                      var r1 = await client.fetch( src1, {}, 'utf-8' );
                      if( r1 && r1.body ){
                        try{
                          var body1 = r1.body;
                          var r2 = await app.storeSource( url_id, src1 );
                          if( r2 && r2.status ){
                            //console.log( { src1 }, { r2 } );
                            var source_id = r2.id;
                            await app.deleteStringsBySourceId( source_id );
            
                            var results = app.detectTargets( body1 );
                            //console.log( {results} );
                            for( var i = 0; i < results.length; i ++ ){
                              var r3 = await app.storeString( source_id, results[i] );
                              console.log( i, results[i] )
                            }
                          }
                        }catch( e ){
                          console.log( {e} );
                        }
                      }
                    }
                    resolve( true );
                  });
                }
              });
            }else{
              app.storeUrl( url ).then( function( r0 ){
                if( r0 && r0.status ){
                  //console.log( { url }, { r0 } );
                  var url_id = r0.id;
                  $('script').each( async function(){
                    var src = $(this).attr( 'src' );
                    if( src && src.toLowerCase().endsWith( '.js' ) ){
                      var src1 = src;
                      if( !src.startsWith( 'http' ) ){
                        //. "<script src='http(s)://.....'> という指定になってなかった場合
                        if( src.startsWith( '//' ) ){
                          //. "<script src='//.....'> という指定だった場合（ホスト名あり）
                          if( url.startsWith( 'https' ) ){
                            src1 = 'https:' + src;
                          }else{
                            src1 = 'http:' + src;
                          }
                        }else if( src.startsWith( '/' ) ){
                          //. "<script src='/.....'> という指定だった場合（ホスト名なしのフルパス指定）
                          var tmp = url.split( '/' );  //. [ 'https:' , '', 'www.example.com', 'path1', 'hello.html' ]
                          while( tmp.length > 3 ){
                            //. 元の URL から "https://www.example.com" 部分を取り出して補完する
                            tmp.pop();
                          }
                          src1 = tmp.join( '/' ) + src;
                        }else{
                          //. "<script src='.....'> という指定だった場合（ホスト名なしの相対パス指定）
                          if( url.endsWith( '/' ) ){
                            src1 = url + src;
                          }else{
                            src1 = url + '/' + src;
                          }
                        }
                      }
  
                      console.log( src1 + ' : ' );  //. "http(s)://....." という形に補完された JavaScript URL
                      var r1 = await client.fetch( src1, {}, 'utf-8' );
                      if( r1 && r1.body ){
                        try{
                          var body1 = r1.body;
                          var r2 = await app.storeSource( url_id, src1 );
                          if( r2 && r2.status ){
                            //console.log( { src1 }, { r2 } );
                            var source_id = r2.id;
                            await app.deleteStringsBySourceId( source_id );
            
                            var results = app.detectTargets( body1 );
                            //console.log( {results} );
                            for( var i = 0; i < results.length; i ++ ){
                              var r3 = await app.storeString( source_id, results[i] );
                              console.log( i, results[i] )
                            }
                          }
                        }catch( e ){
                          console.log( {e} );
                        }
                      }
                    }
                    resolve( true );
                  });
                }
              });
            }
          });
        }else{
          console.log( 'no body for url.' );
          resolve( false );
        }
      });
    }catch( e ){
      console.log( e );
      resolve( false );
    }
  });
}

app.removeSourcesAndStringsByUrlId = async function( url_id ){
  return new Promise( async function( resolve, reject ){
    var conn = null;
    try{
      conn = await pg.connect();
      if( conn ){
        var sql0 = "select id from sources where url_id = $1";
        var query0 = { text: sql0, values: [ url_id ] };
        conn.query( query0, function( err0, result0 ){
          if( err0 ){
            console.log( err0 );
            resolve( [ false, false ] );
          }else{
            //console.log( {result0} );
            if( result0.rows.length > 0 && result0.rows[0].id ){
              var source_ids = [];
              try{
                for( var i = 0; i < result0.rows.length; i ++ ){
                  source_ids.push( result0.rows[i].id );
                }
              }catch( e ){
                console.log( e );
              }

              if( source_ids.length > 0 ){
                var sql1 = "delete from strings where source_id = any($1::varchar[])";
                var query1 = { text: sql1, values: [ source_ids ] };
                conn.query( query1, function( err1, result1 ){
                  if( err1 ){
                    console.log( err1 );
                  }

                  var sql2 = "delete from sources where id = any($1::varchar[])";
                  var query2 = { text: sql2, values: [ source_ids ] };
                  conn.query( query2, function( err2, result2 ){
                    if( err2 ){
                      console.log( err2 );
                    }

                    resolve( [ true, true ] );
                  });
                });
              }else{
                resolve( [ false, false ] );
              }
            }else{
              resolve( [ false, false ] );
            }
          }
        });
      }else{
        resolve( [ false, false ] );
      }
    }catch( e ){
      console.log( e );
      resolve( [ false, false ] );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}

app.removeDataByUrlId = async function( url_id, delete_data ){
  return new Promise( async function( resolve, reject ){
    var r = [ null, null ];
    if( delete_data ){
      r = await app.removeSourcesAndStringsByUrlId( url_id );
    }

    try{
      conn = await pg.connect();
      if( conn ){
        var sql3 = "delete from urls where id = $1";
        var query3 = { text: sql3, values: [ url_id ] };
        conn.query( query3, function( err3, result3 ){
          if( err3 ){
            console.log( err3 );
            r.unshift( false );
          }else{
            r.unshift( true );
          }
          resolve( r );
        });
      }else{
        r.unshift( false );
        resolve( r );
      }
    }catch( e ){
      console.log( e );
      r.unshift( false );
      resolve( r );
    }finally{
      if( conn ){
        conn.release();
      }
    }
  });
}


var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server starting on " + port + " ..." );
