//. crawler.js
var client = require( 'cheerio-httpcli' );
client.set( 'browser', 'chrome' );
client.set( 'referer', false );


//. parameter
var url = '';
if( process.argv.length > 2 ){
  url = process.argv[2];
}

var couchdb_url = 'COUCHDB_URL' in process.env ? process.env.COUCHDB_URL : '';

if( url ){
  client.fetch( url, {}, 'utf-8', function( err0, $, res0, body0 ){
    if( err0 ){
      //. 403 エラーなどの場合、エラーでも body0 が返ってきている
      //console.log( {err0} );
    }
    if( body0 ){
      //console.log( url, body0 );
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

              var results = JSONdetect( body1 );
              //console.log( {results} );
              for( var i = 0; i < results.length; i ++ ){
                console.log( i, results[i].text.substr( 0, 40 ) )
              }
            }catch( e ){
              console.log( {e} );
            }
          }
        }
      });
    }
  });
  console.log( 'crawler done.' );
}else{
  console.log( '$ node crawler [URL]' );
}

/* テキストから JSON 表現を全て抜き出して配列で返す
   考え方：
   - テキストの先頭から１文字ずつ取り出して、、、
     - シングルクォートで括られた文字列内でないことをチェックしつつ、
     - ダブルクォートで括られた文字列内でもないことをチェックしつつ、
     - '{' 文字が現れたら level ++ して文字位置と併せて { c: '{', level: level, n: i } を配列にプッシュ
     - '}' 文字が現れたら { c: '}', level: level, n: i } を配列にプッシュしてから level -- する

   - 作られたオブジェクトの配列を今度は末尾から１つずつ取り出して、、、
     - { c: '{' } のオブジェクトが見つかったら、同じ level で { c: '}' } のオブジェクトを探し、
     - ２つのオブジェクトに挟まれているオブジェクト文字列を抜き出して、
     - JSON.parse() に成功するかどうかを調べ、成功したら返り値候補とする
*/
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
                jsons.push( { start: tmparray[i].index, end: tmparray[k].index, text: text } );
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
