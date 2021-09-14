const query = require('../query');
const should = require('should');

describe('expr', function () {
  it('count', function (done) {
    query('/v2/expr/count', { uid: ["rus-000"] }, done,
    function (data) {
      should.exist(data.count);
      should.exist(data.countType);
      data.countType.should.equal('expr');
      done();
    });
  });

  it('get English "ideal"', function (done) {
    query('/v2/expr', { uid: ["eng-000"], txt: ["ideal"] }, done,
    function (data) {
      should.exist(data.result);
      should.exist(data.result[0]);
      data.result[0].langvar.should.equal(187);
      data.result[0].id.should.equal(441285);
      done();
    });
  });

  it('translate "ideal" into Italian', function (done) {
    query('/v2/expr', { trans_expr: [441285], uid: ["ita-000"] }, done,
    function (data) {
      should.exist(data.result);
      should.exist(data.result[0]);
      data.result[0].langvar.should.equal(304);
      data.result[0].id.should.equal(70025);
      data.result[0].trans_expr.should.equal(441285);
      done();
    });
  });

  it('url param id', function (done) {
    query('/v2/expr/441285', done,
    function (data) {
      should.exist(data.expr);
      data.expr.id.should.equal(441285);
      done();
    });
  });

  it('all params distance-1', function (done) {
    query('/v2/expr', {
        id: [1,2,3],
        include: ['trans_langvar', 'trans_path', 'trans_quality', 'trans_txt', 'trans_txt_degr', 'trans_uid', 'uid'],
        lang_code: 'ind',
        langvar: 187,
        mutable: true,
        range: ['txt', 'a', 'b'],
        trans_distance: 1,
        trans_expr: 100,
        trans_grp: 5,
        trans_langvar: 666,
        trans_quality_min: 1,
        trans_source: 0,
        trans_txt: 'blah',
        trans_txt_degr: 'foo',
        trans_uid: 'deu-000',
        txt: 'hello',
        txt_degr: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('all params distance-2a', function (done) {
    query('/v2/expr', {
        id: [1,2,3],
        include: ['trans_langvar', 'trans_path', 'trans_quality', 'trans_txt', 'trans_txt_degr', 'trans_uid', 'uid'],
        interm1_expr_langvar: 187,
        interm1_expr_uid: 'eng-000',
        interm1_grp: 5,
        interm1_source: 5,

        lang_code: 'ind',
        langvar: 187,
        mutable: true,
        range: ['txt', 'a', 'b'],
        trans_distance: 2,
        trans_expr: 100,
        trans_grp: 5,
        trans_langvar: 666,
        trans_quality_algo: 'geometric',
        trans_quality_min: 1,
        trans_source: 0,
        trans_txt: 'blah',
        trans_txt_degr: 'foo',
        trans_uid: 'deu-000',
        txt: 'hello',
        txt_degr: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

it('all params distance-2b', function (done) {
    query('/v2/expr', {
        id: [1,2,3],
        include: ['trans_langvar', 'trans_path', 'trans_quality', 'trans_txt', 'trans_txt_degr', 'trans_uid', 'uid'],
        interm1_expr_langvar: 187,
        interm1_expr_uid: 'eng-000',
        interm1_grp: 5,
        interm1_source: 5,

        lang_code: 'ind',
        langvar: 187,
        mutable: true,
        range: ['txt', 'a', 'b'],
        trans_distance: 2,
        trans_expr: 100,
        trans_grp: 5,
        trans_langvar: 666,
        trans_quality_algo: 'arithmetic',
        trans_quality_min: 1,
        trans_source: 0,
        trans_txt: 'blah',
        trans_txt_degr: 'foo',
        trans_uid: 'deu-000',
        txt: 'hello',
        txt_degr: 'something',
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/expr/5', {
        include: ['uid'],
    },
    done,
    function (data) {
      should.exist(data.expr);
      done();
    });
  });

  it('index', function (done) {
    query('/v2/expr/index', {
        uid: 'mhz-000',
        step: 250,
    },
    done,
    function (data) {
      should.exist(data.index);
      done();
    });
  });
});
