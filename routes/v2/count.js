const knex = require('../../lib/db');
const errors = require('restify-errors');

function count(type, table) {
  const conditions = require('./'+type).conditions;

  return (req, res, next) => {
    knex.count().from(function () {
      let from = table || type;
      if (table) from += ` as ${type}`; // alias table (if passed) to type

      this.as('s').from(from).select(`${type}.id`);
      conditions(req, this, true);
    }).first().then(row => {
      const obj = req.get('obj');
      obj.count = Number(row.count);
      obj.countType = type;

      next();
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });
  };
}

module.exports = count;
