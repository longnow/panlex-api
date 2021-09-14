const copyIntoTable = require('../../lib/copy_into_table');
const knex = require('../../lib/db');
const pgEscape = require('../../lib/pg_escape');
const validate = require('../../lib/validate');

const errors = require('restify-errors');
const _ = require('lodash');

const ARRAY_PARAMS = ['tt'];

function init(app) {
  app.apiRoute({ path: '/td', arrayParams: ARRAY_PARAMS }, txt_degr);
}

function txt_degr(req, res, next) {
  if (!('tt' in req.query))
    return next(new errors.MissingParameterError('the parameter "tt" is required'));

  const knownQuery = req.get('knownQuery');

  knownQuery.tt = true;
  let txt = req.query.tt;
  validate.array(txt, 'tt');
  txt = _.uniq(txt).map(item => {
    validate.string(item, 'td', true);
    item = pgEscape(item);
    return item + '\t\n';
  });

  knex.transaction(trx => {
    return trx.raw('CREATE TEMP TABLE tmp_txt_degr (tt text, td text) ON COMMIT DROP')
    .then(() => {
      return copyIntoTable(trx, 'tmp_txt_degr', txt);
    }).then(() => {
      return trx('tmp_txt_degr').update('td', knex.raw('txt_degr(tt)'))
    }).then(() => {
      return trx.select('*').from('tmp_txt_degr')
    });
  }).then(rows => {
    const result = {};

    rows.forEach(row => {
      result[row.tt] = row.td;
    });

    const obj = req.get('obj');
    obj.td = result;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

module.exports = {
  init: init
};
