const knex = require('./db');
const validate = require('./validate');

const errors = require('restify-errors');

function arrayCmp(param) {
  return param.length == 1
    ? param[0]
    : knex.raw('any(?)', [param]);
}

function arrayNegCmp(param) {
  return param.length == 1
    ? param[0]
    : knex.raw('all(?)', [param]);
}

function id(id, name) {
  id.forEach(item => {
    validate.integer(item, name, true);
  });

  return arrayCmp(id);
}

function notId(id, name) {
  id.forEach(item => {
    validate.integer(item, name, true);
  });

  return arrayNegCmp(id);
}

function langCode(lang_code) {
  lang_code.forEach(item => {
    if (typeof(item) !== 'string')
      throw new errors.InvalidArgumentError('invalid non-string "lang_code" item: ' + JSON.stringify(item));
    else if (!item.match(/^[a-z]{3}$/))
      throw new errors.InvalidArgumentError(`improperly formatted "lang_code" item: ${item}`);
  });

  return arrayCmp(lang_code);
}

function langCodeLangvar(lang_code) {
  lang_code.forEach(item => {
    if (typeof(item) !== 'string')
      throw new errors.InvalidArgumentError('invalid non-string "lang_code" item: ' + JSON.stringify(item));
    else if (!item.match(/^[a-z]{3}$/))
      throw new errors.InvalidArgumentError(`improperly formatted "lang_code" item: ${item}`);
  });

  return ['in', knex('langvar').select('id').where('lang_code', arrayCmp(lang_code))];
}

function uidLangvar(uid, name) {
  uid.forEach(item => {
    if (typeof(item) !== 'string')
      throw new errors.InvalidArgumentError(`invalid non-string "${name}" item: ` + JSON.stringify(item));
    else if (!item.match(/^[a-z]{3}-\d{3}$/))
      throw new errors.InvalidArgumentError(`badly formatted "${name}" item: ${item}`);
  });

  const subselect = knex.select('uidlv.id').from('langvar uidlv').where(knex.raw('uid(uidlv.lang_code,uidlv.var_code)'), arrayCmp(uid));
  return uid.length === 1
    ? [subselect]
    : ['in', subselect];
}

function uid(uid, name) {
  uid.forEach(item => {
    if (typeof(item) !== 'string')
      throw new errors.InvalidArgumentError(`invalid non-string "${name}" item: ` + JSON.stringify(item));
    else if (!item.match(/^[a-z]{3}-\d{3}$/))
      throw new errors.InvalidArgumentError(`badly formatted "${name}" item: ${item}`);
  });

  return arrayCmp(uid);
}

function txt(txt, name) {
  txt.forEach(function(item) {
    validate.string(item, name, true);
  });

  return arrayCmp(txt);
}

function txtNFC(txt, name) {
  txt = txt.map(function(item) {
    validate.string(item, name, true);
    return item.normalize('NFC');
  });

  return arrayCmp(txt);
}

function txtDegr(txt, name) {
  txt.forEach(function(item) {
    validate.string(item, name, true);
  });

  return txt.length === 1
    ? [knex.raw('txt_degr(?)', [txt[0]])]
    : ['in', knex.select(knex.raw('txt_degr(x)')).from(knex.raw('unnest(?::text[]) as x', [txt]))];
}

function class_(class_, col1, col2, name) {
  let binary = [];
  let unary = [];

  class_.forEach(item => {
    validate.array(item, name, true);
    if (item.length !== 2) throw `elements of parameter "${name}" must be two-element arrays`;
    if (item[0] === null && item[1] === null) throw `elements of parameter "${name}" must have at least one non-null value`;
    if (item[0] !== null) validate.positiveInteger(item[0], name);

    if (item[1] === null) unary.push(item[0]);
    else {
      validate.positiveInteger(item[1], name);
      binary.push(item);
    }
  });

  if (binary.length > 1)
    binary = knex.raw('any(?::cs[])', [binary.map(classToComposite)]);
  else if (binary.length == 1)
    binary = knex.raw('?::cs', classToComposite(binary[0]));
  else binary = null;

  unary = unary.length ? arrayCmp(unary) : null;

  return function() {
    if (unary) this.orWhere(col1, unary);
    if (binary) this.orWhere(knex.raw('(??,??)', [col1,col2]), binary);
  };
}

function classToComposite(class_) {
  class_ = class_.map(function(item) {
    return item === null ? '' : item;
  });
  return `(${class_[0]},${class_[1]})`;
}

function prop(prop, col1, col2, name) {
  let binary = [];
  let unary = [];

  prop.forEach(item => {
    validate.array(item, name, true);
    if (item.length !== 2) throw `elements of parameter "${name}" must be two-element arrays`;
    validate.positiveInteger(item[0], name);

    if (item[1] === null) unary.push(item[0]);
    else {
      validate.string(item[1], name, true);
      binary.push(item);
    }
  });

  if (binary.length > 1)
    binary = knex.raw('any(?::pp[])', [binary.map(propToComposite)]);
  else if (binary.length == 1)
    binary = knex.raw('?::pp', propToComposite(binary[0]));
  else binary = null;

  unary = unary.length ? arrayCmp(unary) : null;

  return function() {
    if (unary) this.orWhere(col1, unary);
    if (binary) this.orWhere(knex.raw('(??,??)', [col1,col2]), binary);
  };
}

function propToComposite(prop) {
  prop = prop.map(function(item) {
    return item === null ? '' : item;
  });
  return `(${prop[0]},"` + prop[1].replace(/([\\"])/g, '\\$1') + '")';
}

module.exports = {
  id: id,
  notId: notId,
  langCode: langCode,
  langCodeLangvar: langCodeLangvar,
  uid: uid,
  uidLangvar: uidLangvar,
  txt: txt,
  txtNFC: txtNFC,
  txtDegr: txtDegr,
  class_: class_,
  prop: prop,
};
