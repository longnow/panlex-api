This repository contains the PanLex API code. You can use it to host your own version of the [PanLex API](https://dev.panlex.org/api/) using the [PostgreSQL snapshots](https://panlex.org/snapshot/) of the PanLex Database.

# Installation

The PanLex API server is a `node.js` application. To install and run it:

1. Run `npm install` from the directory to install the required node modules.
2. Copy `config.json.sample` to `config.json` and modify the configuration as necessary (see below).
3. Run `node app` to start the API.
4. Set the `PANLEX_API` environment variable to the URL of your API server (for example `http://localhost:3000`), and run `npm test` to run the test suite. (optional)

# Configuration

The API looks for a `config.json` file containing certain important configuration information. The following settings are available:

* `address`: IP address that the API server will bind to. Default 127.0.0.1.
* `cache`: boolean specifying whether to cache API responses using a local Redis instance.
* `cacheExpireSeconds`: number of seconds to cache the API response for any given combination of API query parameters and source IP. Default 86400 (24 hours).
* `cluster`: boolean specifying whether to use node’s `cluster` feature to fork one API server process per core.
* `db.client`: name of the node module to use as the PostgreSQL driver. Typically `pg` or `pg.js`.
* `db.connection.host`: PostgreSQL host. Can also be a domain socket path.
* `db.connection.user`: PostgreSQL username.
* `db.connection.password`: PostgreSQL password, or `null` if no password needed or `.pgpass` will be used.
* `db.connection.database`: PostgreSQL database name.
* `db.pool.min`: minimum number of connection pool connections.
* `db.pool.max`: maximum number of connection pool connections.
* `docUrl`: HTTP address to redirect to when a GET request is received at the API root URL.
* `fakeExpr`: HTTP address of the fake expression service (optional).
* `graph`: HTTP address of the graph service (optional).
* `limit.arrayMax`: maximum number of API query array elements to accept, for various API queries.
* `limit.offsetMax`: maximum SQL offset value to accept, for various API queries.
* `limit.responseMax`: maximum number of results (SQL rows) to return at once, for various API queries.
* `log`: log file path.
* `logRequestBodyMax`: maximum number of bytes in an API request POST body to log.
* `port`: port that the API server will listen on. Default 3000.
* `redisdb`: Redis database number to use for optional cache and throttle features. Default 0.
* `requestTimeout`: number of seconds after which the API server should kill a pending HTTP request.
* `throttle`: if an object (see settings below), throttle incoming API requests as specified; if `false` or absent, disable throttling. Throttling requires a local Redis instance.
* `throttle.ratePerMinute`: maximum number of API queries per minute from any given IP. Uses a token bucket rate limiter.
* `throttle.unlimited`: array of IPs for which throttling should be disabled. Always includes 127.0.0.1.

# Database setup

In order to use the PostgreSQL dump with this API server, you will need to modify the default `search_path` for the database. The easiest way to do this is by running the following command:

```
ALTER DATABASE plx SET search_path = public, deriv, abbrev;
```

You will need to start a new database session for the change to take effect. Then, should generate the `denotationx` table (a denormalized version of the `denotation` table) by running the following command:

```
SELECT denotationx_repopulate();
```

Depending on your hardware, this make take a long time to run.

If you plan to modify the database after loading it, you will need to install the `plperl` extension for PostgreSQL and add the following lines to your `postgresql.conf`, using the appropriate path to the `plperl.pl` file distributed with the dump:

```
shared_preload_libraries = 'plperl'
plperl.on_init = 'require "/path/to/plperl.pl"'
```

## Performance optimization

The PanLex Database runs best on a server with at least 32GB of RAM, SSD storage, and good CPU performance. More RAM allows most or all of the working set to be kept in memory; SSDs lesson the performance hit when not everything fits in memory and significant random disk reads are needed; and CPU performance speeds up sorting and aggregation.

We recommend setting the following configuration parameters in `postgresql.conf`:

* `cpu_tuple_cost`: set to 0.1.
* `effective_cache_size`: set to two thirds of total RAM.
* `effective_io_concurrency`: set to 200 if using SSD.
* `join_collapse_limit`: set to 12.
* `random_page_cost`: set to 1.1 if using SSD.
* `shared_buffers`: set to 25% of total RAM.
* `work_mem`: set to 128MB if possible, or as close as your situation will allow.