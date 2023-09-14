/* fef.ddl */

/* urls */
drop table urls;
create table if not exists urls ( id varchar(50) not null primary key, url varchar(100) unique, created bigint default 0 );

/* sources */
drop table sources;
create table if not exists sources ( id varchar(50) not null primary key, url_id varchar(50), source varchar(300) unique, created bigint default 0 );

/* strings */
drop table strings;
create table if not exists strings ( id varchar(50) not null primary key, source_id varchar(50), string varchar(300) default '', checked int default 0, created bigint default 0 );
