const validate = require('../../lib/validate');
const knex = require('../../lib/db');

const errors = require('restify-errors');

function init(app) {
  app.apiRoute({ path: '/v2/langvar_pair', executeQuery: true }, langvar_pair);
}

function langvar_pair(req, res, next) {
  const knownQuery = req.get('knownQuery');
  let ids, uids;

  if ('ids' in req.query) {
    knownQuery.ids = true;

    validate.array(req.query.ids, 'ids', false, true);
    ids = req.query.ids;
    if (ids.length && !(ids[0] instanceof Array)) ids = [ids];
    validate.idPairs(ids, 'ids');
  }
  else ids = [];

  if ('uids' in req.query) {
    knownQuery.uids = true;

    validate.array(req.query.uids, 'uids', false, true);
    uids = req.query.uids;
    if (uids.length && !(uids[0] instanceof Array)) uids = [uids];
    validate.uidPairs(uids, 'uids');
  }
  else uids = [];

  if (ids.length + uids.length === 0)
    throw new errors.MissingParameterError('you must pass at least one langvar pair under "ids" or "uids"');
  else if (ids.length + uids.length > 500)
    throw new errors.InvalidArgumentError('you cannot specify more than 500 langvar pairs');

  req.set('q',
    knex
    .select('langvar1', 'langvar2', 'max_quality_d1', 'max_quality_d2')
    .from(knex.raw('langvar_pair_match(?,?)', [pairsToComposite(ids),pairsToComposite(uids)]))
  );

  const obj = req.get('obj');
  obj.resultType = 'langvar_pair';
  next();
}

function pairsToComposite(pairs) {
  return pairs.map(pair => `(${pair[0]},${pair[1]})`);
}

module.exports = {
  init: init,
};
