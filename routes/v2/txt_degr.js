const copyIntoTable = require('../../lib/copy_into_table');
const knex = require('../../lib/db');
const pgEscape = require('../../lib/pg_escape');
const validate = require('../../lib/validate');

const errors = require('restify-errors');
const _ = require('lodash');

const ARRAY_PARAMS = ['txt'];

function init(app) {
  app.apiRoute({ path: '/v2/txt_degr', arrayParams: ARRAY_PARAMS }, txt_degr);
}

function txt_degr(req, res, next) {
  if (!('txt' in req.query))
    return next(new errors.MissingParameterError('the parameter "txt" is required'));

  const knownQuery = req.get('knownQuery');

  knownQuery.txt = true;
  let txt = req.query.txt;
  validate.array(txt, 'txt');
  txt = _.uniq(txt).map(item => {
    validate.string(item, 'txt_degr', true);
    item = pgEscape(item);
    return item + '\t\n';
  });

  knex.transaction(trx => {
    return trx.raw('CREATE TEMP TABLE tmp_txt_degr (txt text, txt_degr text) ON COMMIT DROP')
    .then(() => {
      return copyIntoTable(trx, 'tmp_txt_degr', txt);
    }).then(() => {
      return trx('tmp_txt_degr').update('txt_degr', knex.raw('txt_degr(txt)'))
    }).then(() => {
      return trx.select('*').from('tmp_txt_degr')
    });
  }).then(rows => {
    const result = {};

    rows.forEach(row => {
      result[row.txt] = row.txt_degr;
    });

    const obj = req.get('obj');
    obj.txt_degr = result;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

module.exports = {
  init: init
};
