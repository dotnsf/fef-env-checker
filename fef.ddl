/* fef.ddl */

/* urls */
drop table urls;
create table if not exists urls ( id varchar(50) not null primary key, url varchar(100) unique, created bigint default 0 );

/* sources */
drop table sources;
create table if not exists sources ( id varchar(50) not null primary key, url_id varchar(50), source varchar(300) unique, body text, created bigint default 0 );

/* jsons */
drop table jsons;
create table if not exists jsons ( id varchar(50) not null primary key, source_id varchar(50), start_index int default 0, end_index int default 0, body text, checked int default 0, created bigint default 0 );
