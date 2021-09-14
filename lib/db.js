const config = require('../config').db;
const knex = require('knex');

if (process.env.PANLEX_API_DBHOST) {
  config.connection.host = process.env.PANLEX_API_DBHOST;
}

config.wrapIdentifier = function(value) {
  return value;
};

module.exports = knex(config);
