# Front-End-Framework Checker

## Overview

React.js 等のフロントエンドフレームワークを使って作られたサイトをターゲットに環境変数をクロールする


## Usage

`$ node crawler [URL]`


## Running couchdb services on docker

- `$ docker run -d --name couchdb -p 5984:5984 -e COUCHDB_USER=user -e COUCHDB_PASSWORD=pass couchdb`

- `http://localhost:5984/_utils/`

  - Create `db` database.

  - Create following index doc:

```
{
  "_id": "_design/fefindex",
  "language": "query",
  "views": {
    "count_by_url": {
      "map": {
        "fields": {
          "name": "url"
        },
        "partial_filter_selector": {}
      },
      "reduce": "_count",
      "options": {
        "def": {
          "fields": [
            "url"
          ]
        }
      }
    },
    "count_by_src": {
      "map": {
        "fields": {
          "name": "src"
        },
        "partial_filter_selector": {}
      },
      "reduce": "_count",
      "options": {
        "def": {
          "fields": [
            "src"
          ]
        }
      }
    }
  }
}
```

  - `http://localhost:5984/db/_design/fefindex/_view/count_by_url?group=true`


## References

- https://qiita.com/naogify/items/a617ab2282830db70f1e

- https://dotnsf.blog.jp/archives/1077038369.html


## Copyright

2023 [K.Kimura @ Juge.Me](https://github.com/dotnsf) all rights reserved.
