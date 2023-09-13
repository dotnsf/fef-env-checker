# Front-End-Framework Checker

## Overview

React.js 等のフロントエンドフレームワークを使って作られたサイトをターゲットに環境変数をクロールする


## Usage

`$ node crawler [URL]`


## Running postgresql services on docker

- `$ docker run --name fef-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=fefdb -e PGDATA=/var/lib/postgresql/data/pgdata -v ~/fef_pgmount:/var/lib/postgresql/data/pgdata -p 5432:5432 -d --restart unless-stopped postgres`

- `$ docker exec -it fef-postgres bash`

- `/# psql "postgres://postgres:password@localhost:5432/fefdb"`

- `fefdb=# create table if not exists urls ( id varchar(50) not null primary key, url varchar(100) unique, created bigint default 0 );`

- `fefdb=# create table if not exists sources ( id varchar(50) not null primary key, url_id varchar(50), source varchar(300) unique, body text, created bigint default 0 );`

- `fefdb=# create table if not exists jsons ( id varchar(50) not null primary key, source_id varchar(50), start_index int default 0, end_index int default 0, body text, checked int default 0, created bigint default 0 );`

- `fefdb=# exit`

- `/# exit`


## References

- https://qiita.com/naogify/items/a617ab2282830db70f1e

- https://dotnsf.blog.jp/archives/1077038369.html

- https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-creating-views-mapreduce&locale=ja


## Copyright

2023 [K.Kimura @ Juge.Me](https://github.com/dotnsf) all rights reserved.
