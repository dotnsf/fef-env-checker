//. crawler.js
var client = require( 'cheerio-httpcli' );
client.set( 'browser', 'chrome' );
client.set( 'referer', false );

var crypto = require( 'crypto' );

//. parameter
var url = '';
if( process.argv.length > 2 ){
  url = process.argv[2];
}

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
    //if( err.code && err.code.startsWith( '5' ) ){
    //  try_reconnect( 1000 );
    //}
  });

  console.log( 'main job start.' );
  mainjob().then( function( r ){
    console.log( 'main job done.' );
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

async function mainjob(){
  return new Promise( async function( resolve, reject ){
    if( url ){
      client.fetch( url, {}, 'utf-8', function( err0, $, res0, body0 ){
        if( err0 ){
          //. 403 エラーなどの場合、エラーでも body0 が返ってきている
          //console.log( {err0} );
        }
        if( body0 ){
          exist_url( url ).then( function( url_id ){
            if( url_id ){
              console.log( 'already existed url: ' + url );
            }else{
              store_url( url ).then( function( r0 ){
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
                          var r2 = await store_source( url_id, src1, body1 );
                          if( r2 && r2.status ){
                            //console.log( { src1 }, { r2 } );
                            var source_id = r2.id;
                            await delete_jsons_by_source_id( source_id );
            
                            var results = JSONdetect( body1 );
                            //console.log( {results} );
                            for( var i = 0; i < results.length; i ++ ){
                              var r3 = await store_json( source_id, results[i].start_index, results[i].end_index, results[i].text );
                              console.log( i, results[i].text.substr( 0, 40 ) )
                            }
                          }
                        }catch( e ){
                          console.log( {e} );
                        }
                      }
                    }
                    resolve( { status: true } );
                  });
                }
              });
            }
          });
        }else{
          console.log( 'no body for url.' );
          resolve( { status: false } );
        }
      });
      console.log( 'crawler done.' );
      resolve( { status: false } );
    }else{
      console.log( '$ node crawler [URL]' );
      resolve( { status: false } );
    }
  });
}

// テキストから JSON 表現を全て抜き出して配列で返す
function JSONdetect( texts ){
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

async function exist_url( url ){
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

async function store_url( url ){
  return new Promise( async function( resolve, reject ){
    if( pg ){
      var conn = null;
      try{
        conn = await pg.connect();

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
      }catch( e ){
        console.log( e );
        resolve( { status: false, error: e } );
      }finally{
        if( conn ){
          conn.release();
        }
      }
    }else{
      resolve( { status: false, error: 'no pg' } );
    }
  });
}

async function store_source( url_id, source, body ){
  return new Promise( async function( resolve, reject ){
    if( pg ){
      var conn = null;
      try{
        conn = await pg.connect();

        var id = crypto.randomUUID();
        var ts = ( new Date() ).getTime();
        var sql = "insert into sources( id, url_id, source, body, created ) values( $1, $2, $3, $4, $5 )";
        var query = { text: sql, values: [ id, url_id, source, body, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            console.log( {err} );
          }
          resolve( { status: true, id: id } );
        });
      }catch( e ){
        console.log( e );
        resolve( { status: false, error: e } );
      }finally{
        if( conn ){
          conn.release();
        }
      }
    }else{
      resolve( { status: false, error: 'no pg' } );
    }
  });
}

async function store_json( source_id, start_index, end_index, body ){
  return new Promise( async function( resolve, reject ){
    if( pg ){
      var conn = null;
      try{
        conn = await pg.connect();

        var id = crypto.randomUUID();
        var ts = ( new Date() ).getTime();
        var sql = "insert into jsons( id, source_id, start_index, end_index, body, created ) values( $1, $2, $3, $4, $5, $6 )";
        var query = { text: sql, values: [ id, source_id, start_index, end_index, body, ts ] };
        conn.query( query, function( err, result ){
          if( err ){
            //console.log( err );
          }
          resolve( { status: true, id: id } );
        });
      }catch( e ){
        console.log( e );
        resolve( { status: false, error: e } );
      }finally{
        if( conn ){
          conn.release();
        }
      }
    }else{
      resolve( { status: false, error: 'no pg' } );
    }
  });
}

async function delete_jsons_by_source_id( source_id ){
  return new Promise( async function( resolve, reject ){
    if( pg ){
      var conn = null;
      try{
        conn = await pg.connect();

        var sql = "delete from jsons where source_id = $1";
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
    }else{
      resolve( { status: false, error: 'no pg' } );
    }
  });
}
