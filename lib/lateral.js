const knex = require('./db');

function join() {
  return _join('join', ...arguments);
}

function leftJoin() {
  return _join('left join', ...arguments);
}

function _join(joinType, q, subq, alias) {
  subq = subq.toSQL();
  return q.joinRaw(knex.raw(`${joinType} lateral (${subq.sql}) as ${alias} on true`, subq.bindings));
}

module.exports = {
  join: join,
  leftJoin: leftJoin,
};
