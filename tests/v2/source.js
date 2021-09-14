const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('source', function () {
  it('all', function (done) {
    query('/v2/source', {}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(config.limit.responseMax);
      done();
    });
  });

  it('matching by id', function (done) {
    query('/v2/source', {id: [100,101,102,3594]}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(4);
      done();
    });
  });

  it('matching by label', function (done) {
    query('/v2/source', {label: ["art-eng-mul:Wichmann"]}, done,
    function (data) {
      should.exist(data.result);
      data.result.length.should.equal(1);
      done();
    });
  });

  it('url param id', function (done) {
    query('/v2/source/3594', {}, done,
    function (data) {
      should.exist(data.source);
      data.source.label.should.equal("art-eng-mul:Wichmann");
      done();
    });
  });

  it('url param label', function (done) {
    query('/v2/source/art-eng-mul:Wichmann', {}, done,
    function (data) {
      should.exist(data.source);
      data.source.id.should.equal(3594);
      done();
    });
  });

  it('all params 1', function (done) {
    query('/v2/source', {
        expr: 100,
        format: 'mul@IA',
        grp: 50,
        id: [1,2,3],
        include: ['denotation_count', 'format', 'langvar', 'langvar_attested', 'meaning_count', 'usr'],
        label: 'art:PanLex',
        langvar: 187,
        meaning: true,
        uid: 'ind-000',
        usr: 'kamholz',
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('all params 2', function (done) {
    query('/v2/source', {
        format: 'mul@IA',
        grp: 50,
        id: [1,2,3],
        include: ['denotation_count', 'format', 'langvar', 'langvar_attested', 'meaning_count', 'usr'],
        label: 'art:PanLex',
        langvar: 187,
        meaning: true,
        trans_expr: 300,
        uid: 'ind-000',
        usr: 'kamholz',
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/source/187', {
        include: ['denotation_count', 'format', 'langvar', 'langvar_attested', 'meaning_count', 'usr'],
    },
    done,
    function (data) {
      should.exist(data.source);
      done();
    });
  });
});
